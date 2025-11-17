#!/bin/bash
# Quick check script for EC2 build progress

INSTANCE_ID="i-0e9749385daf71988"
PUBLIC_IP="54.144.121.149"

echo "🔍 Verificando progreso del build..."
echo ""
echo "Instance: $INSTANCE_ID"
echo "IP: $PUBLIC_IP"
echo ""

# Check instance state
STATE=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --region us-east-1 --query 'Reservations[0].Instances[0].State.Name' --output text)
echo "Estado: $STATE"

# Check elapsed time
LAUNCH=$(aws ec2 describe-instances --instance-ids $INSTANCE_ID --region us-east-1 --query 'Reservations[0].Instances[0].LaunchTime' --output text)
echo "Lanzada: $LAUNCH"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 ÚLTIMAS LÍNEAS DEL LOG:"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""

# Get console output (last 30 lines)
aws ec2 get-console-output --instance-id $INSTANCE_ID --region us-east-1 --output text 2>/dev/null | tail -30 || echo "Log no disponible aún (espera 2-3 min)"

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "🔄 Ejecutar de nuevo: ./check-build.sh"
echo ""
echo "🔗 SSH directo:"
echo "   ssh -i sagemaker-build-key.pem ec2-user@$PUBLIC_IP"
echo "   sudo tail -f /var/log/cloud-init-output.log"
echo ""
