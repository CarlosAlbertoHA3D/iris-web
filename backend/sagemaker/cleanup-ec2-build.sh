#!/bin/bash

echo "🗑️  Limpieza de recursos de build EC2..."
echo ""

REGION="us-east-1"

# Try to get instance info from temp file
if [ -f "/tmp/ec2-build-info.txt" ]; then
    INSTANCE_ID=$(grep "Instance ID:" /tmp/ec2-build-info.txt | cut -d: -f2 | xargs)
    echo "📋 Instancia encontrada: $INSTANCE_ID"
else
    echo "❌ No se encontró /tmp/ec2-build-info.txt"
    echo ""
    echo "Buscando instancias con tag Purpose=Temporary..."
    INSTANCE_ID=$(aws ec2 describe-instances \
        --filters "Name=tag:Purpose,Values=Temporary" "Name=instance-state-name,Values=running,pending" \
        --region $REGION \
        --query 'Reservations[0].Instances[0].InstanceId' \
        --output text 2>/dev/null)
    
    if [ "$INSTANCE_ID" == "None" ] || [ -z "$INSTANCE_ID" ]; then
        echo "❌ No se encontraron instancias temporales activas"
        exit 0
    else
        echo "📋 Instancia encontrada: $INSTANCE_ID"
    fi
fi

# Verify image was pushed before terminating
echo ""
echo "🔍 Verificando si la imagen se subió a ECR..."
IMAGE_EXISTS=$(aws ecr describe-images \
    --repository-name iris-totalsegmentator \
    --image-ids imageTag=fixed-healthcheck \
    --region $REGION \
    --query 'imageDetails[0].imageTags' \
    --output text 2>/dev/null || echo "None")

if [ "$IMAGE_EXISTS" != "None" ]; then
    echo "   ✅ Imagen encontrada en ECR: fixed-healthcheck"
else
    echo "   ⚠️  Imagen NO encontrada en ECR"
    read -p "   ¿Continuar con la terminación de todas formas? (y/N): " -n 1 -r
    echo
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "   ❌ Cancelado. Verifica el build primero."
        exit 1
    fi
fi

# Terminate instance
echo ""
echo "🛑 Terminando instancia EC2..."
aws ec2 terminate-instances \
    --instance-ids $INSTANCE_ID \
    --region $REGION \
    --output table

echo ""
echo "⏳ Esperando que la instancia se termine..."
aws ec2 wait instance-terminated --instance-ids $INSTANCE_ID --region $REGION 2>/dev/null || true

echo "   ✅ Instancia terminada"

# Ask about cleanup of other resources
echo ""
echo "🧹 ¿Quieres limpiar otros recursos? (Security Group, Key Pair, IAM Role)"
read -p "   Limpiar todo? (y/N): " -n 1 -r
echo

if [[ $REPLY =~ ^[Yy]$ ]]; then
    echo ""
    echo "🔒 Eliminando Security Group..."
    SG_ID=$(aws ec2 describe-security-groups \
        --filters "Name=group-name,Values=sagemaker-build-sg" \
        --region $REGION \
        --query 'SecurityGroups[0].GroupId' \
        --output text 2>/dev/null || echo "None")
    
    if [ "$SG_ID" != "None" ]; then
        # Wait a bit for ENI to detach
        sleep 10
        aws ec2 delete-security-group --group-id $SG_ID --region $REGION 2>/dev/null \
            && echo "   ✅ Security Group eliminado" \
            || echo "   ⚠️  No se pudo eliminar (puede estar en uso aún)"
    fi
    
    echo ""
    echo "🔑 Eliminando Key Pair..."
    aws ec2 delete-key-pair --key-name sagemaker-build-key --region $REGION 2>/dev/null \
        && echo "   ✅ Key Pair eliminado" \
        || echo "   ℹ️  Key Pair no existe"
    
    if [ -f "sagemaker-build-key.pem" ]; then
        rm sagemaker-build-key.pem
        echo "   ✅ Archivo .pem eliminado localmente"
    fi
    
    echo ""
    echo "👤 Eliminando IAM Role..."
    # Detach policies
    aws iam remove-role-from-instance-profile \
        --instance-profile-name EC2-SageMaker-Builder \
        --role-name EC2-SageMaker-Builder 2>/dev/null || true
    
    aws iam delete-instance-profile \
        --instance-profile-name EC2-SageMaker-Builder 2>/dev/null \
        && echo "   ✅ Instance Profile eliminado" \
        || echo "   ℹ️  Instance Profile no existe"
    
    aws iam detach-role-policy \
        --role-name EC2-SageMaker-Builder \
        --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess 2>/dev/null || true
    
    aws iam delete-role \
        --role-name EC2-SageMaker-Builder 2>/dev/null \
        && echo "   ✅ IAM Role eliminado" \
        || echo "   ℹ️  IAM Role no existe"
else
    echo "   ℹ️  Recursos mantenidos (puedes reutilizarlos en builds futuros)"
fi

# Clean temp file
if [ -f "/tmp/ec2-build-info.txt" ]; then
    rm /tmp/ec2-build-info.txt
    echo ""
    echo "🗑️  Archivo temporal eliminado"
fi

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ LIMPIEZA COMPLETADA"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "📋 Siguiente paso:"
echo "   Verifica que la imagen esté en ECR:"
echo "   aws ecr describe-images --repository-name iris-totalsegmentator --region us-east-1"
echo ""
