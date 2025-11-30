import json
import os
import time
import boto3
from botocore.config import Config
from decimal import Decimal


dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3', config=Config(s3={'use_accelerate_endpoint': True}))
batch_client = boto3.client('batch')

DYNAMODB_TABLE = os.environ['DYNAMODB_TABLE']
S3_BUCKET = os.environ['S3_BUCKET']

table = dynamodb.Table(DYNAMODB_TABLE)


class DecimalEncoder(json.JSONEncoder):
    """Convert DynamoDB Decimal types to native Python numbers."""

    def default(self, obj):
        if isinstance(obj, Decimal):
            return int(obj) if obj % 1 == 0 else float(obj)
        return super().default(obj)


def _with_cors(response):
    headers = response.setdefault('headers', {})
    headers['Access-Control-Allow-Origin'] = '*'
    headers['Access-Control-Allow-Methods'] = 'GET,OPTIONS'
    headers['Access-Control-Allow-Headers'] = 'Content-Type,Authorization'
    return response


def _build_artifact_urls(item):
    expected = item.get('expectedArtifacts') or {}
    actual = item.get('artifacts') or {}
    
    # Merge, preferring actual
    artifacts_source = expected.copy()
    artifacts_source.update(actual)
    
    if not artifacts_source:
        return {}

    urls = {}
    for artifact_type, s3_path in artifacts_source.items():
        if not isinstance(s3_path, str) or not s3_path.startswith('s3://'):
            continue
        parts = s3_path.replace('s3://', '').split('/', 1)
        if len(parts) != 2:
            continue
        bucket, key = parts
        try:
            urls[artifact_type] = s3.generate_presigned_url(
                'get_object',
                Params={'Bucket': bucket, 'Key': key},
                ExpiresIn=3600,
            )
        except Exception as exc:  # pragma: no cover - log but continue
            print(f"[get-job-status] Failed to presign {artifact_type}: {exc}")
    return urls


def lambda_handler(event, _context):
    print(f"[get-job-status] event: {json.dumps(event)}")

    if event.get('httpMethod') == 'OPTIONS':
        return _with_cors({
            'statusCode': 200,
            'body': ''
        })

    job_id = event.get('pathParameters', {}).get('jobId')
    if not job_id:
        return _with_cors({
            'statusCode': 400,
            'body': json.dumps({'ok': False, 'error': 'jobId is required'})
        })

    # Require authenticated user
    authorizer = event.get('requestContext', {}).get('authorizer', {})
    claims = authorizer.get('claims', {})
    user_id = claims.get('sub')
    if not user_id:
        return _with_cors({
            'statusCode': 401,
            'body': json.dumps({'ok': False, 'error': 'Unauthorized'})
        })

    try:
        resp = table.get_item(Key={'jobId': job_id})
        item = resp.get('Item')
        if not item:
            return _with_cors({
                'statusCode': 404,
                'body': json.dumps({'ok': False, 'error': 'Job not found'})
            })

        if item.get('userId') and item['userId'] != user_id:
            return _with_cors({
                'statusCode': 403,
                'body': json.dumps({'ok': False, 'error': 'Not authorized to access this job'})
            })

        # If job has a Batch job ID, check Batch status and sync
        batch_job_id = item.get('batchJobId')
        if batch_job_id and item.get('status') not in ['completed', 'failed']:
            try:
                batch_resp = batch_client.describe_jobs(jobs=[batch_job_id])
                if batch_resp['jobs']:
                    batch_job = batch_resp['jobs'][0]
                    batch_status = batch_job['status']
                    
                    # Map Batch status to our status
                    status_map = {
                        'SUBMITTED': 'queued',
                        'PENDING': 'queued',
                        'RUNNABLE': 'queued',
                        'STARTING': 'processing',
                        'RUNNING': 'processing',
                        'SUCCEEDED': 'completed',
                        'FAILED': 'failed'
                    }
                    
                    new_status = status_map.get(batch_status, item.get('status'))
                    
                    # Update DynamoDB if status changed
                    if new_status != item.get('status'):
                        update_expr = 'SET #status = :status, updatedAt = :now'
                        expr_values = {':status': new_status, ':now': int(time.time())}
                        expr_names = {'#status': 'status'}
                        
                        if new_status == 'failed':
                            reason = batch_job.get('statusReason', 'Batch job failed')
                            update_expr += ', errorMessage = :error'
                            expr_values[':error'] = reason
                        
                        table.update_item(
                            Key={'jobId': job_id},
                            UpdateExpression=update_expr,
                            ExpressionAttributeNames=expr_names,
                            ExpressionAttributeValues=expr_values
                        )
                        item['status'] = new_status
            except Exception as e:
                print(f'[get-job-status] Error checking Batch status: {e}')

        artifact_urls = _build_artifact_urls(item) if item.get('status') == 'completed' else {}

        job_payload = {
            'jobId': item.get('jobId'),
            'status': item.get('status'),
            'queuedAt': item.get('queuedAt'),
            'startedAt': item.get('startedAt'),
            'completedAt': item.get('completedAt'),
            'updatedAt': item.get('updatedAt'),
            'errorMessage': item.get('errorMessage'),
            'expectedArtifacts': item.get('expectedArtifacts'),
            'artifacts': item.get('artifacts'),
            'artifactUrls': artifact_urls,
        }

        return _with_cors({
            'statusCode': 200,
            'body': json.dumps({'ok': True, 'job': job_payload}, cls=DecimalEncoder)
        })

    except Exception as exc:  # pragma: no cover
        print(f"[get-job-status] Error fetching job {job_id}: {exc}")
        return _with_cors({
            'statusCode': 500,
            'body': json.dumps({'ok': False, 'error': str(exc)})
        })
