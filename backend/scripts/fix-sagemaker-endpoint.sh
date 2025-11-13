#!/bin/bash

# Script para arreglar el endpoint de SageMaker que está en estado Failed

set -e

REGION="us-east-1"
ENDPOINT_NAME="iris-totalsegmentator-endpoint"
ENDPOINT_CONFIG_NAME="iris-totalsegmentator-config-autoscale"
MODEL_NAME="iris-totalsegmentator-model-autoscale"

echo "🔍 Verificando estado actual..."

# 1. Verificar endpoint actual
echo ""
echo "1️⃣ Estado del endpoint:"
aws sagemaker describe-endpoint \
    --endpoint-name "$ENDPOINT_NAME" \
    --region "$REGION" \
    --query '[EndpointName,EndpointStatus,CreationTime,LastModifiedTime]' \
    --output table 2>/dev/null || echo "   Endpoint no existe o está en estado Failed"

# 2. Eliminar endpoint fallido
echo ""
echo "2️⃣ Eliminando endpoint fallido (si existe)..."
aws sagemaker delete-endpoint \
    --endpoint-name "$ENDPOINT_NAME" \
    --region "$REGION" 2>/dev/null \
    && echo "   ✅ Endpoint eliminado" \
    || echo "   ℹ️  Endpoint ya no existe"

# 3. Verificar que tenemos la config y el model
echo ""
echo "3️⃣ Verificando configuraciones necesarias..."

CONFIG_EXISTS=$(aws sagemaker describe-endpoint-config \
    --endpoint-config-name "$ENDPOINT_CONFIG_NAME" \
    --region "$REGION" \
    --query 'EndpointConfigName' \
    --output text 2>/dev/null || echo "")

MODEL_EXISTS=$(aws sagemaker describe-model \
    --model-name "$MODEL_NAME" \
    --region "$REGION" \
    --query 'ModelName' \
    --output text 2>/dev/null || echo "")

if [ -z "$CONFIG_EXISTS" ]; then
    echo "   ❌ Endpoint Config no existe: $ENDPOINT_CONFIG_NAME"
    echo "   📝 Necesitas desplegar el backend con SAM para crear los recursos"
    exit 1
else
    echo "   ✅ Endpoint Config existe: $ENDPOINT_CONFIG_NAME"
fi

if [ -z "$MODEL_EXISTS" ]; then
    echo "   ❌ Model no existe: $MODEL_NAME"
    echo "   📝 Necesitas desplegar el backend con SAM para crear el modelo"
    exit 1
else
    echo "   ✅ Model existe: $MODEL_NAME"
fi

echo ""
echo "✅ Limpieza completa!"
echo ""
echo "📋 PRÓXIMOS PASOS:"
echo ""
echo "   1. El endpoint fallido ha sido eliminado"
echo "   2. Los recursos (model + config) están listos"
echo "   3. Cuando presiones 'Process with AI', se creará automáticamente"
echo ""
echo "⏱️  TIEMPOS:"
echo "   - Primera creación: 5-10 minutos (crear endpoint)"
echo "   - Procesamiento: 10-15 minutos"
echo "   - TOTAL primera vez: 15-25 minutos"
echo ""
echo "💰 COSTOS (solo cuando está activo):"
echo "   - ml.g4dn.xlarge: ~\$0.70/hora"
echo "   - Auto-sleep después de 10 min de inactividad"
echo "   - Costo por proceso: ~\$0.12-0.20 (si termina rápido)"
echo ""
echo "🎯 RECOMENDACIÓN:"
echo "   El sistema tiene auto-sleep, así que solo pagas cuando usas."
echo "   Después de cada proceso, el endpoint se apaga automáticamente."
echo ""
