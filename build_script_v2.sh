#!/bin/bash
exec > >(tee /var/log/user-data.log|logger -t user-data -s 2>/dev/console) 2>&1
echo "Starting build script v2..."
yum update -y
yum install -y docker
service docker start
usermod -a -G docker ec2-user
echo "Downloading code..."
aws s3 cp s3://iris-oculus-data-390844768950/build/build_context.tar.gz /home/ec2-user/context.tar.gz || { echo "S3 download failed"; exit 1; }
mkdir -p /home/ec2-user/build
tar -xzf /home/ec2-user/context.tar.gz -C /home/ec2-user/build
echo "Logging in to ECR..."
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 390844768950.dkr.ecr.us-east-1.amazonaws.com || { echo "ECR login failed"; exit 1; }
echo "Building Docker image..."
cd /home/ec2-user/build
docker build -t iris-totalsegmentator-batch . || { echo "Docker build failed"; exit 1; }
echo "Pushing Docker image..."
docker tag iris-totalsegmentator-batch:latest 390844768950.dkr.ecr.us-east-1.amazonaws.com/iris-totalsegmentator-batch:latest
docker push 390844768950.dkr.ecr.us-east-1.amazonaws.com/iris-totalsegmentator-batch:latest || { echo "Docker push failed"; exit 1; }
echo "Build SUCCESS! Shutting down..."
shutdown -h now
