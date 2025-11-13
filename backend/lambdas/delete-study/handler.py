import json
import os
import boto3
import time

dynamodb = boto3.resource('dynamodb')

DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']

table = dynamodb.Table(DYNAMODB_TABLE)


def lambda_handler(event, context):
    """
    Soft delete a study (mark as deleted, don't actually remove from S3/DynamoDB)
    """
    # Handle CORS preflight request
    if event.get('httpMethod') == 'OPTIONS':
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': 'Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token',
                'Access-Control-Allow-Methods': 'DELETE,OPTIONS'
            },
            'body': ''
        }
    
    try:
        # Extract userId from Cognito authorizer
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
                'body': json.dumps({
                    'ok': False,
                    'error': 'Unauthorized - No user ID in token'
                })
            }
        
        # Get jobId from path parameters
        path_params = event.get('pathParameters', {})
        job_id = path_params.get('jobId')
        
        if not job_id:
            return {
                'statusCode': 400,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'ok': False,
                    'error': 'Missing jobId'
                })
            }
        
        print(f"Soft deleting study {job_id} for user {user_id}")
        
        # Get the study to verify ownership
        response = table.get_item(Key={'jobId': job_id})
        
        if 'Item' not in response:
            return {
                'statusCode': 404,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'ok': False,
                    'error': 'Study not found'
                })
            }
        
        study = response['Item']
        
        # Verify the user owns this study
        if study.get('userId') != user_id:
            return {
                'statusCode': 403,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'ok': False,
                    'error': 'You do not have permission to delete this study'
                })
            }
        
        # Soft delete: mark as deleted but keep data
        table.update_item(
            Key={'jobId': job_id},
            UpdateExpression='SET deleted = :deleted, deletedAt = :deletedAt',
            ExpressionAttributeValues={
                ':deleted': True,
                ':deletedAt': int(time.time())
            }
        )
        
        print(f"Successfully soft deleted study {job_id}")
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'ok': True,
                'message': 'Study deleted successfully',
                'jobId': job_id
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
