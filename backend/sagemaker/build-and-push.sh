#!/bin/bash
set -e

# Configuration
REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
ECR_REPO_NAME="iris-totalsegmentator"
IMAGE_TAG="${1:-fixed-healthcheck}"

echo "🐳 Building and pushing SageMaker Docker image..."
echo ""
echo "Region: $REGION"
echo "Account: $ACCOUNT_ID"
echo "Repository: $ECR_REPO_NAME"
echo "Tag: $IMAGE_TAG"
echo ""

# Full ECR URI
ECR_URI="${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${ECR_REPO_NAME}:${IMAGE_TAG}"

# Login to ECR
echo "📝 Logging in to ECR..."
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# Build image
echo ""
echo "🔨 Building Docker image..."
echo "This will take 10-20 minutes..."
docker build -t ${ECR_REPO_NAME}:${IMAGE_TAG} -f Dockerfile .

# Tag for ECR
echo ""
echo "🏷️  Tagging image..."
docker tag ${ECR_REPO_NAME}:${IMAGE_TAG} ${ECR_URI}

# Push to ECR
echo ""
echo "📤 Pushing to ECR..."
echo "This will take 5-15 minutes depending on your internet speed..."
docker push ${ECR_URI}

echo ""
echo "✅ Image pushed successfully!"
echo ""
echo "📋 Image URI:"
echo "   ${ECR_URI}"
echo ""
echo "🎯 Next steps:"
echo "   1. Update your SageMaker model to use this image"
echo "   2. Or the system will auto-create endpoint with latest tag"
echo ""
echo "💡 To update the model:"
echo "   aws sagemaker create-model \\"
echo "     --model-name iris-totalsegmentator-model-fixed \\"
echo "     --primary-container Image=${ECR_URI} \\"
echo "     --execution-role-arn <YOUR_SAGEMAKER_ROLE_ARN> \\"
echo "     --region ${REGION}"
echo ""
