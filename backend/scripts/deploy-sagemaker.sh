#!/bin/bash
set -e

# Deploy SageMaker endpoint for TotalSegmentator
# This script builds and deploys a SageMaker on-demand endpoint

REGION="us-east-1"  # Change to your preferred region
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPOSITORY_NAME="iris-totalsegmentator"
IMAGE_TAG="latest"
MODEL_NAME="iris-totalsegmentator-model"
ENDPOINT_CONFIG_NAME="iris-totalsegmentator-config"
ENDPOINT_NAME="iris-totalsegmentator-endpoint"

echo "🚀 Deploying SageMaker endpoint for TotalSegmentator"

# Step 1: Create ECR repository if not exists
echo "📦 Creating ECR repository..."
aws ecr describe-repositories --repository-names ${REPOSITORY_NAME} --region ${REGION} || \
    aws ecr create-repository --repository-name ${REPOSITORY_NAME} --region ${REGION}

# Step 2: Login to ECR
echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region ${REGION} | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# Step 3: Build Docker image
echo "🏗️  Building Docker image..."
cd ../sagemaker
docker build -t ${REPOSITORY_NAME}:${IMAGE_TAG} .

# Step 4: Tag and push to ECR
echo "⬆️  Pushing image to ECR..."
docker tag ${REPOSITORY_NAME}:${IMAGE_TAG} ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPOSITORY_NAME}:${IMAGE_TAG}
docker push ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPOSITORY_NAME}:${IMAGE_TAG}

# Step 5: Get SageMaker role ARN from CloudFormation stack
echo "🔍 Getting SageMaker execution role..."
ROLE_ARN=$(aws cloudformation describe-stacks \
    --stack-name iris-oculus-backend \
    --query 'Stacks[0].Outputs[?OutputKey==`SageMakerRoleArn`].OutputValue' \
    --output text \
    --region ${REGION})

if [ -z "$ROLE_ARN" ]; then
    echo "❌ Error: Could not find SageMaker role. Please deploy SAM stack first."
    exit 1
fi

# Step 6: Create SageMaker model
echo "📋 Creating SageMaker model..."
aws sagemaker create-model \
    --model-name ${MODEL_NAME} \
    --primary-container Image=${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPOSITORY_NAME}:${IMAGE_TAG},Mode=SingleModel \
    --execution-role-arn ${ROLE_ARN} \
    --region ${REGION} || echo "Model already exists"

# Step 7: Create endpoint configuration with GPU instance (on-demand)
echo "⚙️  Creating endpoint configuration..."
aws sagemaker create-endpoint-config \
    --endpoint-config-name ${ENDPOINT_CONFIG_NAME} \
    --production-variants \
        VariantName=AllTraffic,ModelName=${MODEL_NAME},InstanceType=ml.g4dn.xlarge,InitialInstanceCount=1,ServerlessConfig={MemorySizeInMB=4096,MaxConcurrency=1} \
    --region ${REGION} || echo "Endpoint config already exists"

# Step 8: Create endpoint (on-demand, scales to 0 when not in use)
echo "🎯 Creating SageMaker endpoint..."
aws sagemaker create-endpoint \
    --endpoint-name ${ENDPOINT_NAME} \
    --endpoint-config-name ${ENDPOINT_CONFIG_NAME} \
    --region ${REGION} || echo "Endpoint already exists"

echo "✅ SageMaker endpoint deployment initiated!"
echo "📊 Monitor status with: aws sagemaker describe-endpoint --endpoint-name ${ENDPOINT_NAME} --region ${REGION}"
echo "⏰ This may take 5-10 minutes to complete."
