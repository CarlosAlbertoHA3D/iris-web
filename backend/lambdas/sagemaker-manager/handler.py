"""
Lambda function to manage SageMaker endpoint auto-wake/sleep
Wakes up endpoint when needed, tracks activity
"""

import json
import boto3
import os
import time
from datetime import datetime, timedelta
from typing import Dict, Any

sagemaker = boto3.client('sagemaker')
dynamodb = boto3.resource('dynamodb')

ENDPOINT_NAME = os.environ.get('ENDPOINT_NAME', 'iris-totalsegmentator-endpoint')
ENDPOINT_CONFIG = os.environ.get('ENDPOINT_CONFIG', 'iris-totalsegmentator-config-autoscale')
ACTIVITY_TABLE = os.environ.get('ACTIVITY_TABLE', 'iris-sagemaker-activity')


def check_endpoint_status() -> str:
    """Check if endpoint exists and its status"""
    try:
        response = sagemaker.describe_endpoint(EndpointName=ENDPOINT_NAME)
        return response['EndpointStatus']
    except sagemaker.exceptions.ClientError as e:
        if 'Could not find endpoint' in str(e):
            return 'NotFound'
        raise


def create_endpoint():
    """Create SageMaker endpoint"""
    print(f"Creating endpoint {ENDPOINT_NAME}...")
    sagemaker.create_endpoint(
        EndpointName=ENDPOINT_NAME,
        EndpointConfigName=ENDPOINT_CONFIG
    )
    print("Endpoint creation initiated")


def wait_for_endpoint(timeout_seconds=600):
    """Wait for endpoint to be InService"""
    print(f"Waiting for endpoint to be ready (timeout: {timeout_seconds}s)...")
    start_time = time.time()
    
    while time.time() - start_time < timeout_seconds:
        status = check_endpoint_status()
        print(f"Current status: {status}")
        
        if status == 'InService':
            print("✅ Endpoint is ready!")
            return True
        elif status in ['Failed', 'NotFound']:
            raise Exception(f"Endpoint failed to create: {status}")
        
        time.sleep(30)  # Check every 30 seconds
    
    raise TimeoutError(f"Endpoint did not become ready within {timeout_seconds} seconds")


def delete_endpoint():
    """Delete SageMaker endpoint"""
    try:
        print(f"Deleting endpoint {ENDPOINT_NAME}...")
        sagemaker.delete_endpoint(EndpointName=ENDPOINT_NAME)
        print("✅ Endpoint deleted")
        return True
    except Exception as e:
        print(f"Error deleting endpoint: {e}")
        return False


def record_activity():
    """Record activity in DynamoDB for auto-sleep tracking"""
    try:
        table = dynamodb.Table(ACTIVITY_TABLE)
        table.put_item(
            Item={
                'endpoint': ENDPOINT_NAME,
                'timestamp': int(time.time()),
                'datetime': datetime.utcnow().isoformat()
            }
        )
        print("Activity recorded")
    except Exception as e:
        print(f"Error recording activity: {e}")


def get_last_activity() -> int:
    """Get timestamp of last activity"""
    try:
        table = dynamodb.Table(ACTIVITY_TABLE)
        response = table.get_item(Key={'endpoint': ENDPOINT_NAME})
        if 'Item' in response:
            return response['Item']['timestamp']
        return 0
    except Exception as e:
        print(f"Error getting last activity: {e}")
        return 0


def lambda_handler(event: Dict[str, Any], context: Any) -> Dict[str, Any]:
    """
    Handle different actions:
    - wake: Ensure endpoint is running
    - sleep: Delete endpoint if inactive
    - status: Check endpoint status
    """
    
    action = event.get('action', 'wake')
    print(f"Action: {action}")
    
    try:
        if action == 'wake':
            # Ensure endpoint is running
            status = check_endpoint_status()
            print(f"Current endpoint status: {status}")
            
            if status == 'InService':
                print("Endpoint already active")
                record_activity()
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'status': 'ready',
                        'endpoint': ENDPOINT_NAME,
                        'message': 'Endpoint is already active'
                    })
                }
            
            elif status == 'NotFound':
                print("Endpoint not found, creating...")
                create_endpoint()
                wait_for_endpoint()
                record_activity()
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'status': 'created',
                        'endpoint': ENDPOINT_NAME,
                        'message': 'Endpoint created and ready'
                    })
                }
            
            elif status in ['Creating', 'Updating']:
                print(f"Endpoint is {status}, waiting...")
                wait_for_endpoint()
                record_activity()
                return {
                    'statusCode': 200,
                    'body': json.dumps({
                        'status': 'ready',
                        'endpoint': ENDPOINT_NAME,
                        'message': f'Endpoint was {status}, now ready'
                    })
                }
            
            else:
                raise Exception(f"Unexpected endpoint status: {status}")
        
        elif action == 'sleep':
            # Check if endpoint should be deleted due to inactivity
            last_activity = get_last_activity()
            current_time = int(time.time())
            inactive_minutes = (current_time - last_activity) / 60
            
            # Delete if inactive for more than 15 minutes
            if inactive_minutes > 15:
                status = check_endpoint_status()
                if status == 'InService':
                    delete_endpoint()
                    return {
                        'statusCode': 200,
                        'body': json.dumps({
                            'status': 'deleted',
                            'message': f'Endpoint deleted after {inactive_minutes:.1f} minutes of inactivity'
                        })
                    }
            
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'status': 'active',
                    'message': f'Endpoint still active (last activity: {inactive_minutes:.1f} min ago)'
                })
            }
        
        elif action == 'status':
            # Just return status
            status = check_endpoint_status()
            last_activity = get_last_activity()
            return {
                'statusCode': 200,
                'body': json.dumps({
                    'endpoint': ENDPOINT_NAME,
                    'status': status,
                    'last_activity': last_activity,
                    'last_activity_date': datetime.fromtimestamp(last_activity).isoformat() if last_activity else None
                })
            }
        
        else:
            return {
                'statusCode': 400,
                'body': json.dumps({'error': f'Unknown action: {action}'})
            }
    
    except Exception as e:
        print(f"Error: {str(e)}")
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e)})
        }
