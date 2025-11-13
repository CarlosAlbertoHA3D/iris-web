#!/bin/bash

# Deploy IRIS backend with SageMaker auto-sleep/wake functionality
set -e

REGION="us-east-1"
STACK_NAME="iris-oculus-backend"

echo "🚀 Deploying IRIS Backend with Auto-Sleep SageMaker..."
echo ""

# Change to backend directory
cd "$(dirname "$0")/.."

echo "📦 Building SAM application..."
sam build --region ${REGION}

echo ""
echo "🚢 Deploying to AWS..."
sam deploy \
    --stack-name ${STACK_NAME} \
    --region ${REGION} \
    --capabilities CAPABILITY_IAM CAPABILITY_NAMED_IAM \
    --no-fail-on-empty-changeset \
    --no-confirm-changeset

echo ""
echo "✅ Backend deployment complete!"
echo ""

# Get outputs
API_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text \
    --region ${REGION})

S3_BUCKET=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --query 'Stacks[0].Outputs[?OutputKey==`DataBucketName`].OutputValue' \
    --output text \
    --region ${REGION})

echo "📊 Stack Outputs:"
echo "  • API Endpoint: ${API_ENDPOINT}"
echo "  • S3 Bucket: ${S3_BUCKET}"
echo ""

echo "🎯 Auto-Sleep/Wake Configuration:"
echo "  • SageMaker endpoint will auto-wake when processing starts"
echo "  • Endpoint will auto-sleep after 15 minutes of inactivity"
echo "  • Cost when sleeping: $0/hour"
echo "  • Cost when active: ~$0.736/hour (GPU ml.g4dn.xlarge)"
echo ""

echo "📋 Next steps:"
echo ""
echo "1. The SageMaker endpoint is NOT created yet (zero cost)"
echo "2. When a user uploads a file for processing:"
echo "   - Lambda will auto-wake the endpoint (takes 5-10 min)"
echo "   - Processing will start"
echo "   - After 15 min of no activity, endpoint auto-deletes (cost = $0)"
echo ""
echo "3. To manually check endpoint status:"
echo "   aws lambda invoke --function-name iris-sagemaker-manager \\"
echo "     --payload '{\"action\":\"status\"}' \\"
echo "     --region ${REGION} \\"
echo "     /tmp/status.json && cat /tmp/status.json"
echo ""
echo "✅ Ready for production!"
