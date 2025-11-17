import json
import os
import time
from typing import Dict, Any

import boto3

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
batch_client = boto3.client('batch')

S3_BUCKET = os.environ['S3_BUCKET']
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
BATCH_JOB_QUEUE = os.environ['BATCH_JOB_QUEUE']
BATCH_JOB_DEFINITION = os.environ['BATCH_JOB_DEFINITION']

table = dynamodb.Table(DYNAMODB_TABLE)


def submit_batch_job(job_id: str, s3_input_key: str, device: str, fast: bool, reduction_percent: int) -> str:
    """Submit job to AWS Batch and return Batch job ID"""
    print(f"[process] Submitting Batch job for {job_id}...")
    
    response = batch_client.submit_job(
        jobName=f"totalseg-{job_id}",
        jobQueue=BATCH_JOB_QUEUE,
        jobDefinition=BATCH_JOB_DEFINITION,
        containerOverrides={
            'environment': [
                {'name': 'JOB_ID', 'value': job_id},
                {'name': 'S3_BUCKET', 'value': S3_BUCKET},
                {'name': 'S3_INPUT_KEY', 'value': s3_input_key},
                {'name': 'S3_OUTPUT_PREFIX', 'value': f'results/{job_id}/'},
                {'name': 'DEVICE', 'value': device},
                {'name': 'FAST', 'value': str(fast).lower()},
                {'name': 'REDUCTION_PERCENT', 'value': str(reduction_percent)},
                {'name': 'DYNAMODB_TABLE', 'value': DYNAMODB_TABLE}
            ]
        },
        tags={
            'JobId': job_id,
            'Application': 'iris-oculus'
        }
    )
    
    batch_job_id = response['jobId']
    print(f"[process] Batch job submitted: {batch_job_id}")
    return batch_job_id

def lambda_handler(event, context):
    """
    Process uploaded file using AWS Batch (TotalSegmentator on GPU Spot instances)
    """
    try:
        # Parse request
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        job_id = body.get('jobId')
        device = body.get('device', 'gpu')
        fast = body.get('fast', True)
        reduction_percent = body.get('reduction_percent', 90)
        
        if not job_id:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'ok': False, 'error': 'jobId is required'})
            }
        
        # Get job metadata from DynamoDB
        response = table.get_item(Key={'jobId': job_id})
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'ok': False, 'error': 'Job not found'})
            }
        
        job = response['Item']
        input_s3_key = job.get('inputFile')
        
        if not input_s3_key:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'ok': False, 'error': 'Input file not found'})
            }
        
        # Submit job to AWS Batch
        batch_job_id = submit_batch_job(job_id, input_s3_key, device, fast, reduction_percent)
        
        # Save expected artifact paths to DynamoDB
        expected_artifacts = {
            'obj': f's3://{S3_BUCKET}/results/{job_id}/Result.obj',
            'mtl': f's3://{S3_BUCKET}/results/{job_id}/materials.mtl',
            'json': f's3://{S3_BUCKET}/results/{job_id}/Result.json',
            'zip': f's3://{S3_BUCKET}/results/{job_id}/result.zip'
        }
        
        # Update status to queued with Batch job ID
        table.update_item(
            Key={'jobId': job_id},
            UpdateExpression='SET #status = :status, queuedAt = :now, updatedAt = :now, batchJobId = :batchId, expectedArtifacts = :artifacts',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'queued',
                ':now': int(time.time()),
                ':batchId': batch_job_id,
                ':artifacts': expected_artifacts
            }
        )
        
        # Return immediately - Batch will process asynchronously
        return {
            'statusCode': 202,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'ok': True,
                'jobId': job_id,
                'batchJobId': batch_job_id,
                'status': 'queued',
                'message': 'Job submitted to GPU processing queue (Spot instance, 3-5 min startup + 10-15 min processing)',
                'estimatedTime': '13-20 minutes total'
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        
        # Update job status to failed
        if job_id:
            try:
                table.update_item(
                    Key={'jobId': job_id},
                    UpdateExpression='SET #status = :status, errorMessage = :error, updatedAt = :now',
                    ExpressionAttributeNames={'#status': 'status'},
                    ExpressionAttributeValues={
                        ':status': 'failed',
                        ':error': str(e),
                        ':now': int(time.time())
                    }
                )
            except:
                pass
        
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'ok': False,
                'error': str(e)
            })
        }
