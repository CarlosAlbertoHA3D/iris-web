#!/bin/bash

# Monitor optimized EC2 build progress

INSTANCE_ID="i-08e3b6e1873ff6bf8"
REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)

echo "🔍 Monitoring optimized build progress..."
echo "Instance: ${INSTANCE_ID}"
echo ""

# Check if image exists in ECR
check_ecr() {
    aws ecr describe-images \
        --repository-name iris-totalsegmentator \
        --image-ids imageTag=optimized \
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

# Get image size
get_image_size() {
    CMD_ID=$(aws ssm send-command \
        --instance-ids ${INSTANCE_ID} \
        --document-name "AWS-RunShellScript" \
        --parameters '{"commands":["sudo docker images iris-totalsegmentator:optimized --format=\"{{.Size}}\""]}' \
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

echo "Checking ECR for optimized image..."
if check_ecr > /dev/null 2>&1; then
    echo "✅ Optimized image found in ECR!"
    PUSHED_AT=$(check_ecr)
    echo "Pushed at: ${PUSHED_AT}"
    echo ""
    
    # Get image details
    IMAGE_INFO=$(aws ecr describe-images \
        --repository-name iris-totalsegmentator \
        --image-ids imageTag=optimized \
        --region ${REGION} \
        --query 'imageDetails[0]' \
        --output json)
    
    echo "Image details:"
    echo "${IMAGE_INFO}" | python3 -m json.tool
    echo ""
    
    # Calculate size in GB
    SIZE_BYTES=$(echo "${IMAGE_INFO}" | python3 -c "import sys, json; print(json.load(sys.stdin)['imageSizeInBytes'])")
    SIZE_GB=$(echo "scale=2; ${SIZE_BYTES} / 1073741824" | bc)
    echo "📊 Compressed size: ${SIZE_GB} GB"
    echo ""
    
    # Create Serverless endpoint with correct image
    echo "🎯 Creating SageMaker Serverless endpoint with optimized image..."
    
    MODEL_NAME="iris-totalsegmentator-model-optimized"
    ENDPOINT_CONFIG_NAME="iris-totalsegmentator-config-optimized"
    ENDPOINT_NAME="iris-totalsegmentator-endpoint"
    
    # Get SageMaker role
    ROLE_ARN=$(aws cloudformation describe-stacks \
        --stack-name iris-oculus-backend \
        --query 'Stacks[0].Outputs[?OutputKey==`SageMakerRoleArn`].OutputValue' \
        --output text \
        --region ${REGION})
    
    # Delete old model if exists
    aws sagemaker delete-model --model-name ${MODEL_NAME} --region ${REGION} 2>/dev/null || true
    sleep 3
    
    # Create SageMaker model with optimized image
    echo "📋 Creating SageMaker model with optimized image..."
    aws sagemaker create-model \
        --model-name ${MODEL_NAME} \
        --primary-container Image=${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/iris-totalsegmentator:optimized,Mode=SingleModel \
        --execution-role-arn ${ROLE_ARN} \
        --region ${REGION}
    
    # Delete old config
    aws sagemaker delete-endpoint-config --endpoint-config-name ${ENDPOINT_CONFIG_NAME} --region ${REGION} 2>/dev/null || true
    sleep 5
    
    # Create Serverless endpoint configuration (3GB limit)
    echo "⚙️  Creating Serverless endpoint configuration..."
    aws sagemaker create-endpoint-config \
        --endpoint-config-name ${ENDPOINT_CONFIG_NAME} \
        --production-variants \
            VariantName=AllTraffic,ModelName=${MODEL_NAME},ServerlessConfig="{MemorySizeInMB=3072,MaxConcurrency=5}" \
        --region ${REGION}
    
    # Delete old endpoint
    aws sagemaker delete-endpoint --endpoint-name ${ENDPOINT_NAME} --region ${REGION} 2>/dev/null || true
    sleep 10
    
    # Create endpoint
    echo "🎯 Creating SageMaker Serverless endpoint..."
    aws sagemaker create-endpoint \
        --endpoint-name ${ENDPOINT_NAME} \
        --endpoint-config-name ${ENDPOINT_CONFIG_NAME} \
        --region ${REGION}
    
    echo ""
    echo "✅ Endpoint creation initiated!"
    echo "📊 Monitor with: aws sagemaker describe-endpoint --endpoint-name ${ENDPOINT_NAME} --region ${REGION}"
    echo ""
    
    # Terminate EC2
    echo "🗑️  Terminating EC2 instance..."
    aws ec2 terminate-instances --instance-ids ${INSTANCE_ID} --region ${REGION}
    echo "✅ EC2 terminated"
    
else
    echo "⏳ Optimized image not yet in ECR. Checking build progress..."
    echo ""
    echo "Build logs:"
    get_logs
    echo ""
    echo "Run this script again in 5-10 minutes to check progress."
fi
