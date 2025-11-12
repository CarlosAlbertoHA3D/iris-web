# IRIS Oculus - Deployment Scripts

Scripts para desplegar y gestionar la infraestructura serverless de IRIS Oculus en AWS.

## 📜 Scripts Disponibles

### 🚀 deploy-lambda.sh

Despliega el backend Lambda con API Gateway, S3, y DynamoDB.

```bash
./deploy-lambda.sh
```

**Duración:** ~5 minutos  
**Requisitos:** AWS CLI, SAM CLI configurados  

**Salida:**
- API Gateway endpoint URL
- S3 bucket name
- DynamoDB table name

---

### 🐳 deploy-sagemaker.sh

Construye y despliega el endpoint de SageMaker con TotalSegmentator.

```bash
./deploy-sagemaker.sh
```

**Duración:** ~15 minutos (construcción de Docker + deployment)  
**Requisitos:** Docker, AWS CLI, backend ya desplegado  

**Pasos:**
1. Crea repositorio ECR
2. Construye Docker image con TotalSegmentator
3. Sube imagen a ECR
4. Crea SageMaker model
5. Crea endpoint configuration (GPU on-demand)
6. Despliega endpoint

**Costo:** ~$0.70/hora cuando está activo

---

### 🌐 configure-custom-domain.sh

Configura custom domain para API Gateway con Route 53.

```bash
./configure-custom-domain.sh
```

**Duración:** ~5 minutos (+ validación de certificado)  
**Requisitos:** Dominio en Route 53  

**Pasos:**
1. Solicita certificado SSL en ACM
2. Valida certificado (DNS o email)
3. Crea custom domain en API Gateway
4. Mapea API al dominio
5. Crea registro A en Route 53

**Resultado:** API disponible en https://api.iris-oculus.com

---

### 🔧 manage-sagemaker.sh

Gestiona el endpoint de SageMaker para ahorrar costos.

```bash
# Ver status
./manage-sagemaker.sh status

# Detener endpoint (ahorra costos)
./manage-sagemaker.sh stop

# Iniciar endpoint
./manage-sagemaker.sh start

# Ayuda
./manage-sagemaker.sh help
```

**Uso típico:**
```bash
# Al final del día
./manage-sagemaker.sh stop    # Detiene billing

# Cuando necesites procesar
./manage-sagemaker.sh start   # Inicia endpoint (~10 min)
```

**Ahorro:** ~$0.70/hora cuando está detenido

---

### 🔨 create-layer.sh

Crea Lambda Layer con dependencias Python.

```bash
./create-layer.sh
```

**Duración:** ~2 minutos  

**Nota:** SAM build hace esto automáticamente. Solo necesario si actualizas dependencies.

---

## 🎯 Flujo de Deployment Completo

### Primera Vez (Full Deployment)

```bash
# 1. Deploy backend infrastructure
./deploy-lambda.sh

# 2. Configure custom domain
./configure-custom-domain.sh

# 3. Deploy SageMaker endpoint
./deploy-sagemaker.sh

# 4. Verify everything works
curl https://api.iris-oculus.com/healthz
```

### Updates del Backend

```bash
# Solo re-deploy Lambda (rápido)
cd ..
sam build && sam deploy
```

### Updates de SageMaker

```bash
# Re-build y re-deploy container
./deploy-sagemaker.sh
```

## 📋 Prerequisitos

Antes de ejecutar los scripts, asegúrate de tener:

### AWS CLI Configurado

```bash
aws configure
# AWS Access Key ID: AKIAIOSFODNN7EXAMPLE
# AWS Secret Access Key: wJalrXUtn...
# Default region: us-east-1
# Default output format: json
```

### SAM CLI Instalado

```bash
# macOS
brew install aws-sam-cli

# Verificar
sam --version
```

### Docker Corriendo

```bash
# macOS
brew install docker

# Verificar
docker --version
docker ps
```

### Permisos IAM

El usuario AWS debe tener permisos para:
- CloudFormation
- Lambda
- API Gateway
- S3
- DynamoDB
- SageMaker
- ECR
- IAM
- ACM (Certificate Manager)
- Route 53

## 🔍 Troubleshooting

### Error: "sam command not found"

```bash
pip install aws-sam-cli
```

### Error: "Docker daemon not running"

```bash
# macOS
open -a Docker
```

### Error: "AccessDenied" en AWS

Verifica permisos IAM del usuario.

### Error: "Stack already exists"

```bash
# Delete stack y re-deploy
aws cloudformation delete-stack --stack-name iris-oculus-backend
./deploy-lambda.sh
```

### SageMaker deployment failed

```bash
# Ver logs
aws logs tail /aws/sagemaker/Endpoints/iris-totalsegmentator-endpoint --follow

# Eliminar endpoint y recrear
./manage-sagemaker.sh stop
./deploy-sagemaker.sh
```

## 📊 Verificación Post-Deployment

### Check Backend

```bash
# Health check
curl https://api.iris-oculus.com/healthz

# Debe retornar:
# {"ok":true,"service":"iris-oculus-api","version":"1.0.0"}
```

### Check SageMaker

```bash
./manage-sagemaker.sh status

# Debe mostrar: InService
```

### Check Logs

```bash
# Lambda logs
aws logs tail /aws/lambda/iris-upload --follow

# SageMaker logs
aws logs tail /aws/sagemaker/Endpoints/iris-totalsegmentator-endpoint --follow
```

## 💡 Tips

### Desarrollo Iterativo

```bash
# Test local antes de deploy
cd ..
sam build
sam local start-api   # Test API locally

# Deploy cuando esté listo
sam deploy
```

### Ver Costos

```bash
# Costos del mes actual
aws ce get-cost-and-usage \
  --time-period Start=$(date -v1d +%Y-%m-%d),End=$(date +%Y-%m-%d) \
  --granularity DAILY \
  --metrics BlendedCost
```

### Cleanup Completo

```bash
# ⚠️ CUIDADO: Elimina TODO
aws cloudformation delete-stack --stack-name iris-oculus-backend
aws sagemaker delete-endpoint --endpoint-name iris-totalsegmentator-endpoint
aws s3 rm s3://iris-oculus-data-${ACCOUNT_ID} --recursive
```

## 📞 Soporte

Si encuentras problemas:

1. Revisa logs de CloudWatch
2. Verifica prerequisitos
3. Consulta [AWS_DEPLOYMENT_GUIDE.md](../AWS_DEPLOYMENT_GUIDE.md)
4. Contacta al equipo de desarrollo

---

**Última actualización:** Nov 2024  
**Mantenido por:** IRIS Oculus Team
