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
        url = s3.generate_presigned_url(
            'get_object',
            Params={'Bucket': bucket_name, 'Key': key},
            ExpiresIn=expiration
        )
        return url
    except Exception as e:
        print(f"Error generating presigned URL: {e}")
        return None

def lambda_handler(event, context):
    try:
        # Get code from query parameters or headers
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
            
        # Validate code
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
        
        # Fetch studies for the user
        # Using GSI to query by userId
        response = metadata_table.query(
            IndexName='userId-createdAt-index',
            KeyConditionExpression=Key('userId').eq(user_id)
        )
        
        items = response.get('Items', [])
        
        # Filter out deleted studies
        items = [item for item in items if not item.get('deleted')]
        
        # Sort by createdAt desc
        items.sort(key=lambda x: x.get('createdAt', 0), reverse=True)
        
        # Process items to include presigned URLs
        studies = []
        for study in items:
            study_data = {
                'jobId': study['jobId'],
                'filename': study.get('filename', 'Unknown'),
                'status': study.get('status', 'unknown'),
                'createdAt': int(study.get('createdAt', 0)),
                'artifacts': {}
            }
            
            # Generate URLs for artifacts
            # Assuming standard artifact paths based on jobId
            # or if they are stored in the item.
            
            # If artifacts are stored in the DynamoDB item, use them
            # Otherwise, construct them. 
            # Based on Dashboard.tsx logic:
            # downloadUrl comes from `downloadUrl` or constructed.
            # Dashboard.tsx uses `/files/{jobId}/{filename}` for download which is a lambda.
            # But here we want direct S3 URLs for the VR app/page to work without complex auth headers.
            
            # Actually, we can use the existing /files lambda if we want, but that requires Auth header.
            # Since this is a "login with code" scenario, the VR client won't have the Cognito token.
            # So we MUST return presigned S3 URLs here.
            
            # Construct key prefixes
            prefix = f"output/{study['jobId']}"
            
            # Helper to add artifact if it exists (we might not verify existence to save time, 
            # or relies on metadata)
            
            # Standard artifacts:
            # - input file (NIfTI/DICOM zip)
            # - result.nii.gz (segmentation)
            # - model.glb / model.obj (3D model)
            
            # Let's see what is in the study item.
            # Dashboard.tsx uses `downloadUrl` and `artifactUrls`.
            
            if 'inputFile' in study:
                study_data['downloadUrl'] = get_presigned_url(study['inputFile'])
                
            # Check for expected artifacts or construct standard paths
            # Ideally, the metadata table has a list of generated files.
            # If not, we might guess.
            
            # TotalSegmentator usually outputs:
            # - output/{jobId}/segmentations/ (folder)
            # - output/{jobId}/visualization/model.glb (if we generate it)
            # - output/{jobId}/result.nii.gz (combined)
            
            # Let's assume standard paths for now or use what's in the item.
            
            # We'll look for .glb or .obj in artifacts if available
            if 'artifacts' in study:
                for key, path in study['artifacts'].items():
                    study_data['artifacts'][key] = get_presigned_url(path)
            
            # Explicitly look for common 3D formats if not in artifacts map
            # (This depends on how the process lambda stores metadata)
            
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
                'user_id': user_id # Optional: do not expose if not needed
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
