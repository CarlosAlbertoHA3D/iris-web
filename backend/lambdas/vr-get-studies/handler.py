import json
import os
import boto3
from boto3.dynamodb.conditions import Key

dynamodb = boto3.resource('dynamodb')
vr_table = dynamodb.Table(os.environ['VR_CODES_TABLE'])
metadata_table = dynamodb.Table(os.environ['METADATA_TABLE'])
s3 = boto3.client('s3')
bucket_name = os.environ['S3_BUCKET']

def get_presigned_url(key, expiration=3600):
    try:
        if key.startswith('s3://'):
            parts = key[5:].split('/', 1)
            if len(parts) > 1:
                key = parts[1]
        
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket_name, 'Key': key},
            ExpiresIn=expiration
        )
        return url
    except Exception as e:
        print(f"Error generating presigned URL: {str(e)}")
        return None

def lambda_handler(event, context):
    try:
        code = None
        if event.get('queryStringParameters'):
            code = event['queryStringParameters'].get('code')
        
        if not code:
            return {
                'statusCode': 400,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS'
                },
                'body': json.dumps({'error': 'Code is required'})
            }
            
        response = vr_table.get_item(Key={'code': code})
        item = response.get('Item')
        
        if not item:
            return {
                'statusCode': 401,
                'headers': {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Headers': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS'
                },
                'body': json.dumps({'error': 'Invalid or expired code'})
            }
            
        user_id = item['userId']
        room_code = item.get('roomCode')
        
        response = metadata_table.query(
            IndexName='userId-createdAt-index',
            KeyConditionExpression=Key('userId').eq(user_id)
        )
        
        items = response.get('Items', [])
        items = [item for item in items if not item.get('deleted')]
        items.sort(key=lambda x: x.get('createdAt', 0), reverse=True)
        
        studies = []
        for study in items:
            study_data = {
                'jobId': study['jobId'],
                'filename': study.get('filename', 'Unknown'),
                'status': study.get('status', 'unknown'),
                'createdAt': int(study.get('createdAt', 0)),
                'artifacts': {}
            }
            
            if 'inputFile' in study:
                study_data['downloadUrl'] = get_presigned_url(study['inputFile'])
                
            if 'artifacts' in study:
                for key, path in study['artifacts'].items():
                    study_data['artifacts'][key] = get_presigned_url(path)
            
            studies.append(study_data)

        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            'body': json.dumps({
                'studies': studies,
                'user_id': user_id,
                'room_code': room_code
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Methods': 'GET, OPTIONS'
            },
            'body': json.dumps({'error': str(e)})
        }
