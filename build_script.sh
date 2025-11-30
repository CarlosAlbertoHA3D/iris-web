#!/bin/bash
dnf update -y
dnf install -y docker
systemctl start docker
usermod -a -G docker ec2-user

# Descargar codigo
aws s3 cp s3://iris-oculus-data-390844768950/build/build_context.tar.gz /home/ec2-user/context.tar.gz
mkdir /home/ec2-user/build
tar -xzf /home/ec2-user/context.tar.gz -C /home/ec2-user/build

# Login ECR
aws ecr get-login-password --region us-east-1 | docker login --username AWS --password-stdin 390844768950.dkr.ecr.us-east-1.amazonaws.com

# Build (Force x86_64 linux just in case)
cd /home/ec2-user/build
docker build -t iris-totalsegmentator-batch .

# Tag & Push
docker tag iris-totalsegmentator-batch:latest 390844768950.dkr.ecr.us-east-1.amazonaws.com/iris-totalsegmentator-batch:latest
docker push 390844768950.dkr.ecr.us-east-1.amazonaws.com/iris-totalsegmentator-batch:latest

# Avisar (opcional) y apagar
shutdown -h now
