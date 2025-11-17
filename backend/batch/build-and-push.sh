#!/bin/bash
# Build and push Docker image to ECR for AWS Batch

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}🚀 Building and pushing TotalSegmentator Batch image${NC}"

# Get AWS account ID and region
AWS_ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
AWS_REGION=$(aws configure get region || echo "us-east-1")
ECR_REPO="iris-totalsegmentator-batch"
IMAGE_URI="${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/${ECR_REPO}"

echo -e "${YELLOW}Account ID:${NC} $AWS_ACCOUNT_ID"
echo -e "${YELLOW}Region:${NC} $AWS_REGION"
echo -e "${YELLOW}ECR Repository:${NC} $ECR_REPO"
echo -e "${YELLOW}Image URI:${NC} $IMAGE_URI"

# Check if ECR repository exists
echo ""
echo -e "${YELLOW}Checking ECR repository...${NC}"
if ! aws ecr describe-repositories --repository-names $ECR_REPO --region $AWS_REGION 2>/dev/null; then
    echo -e "${RED}❌ ECR repository '$ECR_REPO' not found.${NC}"
    echo -e "${YELLOW}Please deploy the CloudFormation stack first with:${NC}"
    echo -e "  sam deploy --guided"
    exit 1
fi

# Login to ECR
echo ""
echo -e "${YELLOW}Logging in to ECR...${NC}"
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $IMAGE_URI

# Build Docker image
echo ""
echo -e "${YELLOW}Building Docker image (this may take 10-15 minutes)...${NC}"
docker build -t $ECR_REPO:latest .

# Tag image
echo ""
echo -e "${YELLOW}Tagging image...${NC}"
docker tag $ECR_REPO:latest $IMAGE_URI:latest
docker tag $ECR_REPO:latest $IMAGE_URI:$(date +%Y%m%d-%H%M%S)

# Push to ECR
echo ""
echo -e "${YELLOW}Pushing image to ECR...${NC}"
docker push $IMAGE_URI:latest
docker push $IMAGE_URI:$(date +%Y%m%d-%H%M%S)

echo ""
echo -e "${GREEN}✅ Docker image built and pushed successfully!${NC}"
echo -e "${GREEN}Image URI: ${IMAGE_URI}:latest${NC}"
echo ""
echo -e "${YELLOW}Next steps:${NC}"
echo "1. Your AWS Batch job definition is configured to use this image automatically"
echo "2. Jobs will use Spot instances for GPU processing (70-90% cheaper than on-demand)"
echo "3. Processing typically takes 13-20 minutes total (3-5 min startup + 10-15 min processing)"
