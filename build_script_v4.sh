#!/bin/bash
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1
echo "Starting build script v4 (Presigned URL)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y docker.io awscli tar wget
systemctl start docker
usermod -a -G docker ubuntu
echo "Downloading code with Presigned URL..."
wget -O /home/ubuntu/context.tar.gz "https://iris-oculus-data-390844768950.s3.us-east-1.amazonaws.com/build/build_context.tar.gz?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Credential=AKIAVWABJ4K3LS4Y4MF4%2F20251128%2Fus-east-1%2Fs3%2Faws4_request&X-Amz-Date=20251128T213814Z&X-Amz-Expires=3600&X-Amz-SignedHeaders=host&X-Amz-Signature=71e17bd293cc76b77576cdb7f56021d00c015b275903a9ecba9e23b7b7d28aa9" || { echo "Download failed"; exit 1; }
mkdir -p /home/ubuntu/build
tar -xzf /home/ubuntu/context.tar.gz -C /home/ubuntu/build
echo "Logging in to ECR..."
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 390844768950.dkr.ecr.us-east-1.amazonaws.com || { echo "ECR login failed"; exit 1; }
echo "Building Docker image..."
cd /home/ubuntu/build
docker build -t iris-totalsegmentator-batch . || { echo "Docker build failed"; exit 1; }
echo "Pushing Docker image..."
docker tag iris-totalsegmentator-batch:latest 390844768950.dkr.ecr.us-east-1.amazonaws.com/iris-totalsegmentator-batch:latest
docker push 390844768950.dkr.ecr.us-east-1.amazonaws.com/iris-totalsegmentator-batch:latest || { echo "Docker push failed"; exit 1; }
echo "Build SUCCESS! Shutting down..."
shutdown -h now
