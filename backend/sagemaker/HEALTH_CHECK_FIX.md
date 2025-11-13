# SageMaker Health Check Fix

## 🔴 Problem

The SageMaker endpoint was failing with:
```
"The primary container for production variant AllTraffic 
did not pass the ping health check."
```

## 🔍 Root Cause

SageMaker requires:
1. **HTTP server** running on port 8080
2. **/ping endpoint** that responds with HTTP 200
3. **/invocations endpoint** for predictions
4. Server must start **within 4 minutes** of container launch

The previous Docker image was missing the HTTP server setup.

## ✅ Solution

### Changes Made:

#### 1. **Dockerfile** - Added Flask/gunicorn server
```dockerfile
# Install Flask and gunicorn
RUN pip3 install flask==2.3.3 gunicorn==21.2.0

# Copy serve script
COPY serve /opt/ml/code/serve
RUN chmod +x /opt/ml/code/serve

# Expose port 8080
EXPOSE 8080

# Use serve script as entrypoint
ENTRYPOINT ["/opt/ml/code/serve"]
```

#### 2. **serve script** - HTTP server that implements:
- `GET /ping` - Health check (returns 200 if model loaded)
- `POST /invocations` - Inference endpoint
- Loads model on startup
- Runs Flask server on 0.0.0.0:8080

#### 3. **inference.py** - Fast model_fn
- Returns quickly to pass health checks
- TotalSegmentator models download on first actual use
- Doesn't block server startup

## 🚀 How to Deploy

### Option 1: Quick Deploy (Recommended)
```bash
cd backend/sagemaker
chmod +x build-and-push.sh
./build-and-push.sh fixed-healthcheck
```

### Option 2: Manual Steps
```bash
# 1. Login to ECR
aws ecr get-login-password --region us-east-1 | \
  docker login --username AWS --password-stdin \
  390844768950.dkr.ecr.us-east-1.amazonaws.com

# 2. Build image
docker build -t iris-totalsegmentator:fixed -f Dockerfile .

# 3. Tag for ECR
docker tag iris-totalsegmentator:fixed \
  390844768950.dkr.ecr.us-east-1.amazonaws.com/iris-totalsegmentator:fixed

# 4. Push to ECR
docker push 390844768950.dkr.ecr.us-east-1.amazonaws.com/iris-totalsegmentator:fixed
```

## 🧪 Testing Locally

```bash
# Build image
docker build -t iris-totalsegmentator:test .

# Run container
docker run -p 8080:8080 iris-totalsegmentator:test

# Test health check (in another terminal)
curl http://localhost:8080/ping
# Should return: {"status": "healthy"}

# Test inference
curl -X POST http://localhost:8080/invocations \
  -H "Content-Type: application/json" \
  -d '{"jobId":"test","s3_bucket":"bucket","s3_input_key":"file.nii.gz","s3_output_prefix":"results/"}'
```

## 📊 Verification

After deploying, verify endpoint health:
```bash
# Check endpoint status
aws sagemaker describe-endpoint \
  --endpoint-name iris-totalsegmentator-endpoint \
  --region us-east-1 \
  --query 'EndpointStatus'

# Should return: "InService" (not "Failed")
```

## 💰 Cost Impact

- Build time: 10-20 minutes (one-time, free on local machine)
- Push time: 5-15 minutes (free)
- Endpoint creation: 5-10 minutes ($0.70/hour ml.g4dn.xlarge)
- Running: $0.70/hour (auto-sleeps after 10 min idle)

## 🎯 Next Steps

1. **Build and push** the fixed image
2. **Wait** for next "Process with AI" request
3. **System auto-creates** endpoint with new image
4. **Endpoint passes** health check ✅
5. **Processing works** correctly ✅

## 📝 Notes

- The `serve` script uses Flask's built-in server (good enough for SageMaker)
- For production at scale, consider using gunicorn:
  ```python
  gunicorn -b 0.0.0.0:8080 -w 4 -k gevent --timeout 300 serve:app
  ```
- Health check timeout: 4 minutes max
- Endpoint creation timeout: 15 minutes max
- Image must be <10GB for serverless (currently ~9GB)

## ❓ Troubleshooting

### Health check still failing?
```bash
# Check CloudWatch logs
aws logs tail /aws/sagemaker/Endpoints/iris-totalsegmentator-endpoint \
  --follow --region us-east-1
```

### Container not starting?
```bash
# Test locally first
docker run -p 8080:8080 iris-totalsegmentator:test

# Check if port 8080 responds
curl http://localhost:8080/ping
```

### Model download timeout?
- TotalSegmentator models (~1.5GB) download on first use
- This happens during first inference, not health check
- Health check only verifies server is running
