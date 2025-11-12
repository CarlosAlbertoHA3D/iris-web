import json
import os
import boto3
import base64

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')

S3_BUCKET = os.environ['S3_BUCKET']
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']

table = dynamodb.Table(DYNAMODB_TABLE)

def lambda_handler(event, context):
    """
    Download processed files from S3
    """
    try:
        # Extract path parameters
        path_params = event.get('pathParameters', {})
        job_id = path_params.get('jobId')
        filename = path_params.get('filename')
        
        if not job_id or not filename:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'ok': False, 'error': 'jobId and filename are required'})
            }
        
        # Verify job exists in DynamoDB
        response = table.get_item(Key={'jobId': job_id})
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'ok': False, 'error': 'Job not found'})
            }
        
        # Construct S3 key
        s3_key = f'results/{job_id}/{filename}'
        
        try:
            # Get file from S3
            s3_response = s3.get_object(Bucket=S3_BUCKET, Key=s3_key)
            file_content = s3_response['Body'].read()
            content_type = s3_response.get('ContentType', 'application/octet-stream')
            
            # Return file as base64 encoded (required for API Gateway)
            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': content_type,
                    'Content-Disposition': f'attachment; filename="{filename}"',
                    'Access-Control-Allow-Origin': '*'
                },
                'isBase64Encoded': True,
                'body': base64.b64encode(file_content).decode('utf-8')
            }
            
        except s3.exceptions.NoSuchKey:
            return {
                'statusCode': 404,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'ok': False, 'error': 'File not found'})
            }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'ok': False, 'error': str(e)})
        }
