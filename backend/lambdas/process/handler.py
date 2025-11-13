import json
import os
import time
import boto3
from typing import Dict, Any

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
sagemaker_runtime = boto3.client('sagemaker-runtime')
lambda_client = boto3.client('lambda')

S3_BUCKET = os.environ['S3_BUCKET']
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
SAGEMAKER_ENDPOINT_NAME = os.environ['SAGEMAKER_ENDPOINT_NAME']
SAGEMAKER_MANAGER_FUNCTION = os.environ.get('SAGEMAKER_MANAGER_FUNCTION', 'iris-sagemaker-manager')

table = dynamodb.Table(DYNAMODB_TABLE)


def trigger_endpoint_wake():
    """
    Trigger SageMaker endpoint wake-up asynchronously
    Does not wait for completion (may take 5-10 minutes)
    """
    print("Triggering SageMaker endpoint wake-up (async)...")
    
    try:
        # Invoke wake function asynchronously (Event type doesn't wait for response)
        response = lambda_client.invoke(
            FunctionName=SAGEMAKER_MANAGER_FUNCTION,
            InvocationType='Event',  # Async invocation
            Payload=json.dumps({'action': 'wake'})
        )
        
        print(f"Wake trigger sent. StatusCode: {response['StatusCode']}")
        return response['StatusCode'] == 202
            
    except Exception as e:
        print(f"Error triggering endpoint wake: {e}")
        return False

def lambda_handler(event, context):
    """
    Process uploaded file using SageMaker endpoint (TotalSegmentator on GPU)
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
        
        # Trigger SageMaker endpoint wake-up asynchronously
        # This will create the endpoint if it doesn't exist (5-10 min) but doesn't wait
        print(f"Triggering SageMaker endpoint wake-up...")
        trigger_endpoint_wake()
        
        # Update status to queued (will be processed when endpoint is ready)
        table.update_item(
            Key={'jobId': job_id},
            UpdateExpression='SET #status = :status, queuedAt = :now, updatedAt = :now',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'queued',
                ':now': int(time.time())
            }
        )
        
        # Save processing parameters to DynamoDB for later use
        table.update_item(
            Key={'jobId': job_id},
            UpdateExpression='SET processingParams = :params',
            ExpressionAttributeValues={
                ':params': {
                    'device': device,
                    'fast': fast,
                    'reduction_percent': reduction_percent,
                    's3_input_key': input_s3_key,
                    's3_output_prefix': f'results/{job_id}/'
                }
            }
        )
        
        # Return immediately - processing will happen asynchronously
        # The actual SageMaker invocation will be triggered by a separate process
        # once the endpoint is ready
        return {
            'statusCode': 202,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'ok': True,
                'jobId': job_id,
                'status': 'queued',
                'message': 'Job queued for processing. Endpoint is waking up (5-10 min first time, then processing takes 10-15 min).',
                'estimatedTime': '15-25 minutes for first job, 10-15 minutes for subsequent jobs'
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
