import json
import os
import time
import boto3

dynamodb = boto3.resource('dynamodb')
DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
table = dynamodb.Table(DYNAMODB_TABLE)

def lambda_handler(event, context):
    """
    Update job status and artifacts after SageMaker processing completes
    This can be called by:
    1. SageMaker callback (future)
    2. Manual trigger from frontend polling
    3. EventBridge schedule
    """
    try:
        # Parse request
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', {})
        
        job_id = body.get('jobId')
        status = body.get('status', 'completed')
        artifacts = body.get('artifacts', {})
        error_message = body.get('errorMessage')
        
        if not job_id:
            return {
                'statusCode': 400,
                'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
                'body': json.dumps({'ok': False, 'error': 'jobId is required'})
            }
        
        print(f"Updating job {job_id} to status {status}")
        
        # Build update expression
        update_expr = 'SET #status = :status, updatedAt = :now'
        expr_names = {'#status': 'status'}
        expr_values = {
            ':status': status,
            ':now': int(time.time())
        }
        
        # Add completion timestamp if completed
        if status == 'completed':
            update_expr += ', completedAt = :now'
        
        # Add artifacts if provided
        if artifacts:
            update_expr += ', artifacts = :artifacts'
            expr_values[':artifacts'] = artifacts
            print(f"Saving artifacts: {artifacts}")
        
        # Add error message if failed
        if error_message:
            update_expr += ', errorMessage = :error'
            expr_values[':error'] = error_message
        
        # Update DynamoDB
        table.update_item(
            Key={'jobId': job_id},
            UpdateExpression=update_expr,
            ExpressionAttributeNames=expr_names,
            ExpressionAttributeValues=expr_values
        )
        
        print(f"Successfully updated job {job_id}")
        
        return {
            'statusCode': 200,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({
                'ok': True,
                'jobId': job_id,
                'status': status,
                'message': 'Job status updated successfully'
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*'},
            'body': json.dumps({'ok': False, 'error': str(e)})
        }
