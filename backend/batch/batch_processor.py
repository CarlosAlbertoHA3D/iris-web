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
            # TotalSegmentator supports both NIfTI and DICOM formats natively
            original_filename = Path(S3_INPUT_KEY).name
            input_path = work_dir / original_filename
            
            print(f"[batch] Downloading input file: {original_filename}")
            s3.download_file(S3_BUCKET, S3_INPUT_KEY, str(input_path))
            print(f"[batch] Downloaded {input_path.stat().st_size / 1024 / 1024:.1f} MB")
            
            # Run TotalSegmentator
            cmd = [
                'TotalSegmentator',
                '-i', str(input_path),
                '-o', str(seg_dir),
            ]
            
            if DEVICE == 'cpu':
                os.environ['CUDA_VISIBLE_DEVICES'] = ''
            
            if FAST:
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
