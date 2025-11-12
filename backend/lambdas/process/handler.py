import json
import os
import time
import boto3
from typing import Dict, Any

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
sagemaker_runtime = boto3.client('sagemaker-runtime')

S3_BUCKET = os.environ['S3_BUCKET']
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
SAGEMAKER_ENDPOINT_NAME = os.environ['SAGEMAKER_ENDPOINT_NAME']

table = dynamodb.Table(DYNAMODB_TABLE)

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
        
        # Update status to processing
        table.update_item(
            Key={'jobId': job_id},
            UpdateExpression='SET #status = :status, updatedAt = :now',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': 'processing',
                ':now': int(time.time())
            }
        )
        
        # Prepare payload for SageMaker
        payload = {
            'jobId': job_id,
            's3_bucket': S3_BUCKET,
            's3_input_key': input_s3_key,
            's3_output_prefix': f'results/{job_id}/',
            'device': device,
            'fast': fast,
            'reduction_percent': reduction_percent
        }
        
        # Invoke SageMaker endpoint asynchronously
        # Note: We use async invocation to handle long-running inference
        start_time = time.time()
        
        try:
            response = sagemaker_runtime.invoke_endpoint_async(
                EndpointName=SAGEMAKER_ENDPOINT_NAME,
                InputLocation=f's3://{S3_BUCKET}/sagemaker-inputs/{job_id}/payload.json',
                ContentType='application/json'
            )
            
            # Save payload to S3 for async invocation
            s3.put_object(
                Bucket=S3_BUCKET,
                Key=f'sagemaker-inputs/{job_id}/payload.json',
                Body=json.dumps(payload),
                ContentType='application/json'
            )
            
            output_location = response.get('OutputLocation', '')
            
            # Update DynamoDB with processing info
            table.update_item(
                Key={'jobId': job_id},
                UpdateExpression='SET sagemakerOutputLocation = :loc, processingStartedAt = :start',
                ExpressionAttributeValues={
                    ':loc': output_location,
                    ':start': int(start_time)
                }
            )
            
            return {
                'statusCode': 202,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({
                    'ok': True,
                    'jobId': job_id,
                    'status': 'processing',
                    'message': 'Processing started on SageMaker GPU endpoint'
                })
            }
            
        except Exception as sage_error:
            # If async endpoint is not available, fall back to synchronous invocation
            # (though this might timeout for long processing)
            print(f"Async invocation failed, trying synchronous: {sage_error}")
            
            response = sagemaker_runtime.invoke_endpoint(
                EndpointName=SAGEMAKER_ENDPOINT_NAME,
                ContentType='application/json',
                Body=json.dumps(payload)
            )
            
            result = json.loads(response['Body'].read().decode())
            elapsed = time.time() - start_time
            
            # Update DynamoDB with results
            table.update_item(
                Key={'jobId': job_id},
                UpdateExpression='SET #status = :status, artifacts = :artifacts, elapsedSec = :elapsed, updatedAt = :now',
                ExpressionAttributeNames={'#status': 'status'},
                ExpressionAttributeValues={
                    ':status': 'completed',
                    ':artifacts': result.get('artifacts', {}),
                    ':elapsed': round(elapsed, 1),
                    ':now': int(time.time())
                }
            )
            
            return {
                'statusCode': 200,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({
                    'ok': True,
                    'jobId': job_id,
                    'elapsedSec': round(elapsed, 1),
                    'artifacts': result.get('artifacts', {})
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
