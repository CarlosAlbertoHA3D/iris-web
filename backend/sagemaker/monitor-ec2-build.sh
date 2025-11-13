#!/bin/bash

# Quick script to monitor the EC2 build progress

if [ -f "/tmp/ec2-build-info.txt" ]; then
    source <(grep -E '^(Instance ID|Public IP|Key File):' /tmp/ec2-build-info.txt | sed 's/: /=/g' | tr ' ' '_')
    INSTANCE_ID="${Instance_ID}"
    PUBLIC_IP="${Public_IP}"
    KEY_FILE="${Key_File}"
else
    echo "❌ No se encontró información de la instancia EC2"
    echo "   Ejecuta primero: ./build-on-ec2.sh"
    exit 1
fi

echo "🔍 Monitoreando build en EC2..."
echo ""
echo "Instance ID: $INSTANCE_ID"
echo "Public IP: $PUBLIC_IP"
echo ""
echo "Opciones:"
echo ""
echo "1️⃣  Ver log completo desde AWS:"
echo "   aws ec2 get-console-output --instance-id $INSTANCE_ID --region us-east-1 --output text | tail -50"
echo ""
echo "2️⃣  Conectarse via SSH y ver log en tiempo real:"
echo "   ssh -i $KEY_FILE ec2-user@$PUBLIC_IP"
echo "   tail -f /var/log/sagemaker-build.log"
echo ""
echo "3️⃣  Verificar si el build terminó:"
echo "   ssh -i $KEY_FILE ec2-user@$PUBLIC_IP 'test -f /home/ec2-user/BUILD_COMPLETE && echo COMPLETED || echo RUNNING'"
echo ""

# Check status
echo "📊 Estado actual de la instancia:"
aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --region us-east-1 \
    --query 'Reservations[0].Instances[0].[State.Name,LaunchTime,InstanceType]' \
    --output table

echo ""
echo "⏱️  Tiempo transcurrido desde launch:"
LAUNCH_TIME=$(aws ec2 describe-instances \
    --instance-ids $INSTANCE_ID \
    --region us-east-1 \
    --query 'Reservations[0].Instances[0].LaunchTime' \
    --output text)

CURRENT_TIME=$(date -u +%s)
LAUNCH_TIMESTAMP=$(date -j -f "%Y-%m-%dT%H:%M:%S" "$(echo $LAUNCH_TIME | cut -d. -f1 | tr 'TZ' ' ')" +%s 2>/dev/null || echo $CURRENT_TIME)
ELAPSED=$((CURRENT_TIME - LAUNCH_TIMESTAMP))
ELAPSED_MIN=$((ELAPSED / 60))

echo "   $ELAPSED_MIN minutos"
echo ""

if [ $ELAPSED_MIN -lt 25 ]; then
    echo "⏳ El build aún debería estar en progreso (toma ~20-30 min)"
elif [ $ELAPSED_MIN -lt 35 ]; then
    echo "🤔 El build debería estar terminando pronto"
else
    echo "⚠️  El build debería haber terminado. Verifica los logs."
fi

echo ""
echo "🔄 Actualizar estado:"
echo "   $0"
echo ""
