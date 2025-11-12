# IRIS Oculus - Quick Start Guide

## 🎯 Objetivo

Desplegar IRIS Oculus completamente serverless en AWS con costos on-demand (solo pagas cuando usas).

## ⏱️ Tiempo Estimado

- **Primer deployment:** ~30 minutos
- **Deployments subsecuentes:** ~5 minutos

## 📋 Prerequisitos

Antes de comenzar, asegúrate de tener:

- ✅ Cuenta AWS activa
- ✅ AWS CLI instalado y configurado
- ✅ SAM CLI instalado
- ✅ Docker instalado (para SageMaker)
- ✅ Node.js 18+ (para frontend)
- ✅ Dominio `iris-oculus.com` configurado en Route 53

### Instalar herramientas

```bash
# AWS CLI
curl "https://awscli.amazonaws.com/AWSCLIV2.pkg" -o "AWSCLIV2.pkg"
sudo installer -pkg AWSCLIV2.pkg -target /

# SAM CLI
brew install aws-sam-cli

# Docker
brew install docker

# Verificar instalaciones
aws --version
sam --version
docker --version
node --version
```

## 🚀 Deployment en 5 Pasos

### Paso 1: Clonar y Preparar

```bash
git clone <tu-repo>
cd iris-web-2
```

### Paso 2: Desplegar Backend Lambda (5 min)

```bash
cd backend/scripts
chmod +x *.sh
./deploy-lambda.sh
```

**Output esperado:**
```
✅ Deployment complete!
🌐 API Endpoint: https://xxxxxx.execute-api.us-east-1.amazonaws.com/Prod/
```

**Copia el API Endpoint** - lo necesitarás después.

### Paso 3: Configurar Custom Domain (5 min)

```bash
./configure-custom-domain.sh
```

Esto:
- ✅ Crea certificado SSL en ACM
- ✅ Configura API Gateway custom domain
- ✅ Crea registro DNS en Route 53

**Nota:** Si es la primera vez, debes validar el certificado SSL por email o DNS.

### Paso 4: Desplegar SageMaker (15 min)

```bash
./deploy-sagemaker.sh
```

**⚠️ Advertencia:** Este paso tarda ~10 minutos. El endpoint usará GPU on-demand.

**Costo:** ~$0.70/hora SOLO cuando está procesando. Puedes detenerlo cuando no lo uses:

```bash
# Detener endpoint (sin costo)
./manage-sagemaker.sh stop

# Iniciar cuando lo necesites
./manage-sagemaker.sh start
```

### Paso 5: Desplegar Frontend en Amplify (5 min)

#### Opción A: Desde AWS Console (Recomendado)

1. Ve a [AWS Amplify Console](https://console.aws.amazon.com/amplify/)
2. Click **"New app"** → **"Host web app"**
3. Conecta tu repositorio GitHub
4. Amplify detectará automáticamente `amplify.yml`
5. En **Environment variables**, agrega:
   ```
   VITE_API_URL = https://api.iris-oculus.com
   ```
6. Click **"Save and deploy"**

#### Opción B: Manual

```bash
cd ../../frontend
npm install
npm run build

# Sube dist/ a S3 o usa Amplify CLI
amplify publish
```

## ✅ Verificación

### 1. Test Backend

```bash
# Health check
curl https://api.iris-oculus.com/healthz

# Debería retornar:
# {"ok":true,"service":"iris-oculus-api","version":"1.0.0"}
```

### 2. Test Frontend

Abre en tu navegador:
```
https://iris-oculus.com
```

### 3. Test Completo

1. Sube un archivo NIFTI en la UI
2. Haz click en "Process"
3. Espera 2-5 minutos
4. Descarga el modelo 3D generado

## 💰 Costos Esperados

### Sin uso activo
- **$0-1/mes** (solo S3 storage mínimo)

### Con 100 procesamientos/mes
- Lambda: ~$2.50
- SageMaker GPU: ~$35
- S3: ~$0.50
- DynamoDB: ~$0.25
- Amplify: ~$0.50
- **Total: ~$39/mes**

## 🛑 Detener Servicios (Ahorrar Costos)

```bash
cd backend/scripts

# Detener SageMaker endpoint
./manage-sagemaker.sh stop

# Para eliminar TODO (⚠️ cuidado)
aws cloudformation delete-stack --stack-name iris-oculus-backend
```

## 🔧 Configuración Adicional

### GitHub Actions CI/CD

1. Ve a GitHub repository → Settings → Secrets
2. Agrega los secretos AWS (ver `.github/SETUP_SECRETS.md`)
3. Cada push a `main` desplegará automáticamente

### Custom Domain SSL

El certificado SSL se valida automáticamente si tu dominio está en Route 53. Si usas otro DNS:

1. Ve a ACM Console
2. Click en tu certificado
3. Copia los registros CNAME
4. Agrégalos en tu DNS provider

## 🐛 Troubleshooting

### Error: "Certificate not validated"

```bash
# Verifica estado del certificado
aws acm describe-certificate --certificate-arn <arn>

# Si está pendiente, valida por email o DNS
```

### Error: "SageMaker endpoint failed"

```bash
# Revisa logs
aws logs tail /aws/sagemaker/Endpoints/iris-totalsegmentator-endpoint --follow

# Recrea endpoint
./manage-sagemaker.sh stop
./manage-sagemaker.sh start
```

### Error: "CORS policy blocked"

Verifica:
1. API URL en frontend `.env.production` es correcta
2. CORS está configurado en `backend/template.yaml`
3. Re-deploy backend si cambiaste CORS

### Frontend no carga

```bash
# Verifica build local
cd frontend
npm run build
npm run preview

# Revisa logs de Amplify
# Amplify Console → App → Build logs
```

## 📚 Documentación Completa

- [README.md](README.md) - Overview general
- [backend/AWS_DEPLOYMENT_GUIDE.md](backend/AWS_DEPLOYMENT_GUIDE.md) - Guía detallada de AWS
- [.github/SETUP_SECRETS.md](.github/SETUP_SECRETS.md) - Configurar GitHub Actions

## 🆘 Soporte

¿Problemas? 

1. Revisa [AWS_DEPLOYMENT_GUIDE.md](backend/AWS_DEPLOYMENT_GUIDE.md)
2. Verifica logs en CloudWatch
3. Contacta al equipo de desarrollo

---

**🎉 ¡Listo!** Tu plataforma serverless está corriendo.
