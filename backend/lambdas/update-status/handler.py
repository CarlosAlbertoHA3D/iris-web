import json
import os
import time
import boto3

dynamodb = boto3.resource('dynamodb')
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
table = dynamodb.Table(DYNAMODB_TABLE)

def lambda_handler(event, context):
    """
    Update the status of a study after upload is complete
    """
    try:
        # CORS preflight
        if event.get('httpMethod') == 'OPTIONS':
            return {
                'statusCode': 200,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'PATCH,OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type,Authorization'
                },
                'body': ''
            }
        
        # Extract userId from Cognito
        authorizer = event.get('requestContext', {}).get('authorizer', {})
        claims = authorizer.get('claims', {})
        user_id = claims.get('sub')
        
        if not user_id:
            return {
                'statusCode': 401,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'ok': False, 'error': 'Unauthorized'})
            }
        
        # Get jobId from path
        job_id = event.get('pathParameters', {}).get('jobId')
        if not job_id:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'ok': False, 'error': 'Missing jobId'})
            }
        
        # Parse request body
        body = event.get('body', '{}')
        if isinstance(body, str):
            data = json.loads(body)
        else:
            data = body
        
        new_status = data.get('status', 'uploaded')
        
        print(f"Updating status for jobId: {job_id}, user: {user_id}, status: {new_status}")
        
        # Get the item to verify ownership
        response = table.get_item(Key={'jobId': job_id})
        item = response.get('Item')
        
        if not item:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'ok': False, 'error': 'Study not found'})
            }
        
        # Verify ownership
        if item.get('userId') != user_id:
            return {
                'statusCode': 403,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({'ok': False, 'error': 'Not authorized to update this study'})
            }
        
        # Update status
        timestamp = int(time.time())
        table.update_item(
            Key={'jobId': job_id},
            UpdateExpression='SET #status = :status, updatedAt = :timestamp',
            ExpressionAttributeNames={'#status': 'status'},
            ExpressionAttributeValues={
                ':status': new_status,
                ':timestamp': timestamp
            }
        )
        
        print(f"Status updated successfully for jobId: {job_id}")
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'ok': True,
                'jobId': job_id,
                'status': new_status,
                'message': 'Status updated successfully'
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
            'body': json.dumps({'ok': False, 'error': str(e)})
        }
