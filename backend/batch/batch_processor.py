#!/usr/bin/env python3
"""
AWS Batch processor for TotalSegmentator
Processes NIFTI and DICOM files, generates 3D meshes, and uploads to S3
"""

import os
import sys
import json
import time
import shutil
import subprocess
import tempfile
from pathlib import Path
from typing import Dict, Any

import boto3
import nibabel as nib
import numpy as np

try:
    import pydicom
    HAS_PYDICOM = True
except ImportError:
    HAS_PYDICOM = False
    print("[batch] WARNING: pydicom not installed, DICOM metadata detection disabled")

from mesh_processing import (
    mask_to_mesh,
    export_obj_with_submeshes,
)

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

# Get environment variables
JOB_ID = os.environ.get('JOB_ID')
S3_BUCKET = os.environ.get('S3_BUCKET')
S3_INPUT_KEY = os.environ.get('S3_INPUT_KEY')
S3_OUTPUT_PREFIX = os.environ.get('S3_OUTPUT_PREFIX')
DYNAMODB_TABLE = os.environ.get('DYNAMODB_TABLE')
DEVICE = os.environ.get('DEVICE', 'gpu')
FAST = os.environ.get('FAST', 'true').lower() == 'true'
REDUCTION_PERCENT = int(os.environ.get('REDUCTION_PERCENT', '90'))
TASK_OVERRIDE = os.environ.get('TASK_OVERRIDE', '')  # Force specific task if set


# TotalSegmentator task selection based on DICOM metadata
DENTAL_MANUFACTURERS = ['planmeca', 'sirona', 'carestream', 'dentsply', 'vatech', 'newtom', 'soredex', 'morita', 'kavo']
DENTAL_KEYWORDS = ['dental', 'diente', 'dientes', 'teeth', 'tooth', 'maxil', 'mandibu', 'jaw', 'oral', 'cbct', 'cone beam', 'panoram']
HEAD_NECK_KEYWORDS = ['head', 'neck', 'cabeza', 'cuello', 'craneal', 'cranium', 'skull', 'face', 'facial', 'sinus', 'orbit']


def detect_totalsegmentator_task(dicom_path: Path) -> str:
    """
    Detect the appropriate TotalSegmentator task based on DICOM metadata.
    Returns task name: 'teeth', 'total', 'total_mr', 'face', etc.
    """
    if not HAS_PYDICOM:
        print("[batch] pydicom not available, defaulting to 'total' task")
        return 'total'
    
    try:
        # Read DICOM metadata (first 16KB is enough for headers)
        ds = pydicom.dcmread(str(dicom_path), stop_before_pixels=True, force=True)
        
        # Extract relevant fields
        manufacturer = getattr(ds, 'Manufacturer', '').lower()
        modality = getattr(ds, 'Modality', 'CT').upper()
        body_part = getattr(ds, 'BodyPartExamined', '').lower()
        study_desc = getattr(ds, 'StudyDescription', '').lower()
        series_desc = getattr(ds, 'SeriesDescription', '').lower()
        protocol = getattr(ds, 'ProtocolName', '').lower()
        
        print(f"[batch] DICOM Metadata:")
        print(f"[batch]   Manufacturer: {manufacturer}")
        print(f"[batch]   Modality: {modality}")
        print(f"[batch]   Body Part: {body_part}")
        print(f"[batch]   Study Desc: {study_desc}")
        print(f"[batch]   Series Desc: {series_desc}")
        print(f"[batch]   Protocol: {protocol}")
        
        # Combine all text fields for keyword search
        all_text = f"{manufacturer} {body_part} {study_desc} {series_desc} {protocol}"
        
        # Check for MRI modality first
        if modality == 'MR':
            print("[batch] Detected MRI modality -> task 'total_mr'")
            return 'total_mr'
        
        # Check for dental CT (manufacturer or keywords)
        is_dental_manufacturer = any(dm in manufacturer for dm in DENTAL_MANUFACTURERS)
        has_dental_keyword = any(kw in all_text for kw in DENTAL_KEYWORDS)
        
        if is_dental_manufacturer or has_dental_keyword:
            print(f"[batch] Detected DENTAL CT (manufacturer={is_dental_manufacturer}, keyword={has_dental_keyword}) -> task 'teeth'")
            return 'teeth'
        
        # Check for head/neck CT (could use face or head_neck tasks in future)
        has_head_keyword = any(kw in all_text for kw in HEAD_NECK_KEYWORDS)
        if has_head_keyword or body_part in ['head', 'neck', 'skull']:
            # For now, use 'total' but log for future optimization
            print(f"[batch] Detected HEAD/NECK CT -> task 'total' (head_neck task could be used)")
            return 'total'
        
        # Default to total body segmentation
        print("[batch] No specific region detected -> task 'total'")
        return 'total'
        
    except Exception as e:
        print(f"[batch] Error reading DICOM metadata: {e}")
        print("[batch] Defaulting to 'total' task")
        return 'total'


def update_job_status(status: str, message: str = None, error: str = None, artifacts: Dict = None):
    """Update job status in DynamoDB"""
    try:
        table = dynamodb.Table(DYNAMODB_TABLE)
        update_expr = 'SET #status = :status, updatedAt = :now'
        expr_values = {
            ':status': status,
            ':now': int(time.time())
        }
        expr_names = {'#status': 'status'}
        
        if status == 'processing':
            update_expr += ', startedAt = :now'
        elif status == 'completed':
            update_expr += ', completedAt = :now'
            if artifacts:
                update_expr += ', artifacts = :artifacts'
                expr_values[':artifacts'] = artifacts
        elif status == 'failed':
            if error:
                update_expr += ', errorMessage = :error'
                expr_values[':error'] = error
        
        if message:
            update_expr += ', message = :message'
            expr_values[':message'] = message
        
        table.update_item(
            Key={'jobId': JOB_ID},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values
        )
        print(f"[batch] Updated job status to: {status}")
    except Exception as e:
        print(f"[batch] Error updating DynamoDB: {e}")


def create_combined_label_map(seg_dir: Path, output_path: Path) -> Dict[str, int]:
    """Combines individual NIFTI masks into a single label map and returns name->id map"""
    print("[batch] Creating combined label map...")
    label_map = {}
    try:
        nii_files = sorted([p for p in seg_dir.glob('*.nii*')])
        if not nii_files: return {}
        
        # Load reference image info
        ref = nib.load(str(nii_files[0]))
        combined = np.zeros(ref.shape, dtype=np.uint8)
        affine = ref.affine
        
        for i, nii in enumerate(nii_files):
             name = nii.name.replace('.nii.gz', '').replace('.nii', '')
             label_id = i + 1
             label_map[name] = label_id
             
             # Load mask data
             data = nib.load(str(nii)).get_fdata()
             combined[data > 0.5] = label_id
             
        # Save combined
        new_img = nib.Nifti1Image(combined, affine)
        nib.save(new_img, str(output_path))
        print(f"[batch] Created combined label map with {len(label_map)} structures")
        return label_map
    except Exception as e:
        print(f"[batch] Error creating label map: {e}")
        return {}


def main():
    """Main processing function"""
    print(f"[batch] Starting job {JOB_ID}")
    print(f"[batch] Input: s3://{S3_BUCKET}/{S3_INPUT_KEY}")
    print(f"[batch] Output: s3://{S3_BUCKET}/{S3_OUTPUT_PREFIX}")
    
    # Update status to processing
    update_job_status('processing', 'AI is processing your study...')
    
    try:
        # Create temporary directory
        with tempfile.TemporaryDirectory() as tmpdir:
            work_dir = Path(tmpdir)
            seg_dir = work_dir / 'segmentations'
            output_dir = work_dir / 'output'
            
            seg_dir.mkdir(parents=True, exist_ok=True)
            output_dir.mkdir(parents=True, exist_ok=True)
            
            # Download input from S3 preserving original filename
            original_filename = Path(S3_INPUT_KEY).name
            download_path = work_dir / original_filename
            
            print(f"[batch] Downloading input file: {original_filename}")
            s3.download_file(S3_BUCKET, S3_INPUT_KEY, str(download_path))
            print(f"[batch] Downloaded {download_path.stat().st_size / 1024 / 1024:.1f} MB")
            
            # Check if input is DICOM - convert to NIfTI using dcm2niix
            # dcm2niix is more robust than TotalSegmentator's internal dicom2nifti
            name_lower = original_filename.lower()
            is_dicom = name_lower.endswith('.dcm') or name_lower.endswith('.dicom')
            
            # Detect appropriate TotalSegmentator task based on DICOM metadata
            detected_task = 'total'
            
            if is_dicom:
                print(f"[batch] DICOM file detected, analyzing metadata...")
                detected_task = detect_totalsegmentator_task(download_path)
                
                print(f"[batch] Converting to NIfTI with dcm2niix...")
                dicom_dir = work_dir / 'dicom_input'
                nifti_dir = work_dir / 'nifti_output'
                dicom_dir.mkdir(parents=True, exist_ok=True)
                nifti_dir.mkdir(parents=True, exist_ok=True)
                
                # Copy DICOM to input directory
                shutil.copy2(download_path, dicom_dir / original_filename)
                
                # Run dcm2niix to convert DICOM to NIfTI
                dcm2niix_cmd = [
                    'dcm2niix',
                    '-z', 'y',           # Compress output (.nii.gz)
                    '-f', 'converted',   # Output filename
                    '-o', str(nifti_dir),
                    str(dicom_dir)
                ]
                print(f"[batch] Running: {' '.join(dcm2niix_cmd)}")
                dcm_result = subprocess.run(dcm2niix_cmd, capture_output=True, text=True)
                print(dcm_result.stdout)
                if dcm_result.stderr:
                    print(f"[batch] dcm2niix stderr: {dcm_result.stderr}")
                
                # Find the converted NIfTI file
                nifti_files = list(nifti_dir.glob('*.nii.gz')) + list(nifti_dir.glob('*.nii'))
                if not nifti_files:
                    raise RuntimeError(f"dcm2niix failed to convert DICOM. Output: {dcm_result.stderr}")
                
                converted_nifti = nifti_files[0]
                print(f"[batch] Converted to NIfTI: {converted_nifti.name}")
                
                # Reorient to RAS (canonical orientation) for TotalSegmentator
                # This ensures consistent orientation regardless of DICOM source
                print(f"[batch] Reorienting to RAS (canonical orientation)...")
                img = nib.load(str(converted_nifti))
                canonical_img = nib.as_closest_canonical(img)
                
                # Check current orientation
                orig_ornt = nib.orientations.io_orientation(img.affine)
                new_ornt = nib.orientations.io_orientation(canonical_img.affine)
                orig_axcodes = nib.orientations.ornt2axcodes(orig_ornt)
                new_axcodes = nib.orientations.ornt2axcodes(new_ornt)
                print(f"[batch] Orientation: {orig_axcodes} -> {new_axcodes}")
                
                # Save reoriented image
                reoriented_path = nifti_dir / 'reoriented.nii.gz'
                nib.save(canonical_img, str(reoriented_path))
                input_path = reoriented_path
                print(f"[batch] Saved reoriented NIfTI: {input_path.name}")
            else:
                input_path = download_path
            
            # Determine final task (env override takes precedence)
            final_task = TASK_OVERRIDE if TASK_OVERRIDE else detected_task
            print(f"[batch] Using TotalSegmentator task: '{final_task}'")
            
            # Run TotalSegmentator with appropriate task
            cmd = [
                'TotalSegmentator',
                '-i', str(input_path),
                '-o', str(seg_dir),
                '--nr_thr_resamp', '1',  # Reduce memory usage
                '--nr_thr_saving', '1',  # Reduce memory usage
            ]
            
            # Add task-specific options
            if final_task != 'total':
                cmd.extend(['--task', final_task])
            
            if DEVICE == 'cpu':
                os.environ['CUDA_VISIBLE_DEVICES'] = ''
            else:
                cmd.extend(['-d', 'gpu'])  # Explicitly use GPU
            
            # Fast mode only for 'total' task (other tasks may not support it or it's not beneficial)
            if FAST and final_task == 'total':
                cmd.append('--fast')
            
            print(f"[batch] Running TotalSegmentator: {' '.join(cmd)}")
            start_time = time.time()
            
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            print(result.stdout)
            
            elapsed = time.time() - start_time
            print(f"[batch] TotalSegmentator completed in {elapsed:.1f}s")
            
            # Create combined label map for 2D overlay
            label_map_path = output_dir / 'segmentations.nii.gz'
            label_map_dict = create_combined_label_map(seg_dir, label_map_path)

            # Convert segmentations to meshes
            print("[batch] Converting segmentations to 3D meshes...")
            nii_files = sorted([p for p in seg_dir.glob('*.nii*') if p.is_file()])
            print(f"[batch] Found {len(nii_files)} segmentation files")
            
            meshes = []
            names = []
            
            for i, nii in enumerate(nii_files):
                name = nii.name.replace('.nii.gz', '').replace('.nii', '')
                print(f"[batch] Processing {i+1}/{len(nii_files)}: {name}")
                
                mesh = mask_to_mesh(nii)
                if mesh is None:
                    print(f"[batch] Skipping {name} (empty mesh)")
                    continue
                
                # Note: Decimation and smoothing are already handled inside mask_to_mesh -> clean_mesh
                
                meshes.append(mesh)
                names.append(name)
            
            if not meshes:
                raise ValueError("No valid meshes generated from segmentations")
            
            print(f"[batch] Exporting {len(meshes)} meshes to OBJ format...")
            obj_path, mtl_path, json_path = export_obj_with_submeshes(meshes, names, output_dir, label_map=label_map_dict)
            
            # Create zip archive (using zipfile directly to support ZIP64)
            import zipfile
            print("[batch] Creating zip archive...")
            zip_path = output_dir / 'result.zip'
            with zipfile.ZipFile(str(zip_path), 'w', zipfile.ZIP_DEFLATED, allowZip64=True) as zf:
                zf.write(obj_path, 'Result.obj')
                zf.write(mtl_path, 'materials.mtl')
                zf.write(json_path, 'Result.json')
                if label_map_path.exists():
                    zf.write(label_map_path, 'segmentations.nii.gz')
            
            # Upload results to S3
            print("[batch] Uploading results to S3...")
            artifacts = {}
            
            for local_path, artifact_name in [
                (obj_path, 'Result.obj'),
                (mtl_path, 'materials.mtl'),
                (json_path, 'Result.json'),
                (zip_path, 'result.zip'),
                (label_map_path, 'segmentations.nii.gz')
            ]:
                if not local_path.exists(): continue

                s3_key = f"{S3_OUTPUT_PREFIX}{artifact_name}"
                file_size = Path(local_path).stat().st_size / 1024 / 1024
                print(f"[batch] Uploading {artifact_name} ({file_size:.1f} MB)...")
                
                s3.upload_file(str(local_path), S3_BUCKET, s3_key)
                artifacts[artifact_name.split('.')[0]] = f"s3://{S3_BUCKET}/{s3_key}"
            
            print(f"[batch] All artifacts uploaded successfully")
            
            # Update DynamoDB with completion status
            update_job_status('completed', '3D models ready to view', artifacts=artifacts)
            
            print(f"[batch] Job {JOB_ID} completed successfully!")
            return 0
            
    except subprocess.CalledProcessError as e:
        error_msg = f"TotalSegmentator failed: {e.stderr}"
        print(f"[batch] ERROR: {error_msg}")
        update_job_status('failed', error=error_msg)
        return 1
        
    except Exception as e:
        error_msg = f"Processing failed: {str(e)}"
        print(f"[batch] ERROR: {error_msg}")
        import traceback
        traceback.print_exc()
        update_job_status('failed', error=error_msg)
        return 1


if __name__ == '__main__':
    sys.exit(main())
