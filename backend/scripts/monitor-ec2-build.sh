#!/bin/bash

# Monitor EC2 build progress and complete SageMaker deployment

INSTANCE_ID="i-069595468ceff2d34"
REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "🔍 Monitoring EC2 build progress..."
echo "Instance: ${INSTANCE_ID}"
echo ""

# Check if image exists in ECR
check_ecr() {
    aws ecr describe-images \
        --repository-name iris-totalsegmentator \
        --region ${REGION} \
        --query 'imageDetails[0].imagePushedAt' \
        --output text 2>/dev/null
}

# Get build logs from EC2
get_logs() {
    CMD_ID=$(aws ssm send-command \
        --instance-ids ${INSTANCE_ID} \
        --document-name "AWS-RunShellScript" \
        --parameters '{"commands":["tail -50 /tmp/output.log 2>/dev/null || echo No logs yet"]}' \
        --region ${REGION} \
        --query 'Command.CommandId' \
        --output text)
    
    sleep 5
    
    aws ssm get-command-invocation \
        --command-id ${CMD_ID} \
        --instance-id ${INSTANCE_ID} \
        --region ${REGION} \
        --query 'StandardOutputContent' \
        --output text 2>/dev/null
}

echo "Checking ECR..."
if check_ecr > /dev/null 2>&1; then
    echo "✅ Image found in ECR!"
    PUSHED_AT=$(check_ecr)
    echo "Pushed at: ${PUSHED_AT}"
    echo ""
    echo "🎯 Proceeding with SageMaker endpoint creation..."
    echo ""
    
    # Continue with SageMaker deployment
    cd "$(dirname "$0")"
    
    # Get SageMaker role
    ROLE_ARN=$(aws cloudformation describe-stacks \
        --stack-name iris-oculus-backend \
        --query 'Stacks[0].Outputs[?OutputKey==`SageMakerRoleArn`].OutputValue' \
        --output text \
        --region ${REGION})
    
    MODEL_NAME="iris-totalsegmentator-model"
    ENDPOINT_CONFIG_NAME="iris-totalsegmentator-config"
    ENDPOINT_NAME="iris-totalsegmentator-endpoint"
    
    # Create SageMaker model
    echo "📋 Creating SageMaker model..."
    aws sagemaker create-model \
        --model-name ${MODEL_NAME} \
        --primary-container Image=${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/iris-totalsegmentator:latest,Mode=SingleModel \
        --execution-role-arn ${ROLE_ARN} \
        --region ${REGION} 2>/dev/null || echo "Model already exists"
    
    # Delete old endpoint config if exists
    echo "🗑️  Removing old endpoint configuration if exists..."
    aws sagemaker delete-endpoint-config --endpoint-config-name ${ENDPOINT_CONFIG_NAME} --region ${REGION} 2>/dev/null || true
    sleep 5
    
    # Create Serverless endpoint configuration
    echo "⚙️  Creating Serverless endpoint configuration..."
    aws sagemaker create-endpoint-config \
        --endpoint-config-name ${ENDPOINT_CONFIG_NAME} \
        --production-variants \
            VariantName=AllTraffic,ModelName=${MODEL_NAME},ServerlessConfig={MemorySizeInMB=6144,MaxConcurrency=5} \
        --region ${REGION}
    
    # Delete old endpoint if exists
    echo "🗑️  Removing old endpoint if exists..."
    aws sagemaker delete-endpoint --endpoint-name ${ENDPOINT_NAME} --region ${REGION} 2>/dev/null || true
    sleep 10
    
    # Create Serverless endpoint
    echo "🎯 Creating SageMaker Serverless endpoint..."
    aws sagemaker create-endpoint \
        --endpoint-name ${ENDPOINT_NAME} \
        --endpoint-config-name ${ENDPOINT_CONFIG_NAME} \
        --region ${REGION}
    
    echo ""
    echo "✅ SageMaker Serverless endpoint deployment initiated!"
    echo ""
    echo "📊 Monitor status with:"
    echo "   aws sagemaker describe-endpoint --endpoint-name ${ENDPOINT_NAME} --region ${REGION}"
    echo ""
    
    # Terminate EC2
    echo "🗑️  Terminating EC2 instance..."
    aws ec2 terminate-instances --instance-ids ${INSTANCE_ID} --region ${REGION}
    echo "✅ EC2 terminated"
    
else
    echo "⏳ Image not yet in ECR. Checking build progress..."
    echo ""
    get_logs
    echo ""
    echo "Run this script again in 5-10 minutes to check progress."
fi
