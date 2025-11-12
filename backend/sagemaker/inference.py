#!/usr/bin/env python3
"""
SageMaker inference script for TotalSegmentator with GPU
"""

import io
import os
import sys
import json
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
    get_system_for_subobject,
    get_color_for_subobject
)

s3 = boto3.client('s3')

def model_fn(model_dir):
    """
    Load the model. For TotalSegmentator, the model is downloaded on first use.
    """
    print("Model initialized. TotalSegmentator will download weights on first use.")
    return {"ready": True}


def input_fn(request_body, request_content_type):
    """
    Parse input data
    """
    if request_content_type == 'application/json':
        return json.loads(request_body)
    else:
        raise ValueError(f"Unsupported content type: {request_content_type}")


def predict_fn(input_data: Dict[str, Any], model):
    """
    Run TotalSegmentator inference and generate meshes
    """
    job_id = input_data.get('jobId')
    s3_bucket = input_data.get('s3_bucket')
    s3_input_key = input_data.get('s3_input_key')
    s3_output_prefix = input_data.get('s3_output_prefix')
    device = input_data.get('device', 'gpu')
    fast = input_data.get('fast', True)
    reduction_percent = input_data.get('reduction_percent', 90)
    
    print(f"Processing job {job_id}")
    
    # Create temporary directory
    with tempfile.TemporaryDirectory() as tmpdir:
        work_dir = Path(tmpdir)
        input_path = work_dir / 'input.nii.gz'
        seg_dir = work_dir / 'segmentations'
        output_dir = work_dir / 'output'
        
        seg_dir.mkdir(parents=True, exist_ok=True)
        output_dir.mkdir(parents=True, exist_ok=True)
        
        # Download input from S3
        print(f"Downloading {s3_input_key} from S3")
        s3.download_file(s3_bucket, s3_input_key, str(input_path))
        
        # Run TotalSegmentator
        cmd = [
            'TotalSegmentator',
            '-i', str(input_path),
            '-o', str(seg_dir),
        ]
        
        if device == 'cpu':
            os.environ['CUDA_VISIBLE_DEVICES'] = ''
        
        if fast:
            cmd.append('--fast')
        
        print(f"Running: {' '.join(cmd)}")
        
        try:
            result = subprocess.run(cmd, check=True, capture_output=True, text=True)
            print(result.stdout)
        except subprocess.CalledProcessError as e:
            print(f"TotalSegmentator failed: {e}")
            print(e.stderr)
            raise
        
        # Convert segmentations to meshes
        print("Converting segmentations to meshes")
        nii_files = sorted([p for p in seg_dir.glob('*.nii*') if p.is_file()])
        
        meshes = []
        names = []
        
        for nii in nii_files:
            name = nii.name.replace('.nii.gz', '').replace('.nii', '')
            mesh = mask_to_mesh(nii)
            
            if mesh is None:
                continue
            
            # Decimate
            if reduction_percent and reduction_percent > 0:
                tri_count = len(np.asarray(mesh.triangles))
                target_tri = max(100, int(tri_count * (1.0 - reduction_percent/100.0)))
                try:
                    mesh = mesh.simplify_quadric_decimation(target_number_of_triangles=target_tri)
                except Exception as e:
                    print(f"Decimation failed for {name}: {e}")
            
            meshes.append(mesh)
            names.append(name)
        
        if not meshes:
            raise ValueError("No meshes generated from segmentations")
        
        # Export meshes
        print(f"Exporting {len(meshes)} meshes")
        obj_path, mtl_path, json_path = export_obj_with_submeshes(meshes, names, output_dir)
        
        # Create zip archive
        zip_path = shutil.make_archive(str(output_dir / 'result'), 'zip', root_dir=str(output_dir))
        
        # Upload results to S3
        print("Uploading results to S3")
        
        artifacts = {}
        
        for local_path, artifact_name in [
            (obj_path, 'Result.obj'),
            (mtl_path, 'materials.mtl'),
            (json_path, 'Result.json'),
            (zip_path, 'result.zip')
        ]:
            s3_key = f"{s3_output_prefix}{artifact_name}"
            s3.upload_file(str(local_path), s3_bucket, s3_key)
            artifacts[artifact_name.split('.')[0]] = f"/files/{job_id}/{artifact_name}"
        
        print(f"Job {job_id} completed successfully")
        
        return {
            'ok': True,
            'jobId': job_id,
            'artifacts': artifacts
        }


def output_fn(prediction, response_content_type):
    """
    Serialize the prediction result
    """
    if response_content_type == 'application/json':
        return json.dumps(prediction)
    else:
        raise ValueError(f"Unsupported response content type: {response_content_type}")
