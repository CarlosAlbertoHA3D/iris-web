#!/bin/bash
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1
echo "Starting build script v3 (Ubuntu)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y docker.io awscli tar
systemctl start docker
usermod -a -G docker ubuntu
echo "Downloading code..."
aws s3 cp s3://iris-oculus-data-390844768950/build/build_context.tar.gz /home/ubuntu/context.tar.gz || { echo "S3 download failed"; exit 1; }
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
