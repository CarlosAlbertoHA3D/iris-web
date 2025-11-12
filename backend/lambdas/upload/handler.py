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
    Upload NIFTI/DICOM file to S3 and create metadata in DynamoDB
    """
    try:
        # Handle API Gateway event
        if event.get('isBase64Encoded'):
            body = base64.b64decode(event['body'])
        else:
            body = event['body']
        
        # Parse multipart form data (simplified - in production use multipart parser)
        # For now, assume direct binary upload or JSON with base64
        if isinstance(body, str):
            data = json.loads(body)
            file_content = base64.b64decode(data.get('file'))
            filename = data.get('filename', 'input.nii.gz')
            user_id = data.get('userId', 'anonymous')
        else:
            file_content = body
            filename = event.get('queryStringParameters', {}).get('filename', 'input.nii.gz')
            user_id = event.get('queryStringParameters', {}).get('userId', 'anonymous')
        
        # Generate job ID
        job_id = uuid.uuid4().hex[:12]
        timestamp = int(time.time())
        
        # Upload to S3
        s3_key = f"uploads/{job_id}/{filename}"
        s3.put_object(
            Bucket=S3_BUCKET,
            Key=s3_key,
            Body=file_content,
            ContentType='application/octet-stream'
        )
        
        # Create metadata in DynamoDB
        table.put_item(
            Item={
                'jobId': job_id,
                'userId': user_id,
                'status': 'uploaded',
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
                's3Key': s3_key,
                'message': 'File uploaded successfully'
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
