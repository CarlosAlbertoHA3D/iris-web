#!/bin/bash
set -e

# Script to build and push SageMaker image from EC2
# This runs on the EC2 instance

REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
REPOSITORY_NAME="iris-totalsegmentator"
IMAGE_TAG="latest"

echo "🚀 Starting Docker build on EC2..."

# Install Docker if not installed
if ! command -v docker &> /dev/null; then
    echo "📦 Installing Docker..."
    sudo yum update -y
    sudo yum install -y docker
    sudo service docker start
    sudo usermod -a -G docker ec2-user
fi

# Login to ECR
echo "🔐 Logging in to ECR..."
aws ecr get-login-password --region ${REGION} | sudo docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# Build Docker image
echo "🏗️  Building Docker image..."
cd /tmp/sagemaker
sudo docker build -t ${REPOSITORY_NAME}:${IMAGE_TAG} .

# Tag and push to ECR
echo "⬆️  Pushing image to ECR..."
sudo docker tag ${REPOSITORY_NAME}:${IMAGE_TAG} ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPOSITORY_NAME}:${IMAGE_TAG}
sudo docker push ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/${REPOSITORY_NAME}:${IMAGE_TAG}

echo "✅ Docker image pushed successfully!"
