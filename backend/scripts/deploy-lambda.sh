#!/bin/bash
set -e

# Deploy Lambda functions using SAM

REGION="us-east-1"  # Change to your preferred region
STACK_NAME="iris-oculus-backend"
S3_BUCKET="iris-oculus-deployment-${RANDOM}"
AWS_PROFILE="${AWS_PROFILE:-default}"  # Use AWS_PROFILE env var or 'default'

# Display which account we're deploying to
echo "🔍 Verificando cuenta AWS..."
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --profile ${AWS_PROFILE} 2>/dev/null || aws sts get-caller-identity --query Account --output text)
echo "📌 Account ID: ${ACCOUNT_ID}"
echo ""

echo "🚀 Deploying IRIS Oculus Backend to AWS Lambda"

# Step 1: Create S3 bucket for deployment artifacts
echo "📦 Creating S3 bucket for deployment..."
aws s3 mb s3://${S3_BUCKET} --region ${REGION} || echo "Bucket already exists"

# Step 2: Build SAM application
echo "🏗️  Building SAM application..."
cd ..
sam build

# Step 3: Package application
echo "📦 Packaging application..."
sam package \
    --output-template-file packaged.yaml \
    --s3-bucket ${S3_BUCKET} \
    --region ${REGION}

# Step 4: Deploy application
echo "🚀 Deploying to AWS..."
sam deploy \
    --template-file packaged.yaml \
    --stack-name ${STACK_NAME} \
    --capabilities CAPABILITY_NAMED_IAM \
    --region ${REGION} \
    --parameter-overrides DomainName=iris-oculus.com

# Step 5: Get API endpoint
echo "📊 Getting API endpoint..."
API_ENDPOINT=$(aws cloudformation describe-stacks \
    --stack-name ${STACK_NAME} \
    --query 'Stacks[0].Outputs[?OutputKey==`ApiEndpoint`].OutputValue' \
    --output text \
    --region ${REGION})

echo "✅ Deployment complete!"
echo "🌐 API Endpoint: ${API_ENDPOINT}"
echo ""
echo "Next steps:"
echo "1. Configure custom domain in API Gateway with Route 53"
echo "2. Deploy SageMaker endpoint: ./deploy-sagemaker.sh"
echo "3. Update frontend .env with new API endpoint"
