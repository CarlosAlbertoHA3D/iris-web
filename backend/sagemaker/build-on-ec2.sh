#!/bin/bash
set -e

echo "🚀 Construyendo imagen Docker en EC2 temporal..."
echo ""

# Configuration
REGION="us-east-1"
INSTANCE_TYPE="t3.xlarge"  # 4 vCPU, 16GB RAM - Good for Docker builds
AMI_ID="ami-0e731c8a588258d0d"  # Amazon Linux 2023 (us-east-1)
KEY_NAME="sagemaker-build-key"
SECURITY_GROUP_NAME="sagemaker-build-sg"
REPO_URL="https://github.com/CarlosAlbertoHA3D/iris-web.git"
TAG="${1:-fixed-healthcheck}"

echo "📋 Configuración:"
echo "   Region: $REGION"
echo "   Instance: $INSTANCE_TYPE"
echo "   AMI: $AMI_ID"
echo "   Tag: $TAG"
echo ""

# Check if key pair exists, create if not
echo "🔑 Verificando key pair..."
if ! aws ec2 describe-key-pairs --key-names $KEY_NAME --region $REGION &>/dev/null; then
    echo "   Creando nuevo key pair..."
    aws ec2 create-key-pair \
        --key-name $KEY_NAME \
        --region $REGION \
        --query 'KeyMaterial' \
        --output text > ${KEY_NAME}.pem
    chmod 400 ${KEY_NAME}.pem
    echo "   ✅ Key pair creado: ${KEY_NAME}.pem"
else
    echo "   ✅ Key pair ya existe"
fi

# Check if security group exists, create if not
echo ""
echo "🔒 Verificando security group..."
SG_ID=$(aws ec2 describe-security-groups \
    --filters "Name=group-name,Values=$SECURITY_GROUP_NAME" \
    --region $REGION \
    --query 'SecurityGroups[0].GroupId' \
    --output text 2>/dev/null || echo "None")

if [ "$SG_ID" == "None" ]; then
    echo "   Creando security group..."
    SG_ID=$(aws ec2 create-security-group \
        --group-name $SECURITY_GROUP_NAME \
        --description "Temporary SG for SageMaker image builds" \
        --region $REGION \
        --query 'GroupId' \
        --output text)
    
    # Allow SSH from your IP only (more secure)
    MY_IP=$(curl -s ifconfig.me)
    aws ec2 authorize-security-group-ingress \
        --group-id $SG_ID \
        --protocol tcp \
        --port 22 \
        --cidr ${MY_IP}/32 \
        --region $REGION
    
    echo "   ✅ Security group creado: $SG_ID (SSH desde $MY_IP)"
else
    echo "   ✅ Security group existe: $SG_ID"
fi

# Get default VPC subnet
echo ""
echo "🌐 Obteniendo subnet..."
SUBNET_ID=$(aws ec2 describe-subnets \
    --filters "Name=default-for-az,Values=true" \
    --region $REGION \
    --query 'Subnets[0].SubnetId' \
    --output text)
echo "   ✅ Subnet: $SUBNET_ID"

# Create IAM instance profile if it doesn't exist
echo ""
echo "👤 Verificando IAM role..."
ROLE_NAME="EC2-SageMaker-Builder"
INSTANCE_PROFILE_ARN=$(aws iam get-instance-profile \
    --instance-profile-name $ROLE_NAME \
    --query 'InstanceProfile.Arn' \
    --output text 2>/dev/null || echo "None")

if [ "$INSTANCE_PROFILE_ARN" == "None" ]; then
    echo "   Creando IAM role..."
    
    # Create trust policy
    cat > /tmp/trust-policy.json <<EOF
{
  "Version": "2012-10-17",
  "Statement": [{
    "Effect": "Allow",
    "Principal": {"Service": "ec2.amazonaws.com"},
    "Action": "sts:AssumeRole"
  }]
}
EOF
    
    # Create role
    aws iam create-role \
        --role-name $ROLE_NAME \
        --assume-role-policy-document file:///tmp/trust-policy.json \
        --description "Role for EC2 to build and push SageMaker images"
    
    # Attach policies
    aws iam attach-role-policy \
        --role-name $ROLE_NAME \
        --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess
    
    # Create instance profile
    aws iam create-instance-profile --instance-profile-name $ROLE_NAME
    aws iam add-role-to-instance-profile \
        --instance-profile-name $ROLE_NAME \
        --role-name $ROLE_NAME
    
    echo "   ⏳ Esperando 10 segundos para que el role se propague..."
    sleep 10
    
    echo "   ✅ IAM role creado"
else
    echo "   ✅ IAM role existe"
fi

# Create user data script
cat > /tmp/user-data.sh <<'USERDATA'
#!/bin/bash
set -e

echo "🐳 Iniciando build de imagen Docker en EC2..."
exec > >(tee /var/log/sagemaker-build.log)
exec 2>&1

# Install Docker
echo "📦 Instalando Docker..."
yum update -y
yum install -y docker git
systemctl start docker
systemctl enable docker
usermod -a -G docker ec2-user

# Install Docker Compose
echo "📦 Instalando Docker Compose..."
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
chmod +x /usr/local/bin/docker-compose

# Login to ECR
echo "🔐 Login a ECR..."
REGION="us-east-1"
ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
aws ecr get-login-password --region $REGION | docker login --username AWS --password-stdin ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com

# Clone repository
echo "📥 Clonando repositorio..."
cd /home/ec2-user
git clone REPO_URL iris-web
cd iris-web/backend/sagemaker

# Build image
echo "🔨 Construyendo imagen Docker..."
echo "   Esto tomará 10-20 minutos..."
docker build -t iris-totalsegmentator:TAG -f Dockerfile .

# Tag for ECR
echo "🏷️  Taggeando imagen..."
docker tag iris-totalsegmentator:TAG ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/iris-totalsegmentator:TAG

# Push to ECR
echo "📤 Subiendo a ECR..."
docker push ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/iris-totalsegmentator:TAG

echo ""
echo "✅ ¡Build completado exitosamente!"
echo "📋 Imagen: ${ACCOUNT_ID}.dkr.ecr.${REGION}.amazonaws.com/iris-totalsegmentator:TAG"
echo ""
echo "🎯 La instancia EC2 se puede terminar ahora"
echo "   Ejecuta: aws ec2 terminate-instances --instance-ids <INSTANCE_ID>"

# Save completion marker
touch /home/ec2-user/BUILD_COMPLETE
USERDATA

# Replace placeholders
sed -i.bak "s|REPO_URL|$REPO_URL|g" /tmp/user-data.sh
sed -i.bak "s|TAG|$TAG|g" /tmp/user-data.sh

# Launch EC2 instance
echo ""
echo "🚀 Lanzando instancia EC2..."
INSTANCE_ID=$(aws ec2 run-instances \
    --image-id $AMI_ID \
    --instance-type $INSTANCE_TYPE \
    --key-name $KEY_NAME \
    --security-group-ids $SG_ID \
    --subnet-id $SUBNET_ID \
    --iam-instance-profile Name=$ROLE_NAME \
    --user-data file:///tmp/user-data.sh \
    --block-device-mappings '[{"DeviceName":"/dev/xvda","Ebs":{"VolumeSize":50,"VolumeType":"gp3"}}]' \
    --tag-specifications "ResourceType=instance,Tags=[{Key=Name,Value=SageMaker-Image-Builder},{Key=Purpose,Value=Temporary},{Key=AutoTerminate,Value=true}]" \
    --region $REGION \
    --query 'Instances[0].InstanceId' \
    --output text)

echo "   ✅ Instancia lanzada: $INSTANCE_ID"

# Wait for instance to be running
echo ""
echo "⏳ Esperando que la instancia esté running..."
aws ec2 wait instance-running --instance-ids $INSTANCE_ID --region $REGION
echo "   ✅ Instancia running"

# Get public IP
PUBLIC_IP=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --region $REGION \
    --query 'Reservations[0].Instances[0].PublicIpAddress' \
    --output text)

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ INSTANCIA EC2 CONFIGURADA"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Detalles:"
echo "   Instance ID: $INSTANCE_ID"
echo "   Public IP: $PUBLIC_IP"
echo "   Type: $INSTANCE_TYPE"
echo "   Region: $REGION"
echo ""
echo "🔍 Monitorear progreso:"
echo "   ssh -i ${KEY_NAME}.pem ec2-user@${PUBLIC_IP}"
echo "   tail -f /var/log/sagemaker-build.log"
echo ""
echo "📊 O desde aquí:"
echo "   aws ec2 get-console-output --instance-id $INSTANCE_ID --region $REGION --output text"
echo ""
echo "⏱️  El build tomará aproximadamente:"
echo "   - Docker install: 2-3 min"
echo "   - Image build: 10-20 min"
echo "   - Image push: 5-10 min"
echo "   - TOTAL: ~20-30 minutos"
echo ""
echo "💰 Costo estimado:"
echo "   - t3.xlarge: \$0.1664/hora"
echo "   - 30 minutos: ~\$0.08"
echo "   - Transfer out: ~\$0.50 (9GB image)"
echo "   - TOTAL: ~\$0.58"
echo ""
echo "🗑️  Terminar instancia cuando complete:"
echo "   aws ec2 terminate-instances --instance-ids $INSTANCE_ID --region $REGION"
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Save instance info
cat > /tmp/ec2-build-info.txt <<EOF
Instance ID: $INSTANCE_ID
Public IP: $PUBLIC_IP
Instance Type: $INSTANCE_TYPE
Region: $REGION
Key File: ${KEY_NAME}.pem
Tag: $TAG

Terminate command:
aws ec2 terminate-instances --instance-ids $INSTANCE_ID --region $REGION

Monitor command:
ssh -i ${KEY_NAME}.pem ec2-user@${PUBLIC_IP}
tail -f /var/log/sagemaker-build.log
EOF

echo "💾 Información guardada en: /tmp/ec2-build-info.txt"
echo ""
