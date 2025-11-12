# IRIS Oculus - AWS Serverless Deployment Guide

## Arquitectura Overview

Esta aplicación está completamente serverless y on-demand para minimizar costos:

- **Lambda Functions**: Para API endpoints (upload, process, download, health)
- **SageMaker On-Demand**: Para TotalSegmentator con GPU (solo paga cuando procesa)
- **S3**: Para almacenar archivos NIFTI/DICOM y modelos procesados
- **DynamoDB**: Para metadata de jobs
- **Amplify**: Para hosting del frontend
- **Route 53**: Para DNS del dominio iris-oculus.com

## Requisitos Previos

1. **AWS CLI instalado y configurado**
   ```bash
   aws configure
   ```

2. **SAM CLI instalado**
   ```bash
   brew install aws-sam-cli  # macOS
   # o
   pip install aws-sam-cli
   ```

3. **Docker instalado** (para SageMaker)
   ```bash
   # Verifica con:
   docker --version
   ```

4. **Dominio iris-oculus.com ya configurado en Route 53**

## Paso 1: Desplegar Backend Lambda

```bash
cd backend/scripts
chmod +x deploy-lambda.sh
./deploy-lambda.sh
```

Esto creará:
- ✅ API Gateway con endpoints REST
- ✅ Lambda functions para cada endpoint
- ✅ S3 bucket para datos
- ✅ DynamoDB table para metadata
- ✅ Roles y permisos IAM

**Output esperado:** API Gateway URL

## Paso 2: Configurar Custom Domain en API Gateway

1. Ve a API Gateway Console
2. Selecciona "Custom domain names"
3. Crea un nuevo dominio: `api.iris-oculus.com`
4. Asocia con el certificado SSL de ACM (debes crear uno primero)
5. Mapea el dominio a tu API stage (Prod)
6. En Route 53, crea un registro A (alias) apuntando a tu API Gateway domain

## Paso 3: Desplegar SageMaker Endpoint

```bash
cd backend/scripts
chmod +x deploy-sagemaker.sh
./deploy-sagemaker.sh
```

Esto:
- ✅ Construye Docker image con TotalSegmentator
- ✅ Sube imagen a ECR
- ✅ Crea SageMaker model
- ✅ Crea endpoint configuration con GPU on-demand
- ✅ Despliega endpoint (tarda ~10 min)

**Tipo de instancia:** `ml.g4dn.xlarge` (GPU, on-demand)

**Costo aproximado:** 
- ~$0.70/hora SOLO cuando está procesando
- Escala a 0 cuando no está en uso

## Paso 4: Actualizar Frontend con API URL

Edita `/frontend/.env.production`:

```env
VITE_API_URL=https://api.iris-oculus.com
```

## Paso 5: Desplegar Frontend en Amplify

### Opción A: Desde Amplify Console (Recomendado)

1. Ve a AWS Amplify Console
2. Click "New app" → "Host web app"
3. Conecta tu repositorio GitHub
4. Selecciona branch: `main`
5. Amplify detectará automáticamente `amplify.yml`
6. Build settings:
   - Build command: `npm run build`
   - Build output directory: `dist`
7. Click "Save and deploy"

### Opción B: Desde CLI

```bash
# Instala Amplify CLI
npm install -g @aws-amplify/cli

# Inicializa Amplify
cd frontend
amplify init

# Agrega hosting
amplify add hosting

# Publica
amplify publish
```

## Paso 6: Configurar Custom Domain en Amplify

1. En Amplify Console, ve a "Domain management"
2. Agrega dominio personalizado: `iris-oculus.com`
3. Amplify configurará automáticamente:
   - Certificado SSL
   - Registros DNS en Route 53
   - Redirección www → apex

## Configuración de CORS

El template SAM ya incluye configuración de CORS para:
- ✅ `https://iris-oculus.com`
- ✅ `http://localhost:5173`

Si necesitas agregar más orígenes, edita `template.yaml`:

```yaml
Globals:
  Api:
    Cors:
      AllowOrigin: "'https://iris-oculus.com,http://localhost:5173,https://www.iris-oculus.com'"
```

## Monitoreo y Logs

### CloudWatch Logs

```bash
# Ver logs de Lambda
aws logs tail /aws/lambda/iris-upload --follow

# Ver logs de SageMaker
aws logs tail /aws/sagemaker/Endpoints/iris-totalsegmentator-endpoint --follow
```

### Métricas

- Lambda: CloudWatch → Lambda → Funciones
- SageMaker: CloudWatch → SageMaker → Endpoints
- S3: CloudWatch → S3 → Buckets
- DynamoDB: CloudWatch → DynamoDB → Tables

## Estimación de Costos (On-Demand)

### Escenario: 100 procesamiento/mes, 5GB almacenamiento

| Servicio | Costo Mensual |
|----------|---------------|
| Lambda (15min/job × 100 jobs) | ~$2.50 |
| SageMaker (30min/job × 100 jobs, GPU) | ~$35.00 |
| S3 (5GB storage + transfer) | ~$0.50 |
| DynamoDB (100 reads/writes) | ~$0.25 |
| Amplify (frontend hosting) | ~$0.50 |
| **TOTAL** | **~$39/mes** |

**Nota:** Con la configuración on-demand, NO pagas cuando no hay uso.

## Troubleshooting

### Error: SageMaker endpoint no responde

```bash
# Verifica status del endpoint
aws sagemaker describe-endpoint --endpoint-name iris-totalsegmentator-endpoint

# Si está "Failed", revisa logs
aws logs tail /aws/sagemaker/Endpoints/iris-totalsegmentator-endpoint --follow
```

### Error: Lambda timeout

Aumenta timeout en `template.yaml`:

```yaml
Globals:
  Function:
    Timeout: 900  # máximo para Lambda
```

### Error: CORS en frontend

Verifica que la API URL en `.env.production` sea correcta y que CORS esté configurado en SAM template.

## Comandos Útiles

```bash
# Ver estado del stack
aws cloudformation describe-stacks --stack-name iris-oculus-backend

# Actualizar stack después de cambios
sam build && sam deploy

# Eliminar todo (⚠️ CUIDADO)
aws cloudformation delete-stack --stack-name iris-oculus-backend
aws sagemaker delete-endpoint --endpoint-name iris-totalsegmentator-endpoint
```

## Seguridad

1. **API Gateway**: Considera agregar API Key o Cognito authentication
2. **S3**: Los buckets son privados por defecto, usa presigned URLs
3. **DynamoDB**: Habilita encryption at rest
4. **Secrets**: Usa AWS Secrets Manager para credenciales

## Próximos Pasos

1. ✅ Configurar autenticación con Cognito
2. ✅ Agregar CloudFront CDN para mejor performance
3. ✅ Implementar WAF para protección
4. ✅ Configurar backups automáticos con AWS Backup
5. ✅ Agregar CI/CD con GitHub Actions

## Soporte

Para issues o preguntas, contacta al equipo de desarrollo.
