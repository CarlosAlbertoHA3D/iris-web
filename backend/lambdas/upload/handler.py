import json
import os
import uuid
import base64
import time
from datetime import datetime
import boto3

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

S3_BUCKET = os.environ['S3_BUCKET']
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']

table = dynamodb.Table(DYNAMODB_TABLE)

def lambda_handler(event, context):
    """
    Generate presigned URL for S3 upload and create metadata in DynamoDB
    """
    try:
        # Extract userId from Cognito token if authenticated
        authorizer = event.get('requestContext', {}).get('authorizer', {})
        claims = authorizer.get('claims', {})
        user_id = claims.get('sub', 'anonymous')  # Use Cognito sub (user ID) or 'anonymous'
        
        # Parse request body
        body = event.get('body', '{}')
        if isinstance(body, str):
            data = json.loads(body)
        else:
            data = body
        
        filename = data.get('filename', 'input.nii.gz')
        content_type = data.get('contentType', 'application/octet-stream')
        
        print(f"Upload request from user: {user_id}, filename: {filename}")
        
        # Generate job ID
        job_id = f"aws-{uuid.uuid4().hex[:12]}"
        timestamp = int(time.time())
        
        # S3 key for upload
        s3_key = f"uploads/{job_id}/{filename}"
        
        # Generate presigned URL for direct S3 upload from browser
        presigned_url = s3.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': S3_BUCKET,
                'Key': s3_key,
                'ContentType': content_type
            },
            ExpiresIn=3600  # URL expires in 1 hour
        )
        
        # Create metadata in DynamoDB
        table.put_item(
            Item={
                'jobId': job_id,
                'userId': user_id,
                'status': 'pending',
                'inputFile': s3_key,
                'filename': filename,
                'createdAt': timestamp,
                'updatedAt': timestamp,
                'ttl': timestamp + (90 * 24 * 60 * 60)  # 90 days TTL
            }
        )
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'ok': True,
                'jobId': job_id,
                'uploadUrl': presigned_url,
                's3Key': s3_key,
                'message': 'Presigned URL generated successfully'
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'ok': False,
                'error': str(e)
            })
        }
