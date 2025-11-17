import json
import os
import time

import boto3


sagemaker_runtime = boto3.client('sagemaker-runtime')
lambda_client = boto3.client('lambda')
dynamodb = boto3.resource('dynamodb')

DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
S3_BUCKET = os.environ['S3_BUCKET']
SAGEMAKER_ENDPOINT_NAME = os.environ['SAGEMAKER_ENDPOINT_NAME']
SAGEMAKER_MANAGER_FUNCTION = os.environ.get('SAGEMAKER_MANAGER_FUNCTION', 'iris-sagemaker-manager')
MIN_IDLE_MINUTES = int(os.environ.get('MIN_IDLE_MINUTES', '5'))

metadata_table = dynamodb.Table(DYNAMODB_TABLE)


def _trigger_endpoint_sleep():
    """Fire-and-forget request so the manager can evaluate auto-sleep."""
    try:
        lambda_client.invoke(
            FunctionName=SAGEMAKER_MANAGER_FUNCTION,
            InvocationType='Event',
            Payload=json.dumps({
                'action': 'sleep',
                'min_idle_minutes': MIN_IDLE_MINUTES
            })
        )
    except Exception as exc:
        print(f"[run-job] Warning: failed to trigger endpoint sleep: {exc}")


def lambda_handler(event, _context):
    """Invoke the SageMaker endpoint to process a queued job."""
    print(f"[run-job] event payload: {json.dumps(event)}")

    job_id = event.get('jobId')
    if not job_id:
        raise ValueError('jobId is required')

    # Load job metadata
    job_resp = metadata_table.get_item(Key={'jobId': job_id})
    if 'Item' not in job_resp:
        raise ValueError(f"Job {job_id} not found in metadata table")

    job = job_resp['Item']
    params = job.get('processingParams')
    if not params:
        raise ValueError(f"Job {job_id} missing processingParams")

    # Normalize S3 input location
    s3_bucket = S3_BUCKET
    s3_input_key = params.get('s3_input_key')
    if not s3_input_key:
        raise ValueError(f"Job {job_id} missing s3_input_key")

    if s3_input_key.startswith('s3://'):
        bucket_key = s3_input_key.replace('s3://', '').split('/', 1)
        if len(bucket_key) != 2:
            raise ValueError(f"Invalid s3_input_key format for job {job_id}: {s3_input_key}")
        s3_bucket, s3_input_key = bucket_key

    payload = {
        'jobId': job_id,
        's3_bucket': s3_bucket,
        's3_input_key': s3_input_key,
        's3_output_prefix': params.get('s3_output_prefix', f'results/{job_id}/'),
        'device': params.get('device', 'gpu'),
        'fast': params.get('fast', True),
        'reduction_percent': params.get('reduction_percent', 90),
    }

    metadata_table.update_item(
        Key={'jobId': job_id},
        UpdateExpression='SET #status = :status, startedAt = :now, updatedAt = :now',
        ExpressionAttributeNames={'#status': 'status'},
        ExpressionAttributeValues={
            ':status': 'processing',
            ':now': int(time.time())
        }
    )

    try:
        response = sagemaker_runtime.invoke_endpoint(
            EndpointName=SAGEMAKER_ENDPOINT_NAME,
            ContentType='application/json',
            Body=json.dumps(payload)
        )

        result_body = response['Body'].read().decode('utf-8')
        print(f"[run-job] Raw response: {result_body}")
        result = json.loads(result_body or '{}')

        artifacts = result.get('s3_artifacts') or {}

        metadata_table.update_item(
            Key={'jobId': job_id},
            UpdateExpression='SET #status = :status, artifacts = :artifacts, completedAt = :now, updatedAt = :now',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'completed',
                ':artifacts': artifacts,
                ':now': int(time.time())
            }
        )

        print(f"[run-job] Job {job_id} completed successfully")

        _trigger_endpoint_sleep()

        return {
            'statusCode': 200,
            'body': json.dumps({'ok': True, 'jobId': job_id, 'artifacts': artifacts})
        }

    except Exception as exc:
        print(f"[run-job] Error invoking endpoint for job {job_id}: {exc}")

        metadata_table.update_item(
            Key={'jobId': job_id},
            UpdateExpression='SET #status = :status, errorMessage = :error, updatedAt = :now',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'failed',
                ':error': str(exc),
                ':now': int(time.time())
            }
        )

        _trigger_endpoint_sleep()

        return {
            'statusCode': 500,
            'body': json.dumps({'ok': False, 'jobId': job_id, 'error': str(exc)})
        }
