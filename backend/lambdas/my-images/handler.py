import json
import os
import boto3
from botocore.config import Config
from decimal import Decimal

dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3', config=Config(s3={'use_accelerate_endpoint': True}))

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
        
        # Filter out deleted studies
        all_images = response.get('Items', [])
        images = [img for img in all_images if not img.get('deleted', False)]
        
        print(f"Found {len(images)} images for user {user_id}")
        
        # Enrich images with presigned URLs for thumbnails and artifacts
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
            
            # If job is completed, generate presigned URLs for 3D artifacts
            if img.get('status') == 'completed':
                artifacts_source = {}
                # Merge expectedArtifacts and actual artifacts, preferring actual
                if 'expectedArtifacts' in img:
                    artifacts_source.update(img['expectedArtifacts'])
                if 'artifacts' in img:
                    artifacts_source.update(img['artifacts'])
                
                artifacts_urls = {}
                for artifact_type, s3_path in artifacts_source.items():
                    # Extract S3 key from s3://bucket/key format
                    if isinstance(s3_path, str) and s3_path.startswith('s3://'):
                        # Remove s3://bucket/ prefix
                        s3_key = '/'.join(s3_path.split('/')[3:])
                        try:
                            artifacts_urls[artifact_type] = s3.generate_presigned_url(
                                'get_object',
                                Params={
                                    'Bucket': S3_BUCKET,
                                    'Key': s3_key
                                },
                                ExpiresIn=3600
                            )
                        except Exception as e:
                            print(f"Error generating presigned URL for {artifact_type}: {e}")
                
                if artifacts_urls:
                    img['artifactUrls'] = artifacts_urls
                    print(f"Generated {len(artifacts_urls)} artifact URLs for job {img['jobId']}")
        
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
