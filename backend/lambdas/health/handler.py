import json

def lambda_handler(event, context):
    """
    Health check endpoint
    """
    return {
        'statusCode': 200,
        'headers': {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        'body': json.dumps({'ok': True, 'service': 'iris-oculus-api', 'version': '1.0.0'})
    }
