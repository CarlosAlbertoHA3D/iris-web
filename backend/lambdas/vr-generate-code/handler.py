import json
import os
import boto3
import time
import random
import string
from botocore.exceptions import ClientError

dynamodb = boto3.resource('dynamodb')
vr_table = dynamodb.Table(os.environ['VR_CODES_TABLE'])

def generate_code(length=5):
    return ''.join(random.choices(string.digits, k=length))

def lambda_handler(event, context):
    try:
        # Get userId from Cognito authorizer
        user_id = event['requestContext']['authorizer']['claims']['sub']
        
        # Generate unique code
        code = generate_code()
        # Simple collision check (optional, but good practice)
        # For 5 digits (100k combinations), collisions are possible if high traffic, 
        # but for a single user/low volume it's fine.
        # We could retry if put_item fails with ConditionExpression but let's keep it simple for now.
        
        expiration_time = int(time.time()) + (24 * 60 * 60) # 24 hours
        
        item = {
            'code': code,
            'userId': user_id,
            'expiresAt': expiration_time,
            'createdAt': int(time.time())
        }
        
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
                'expiresAt': expiration_time
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
