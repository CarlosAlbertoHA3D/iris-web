# AWS Batch Deployment Guide

## 🎯 Arquitectura

El sistema usa **AWS Batch con Spot Instances** para procesamiento GPU on-demand:

- **Costo**: $0.30-0.50/hora (70-90% más barato que SageMaker)
- **Tiempo**: 13-20 min total (3-5 min startup + 10-15 min procesamiento)
- **GPU**: NVIDIA T4 (g4dn.xlarge spot instance)
- **Escalamiento**: Automático, de 0 a múltiples instancias según demanda

## 📋 Prerequisitos

1. AWS CLI configurado
2. Docker instalado
3. Permisos de AWS para:
   - CloudFormation
   - Lambda
   - AWS Batch
   - ECR
   - EC2
   - DynamoDB
   - S3

## 🚀 Paso 1: Deploy de Infraestructura

Desde el directorio `backend/`:

```bash
sam build
sam deploy --guided
```

Durante el `--guided`, acepta los defaults o personaliza:
- **Stack Name**: iris-oculus-backend
- **Region**: us-east-1 (o tu región preferida)
- **Confirm changes**: Y
- **Allow SAM CLI IAM role creation**: Y
- **Save arguments to config**: Y

Esto creará:
- ✅ S3 bucket para archivos
- ✅ DynamoDB para metadata
- ✅ Cognito para autenticación
- ✅ Lambda functions
- ✅ AWS Batch compute environment (Spot instances)
- ✅ ECR repository para Docker image

## 🐳 Paso 2: Build y Push Docker Image

Desde el directorio `backend/batch/`:

```bash
./build-and-push.sh
```

Este script:
1. Construye la imagen Docker con TotalSegmentator
2. La sube a ECR
3. AWS Batch la usará automáticamente

⏱️ **Tiempo estimado**: 10-15 minutos para build + 5 min para push

## 🔧 Paso 3: Configurar Frontend

En `frontend/.env.development`:

```bash
VITE_BACKEND_URL=https://<API_ID>.execute-api.<REGION>.amazonaws.com/Prod
```

Reemplaza `<API_ID>` y `<REGION>` con los valores de tu deployment (los verá en Outputs de CloudFormation).

## ✅ Paso 4: Probar el Sistema

1. Inicia el frontend:
```bash
cd frontend
npm run dev
```

2. Sube un archivo NIFTI
3. Click en "Process with AI"
4. Monitorea el progreso (polling cada 15s)

## 📊 Monitoreo

### Ver jobs en AWS Console:
1. AWS Batch → Job queues → `iris-processing-queue`
2. Ver jobs: SUBMITTED → RUNNING → SUCCEEDED

### Ver logs:
CloudWatch Logs → `/aws/batch/job`

### Ver costos:
Cost Explorer → Filter by tag `Application: iris-oculus`

## 💰 Costos Estimados

Por procesamiento de 1 estudio:

| Componente | Costo |
|------------|-------|
| Spot Instance (g4dn.xlarge, ~20 min) | $0.10-0.17 |
| S3 Storage (por mes) | $0.02 |
| Lambda invocations | $0.00 |
| DynamoDB queries | $0.00 |
| **Total por estudio** | **~$0.12-0.19** |

Comparación:
- SageMaker on-demand: $0.83-1.00 por estudio
- **Ahorro con Batch Spot: 70-90%** 🎉

## 🔄 Actualizar Docker Image

Si modificas el código de procesamiento:

```bash
cd backend/batch
./build-and-push.sh
```

AWS Batch usará la nueva imagen automáticamente en el próximo job.

## 🐛 Troubleshooting

### Error: "ECR repository not found"
→ Deploy el stack CloudFormation primero

### Error: "Spot instance unavailable"
→ AWS Batch reintentará automáticamente o usará on-demand

### Job stuck en RUNNABLE
→ Verifica que el VPC tiene internet gateway configurado

### Job FAILED inmediatamente
→ Revisa CloudWatch Logs para errores del container

## 🔐 Seguridad

- ✅ Cognito para autenticación
- ✅ IAM roles con least privilege
- ✅ VPC con security groups
- ✅ S3 buckets privados
- ✅ ECR con image scanning

## 📈 Escalamiento

AWS Batch escala automáticamente:
- **0 jobs**: 0 instancias (costo $0)
- **1-4 jobs**: 1-4 instancias Spot
- **MaxvCpus = 16**: Máximo 4 instancias g4dn.xlarge simultáneas

## 🎯 Próximos Pasos Opcionales

1. **Optimizar imagen Docker**: Reducir tamaño para builds más rápidos
2. **Multi-region**: Deploy en múltiples regiones
3. **Batch scheduling**: Procesar trabajos en horas de menor costo
4. **Monitoring avanzado**: CloudWatch dashboards
