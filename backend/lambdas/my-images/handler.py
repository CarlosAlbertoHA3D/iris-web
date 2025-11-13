import json
import os
import boto3
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')

DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
S3_BUCKET = os.environ['S3_BUCKET']

table = dynamodb.Table(DYNAMODB_TABLE)


class DecimalEncoder(json.JSONEncoder):
    """Helper class to convert DynamoDB Decimal to JSON"""
    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super(DecimalEncoder, self).default(obj)


def lambda_handler(event, context):
    """
    Get list of images uploaded by the authenticated user
    """
    try:
        # Extract userId from Cognito authorizer
        # When using Cognito authorizer, the claims are in requestContext
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
        
        print(f"Getting images for user: {user_id}")
        
        # Query DynamoDB by userId using GSI
        response = table.query(
            IndexName='userId-createdAt-index',
            KeyConditionExpression='userId = :uid',
            ExpressionAttributeValues={':uid': user_id},
            ScanIndexForward=False  # Sort by createdAt descending (newest first)
        )
        
        images = response.get('Items', [])
        
        print(f"Found {len(images)} images for user {user_id}")
        
        # Enrich images with presigned URLs for thumbnails if available
        for img in images:
            # Generate presigned URL for the original file
            if 'inputFile' in img:
                try:
                    img['downloadUrl'] = s3.generate_presigned_url(
                        'get_object',
                        Params={
                            'Bucket': S3_BUCKET,
                            'Key': img['inputFile']
                        },
                        ExpiresIn=3600  # 1 hour
                    )
                except Exception as e:
                    print(f"Error generating presigned URL: {e}")
                    img['downloadUrl'] = None
        
        return {
            'statusCode': 200,
            'headers': {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            },
            'body': json.dumps({
                'ok': True,
                'count': len(images),
                'images': images
            }, cls=DecimalEncoder)
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
