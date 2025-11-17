#!/bin/bash
# Script para ejecutar DENTRO de la instancia EC2
# Copia y pega este script completo en la terminal SSH

set -e

echo "🚀 Iniciando build de imagen Docker en EC2..."
echo ""

# Get account ID
ACCOUNT=$(aws sts get-caller-identity --query Account --output text)
echo "✅ Account: $ACCOUNT"

# Login to ECR
echo ""
echo "🔐 Logging into ECR..."
aws ecr get-login-password --region us-east-1 | sudo docker login --username AWS --password-stdin ${ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com
echo "✅ ECR login successful"

# Clone repository
echo ""
echo "📥 Clonando repositorio..."
cd /home/ec2-user
if [ -d "iris-web" ]; then
    echo "Repositorio ya existe, actualizando..."
    cd iris-web
    git pull
    cd ..
else
    git clone https://github.com/CarlosAlbertoHA3D/iris-web.git
fi
echo "✅ Repositorio clonado"

# Build image
echo ""
echo "🔨 Construyendo imagen Docker..."
echo "   Esto tomará 10-20 minutos..."
cd /home/ec2-user/iris-web/backend/sagemaker
sudo docker build -t iris-totalsegmentator:fixed-healthcheck .
echo "✅ Build completado"

# Tag image
echo ""
echo "🏷️  Taggeando imagen..."
sudo docker tag iris-totalsegmentator:fixed-healthcheck ${ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com/iris-totalsegmentator:fixed-healthcheck
echo "✅ Tag completado"

# Push to ECR
echo ""
echo "📤 Subiendo imagen a ECR..."
echo "   Esto tomará 5-10 minutos..."
sudo docker push ${ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com/iris-totalsegmentator:fixed-healthcheck
echo "✅ Push completado"

# Mark as done
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ BUILD COMPLETADO EXITOSAMENTE"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Imagen disponible en:"
echo "   ${ACCOUNT}.dkr.ecr.us-east-1.amazonaws.com/iris-totalsegmentator:fixed-healthcheck"
echo ""
echo "Puedes salir de la instancia (exit) y terminarla desde tu máquina local:"
echo "   aws ec2 terminate-instances --instance-ids i-0e9749385daf71988 --region us-east-1"
echo ""

date > /home/ec2-user/BUILD_COMPLETE
