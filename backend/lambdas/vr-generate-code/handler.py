import json
import os
import boto3
import time
import random
import string
from boto3.dynamodb.conditions import Key, Attr
from botocore.exceptions import ClientError

dynamodb = boto3.resource('dynamodb')
vr_table = dynamodb.Table(os.environ['VR_CODES_TABLE'])

def generate_code(length=5):
    return ''.join(random.choices(string.digits, k=length))

def generate_room_code(length=6):
    return ''.join(random.choices(string.digits, k=length))

def lambda_handler(event, context):
    try:
        # Get userId from Cognito authorizer
        user_id = event['requestContext']['authorizer']['claims']['sub']
        
        # Parse body for optional jobId
        job_id = None
        if event.get('body'):
            try:
                body = json.loads(event['body'])
                job_id = body.get('jobId')
            except:
                pass

        # Generate unique code
        code = generate_code()
        
        # Generate unique roomCode
        while True:
            room_code = generate_room_code()
            # Check if roomCode exists
            response = vr_table.scan(
                FilterExpression=Attr('roomCode').eq(room_code),
                Limit=1
            )
            if response['Count'] == 0:
                break
        
        expiration_time = int(time.time()) + (24 * 60 * 60) # 24 hours
        
        item = {
            'code': code,
            'userId': user_id,
            'roomCode': room_code,
            'expiresAt': expiration_time,
            'createdAt': int(time.time())
        }
        
        if job_id:
            item['jobId'] = job_id
        
        vr_table.put_item(Item=item)
        
        return {
            'statusCode': 200,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({
                'code': code,
                'roomCode': room_code,
                'expiresAt': expiration_time,
                'jobId': job_id
            })
        }
        
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'headers': {
                'Access-Control-Allow-Origin': '*',
                'Access-Control-Allow-Headers': '*',
                'Access-Control-Allow-Methods': 'POST, OPTIONS'
            },
            'body': json.dumps({'error': str(e)})
        }
