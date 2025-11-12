# IRIS Oculus - Medical Image Segmentation Platform

Plataforma serverless para segmentación de imágenes médicas usando TotalSegmentator con arquitectura completamente on-demand en AWS.

## 🏗️ Arquitectura

### Backend (AWS Serverless)
- **Lambda Functions**: API endpoints sin servidor
- **SageMaker**: TotalSegmentator con GPU on-demand
- **S3**: Almacenamiento de archivos NIFTI/DICOM y modelos 3D
- **DynamoDB**: Base de datos para metadata
- **API Gateway**: REST API con custom domain

### Frontend (React + Vite)
- **Amplify**: Hosting serverless
- **React 18**: UI framework
- **Three.js**: Visualización 3D
- **TailwindCSS**: Styling
- **TypeScript**: Type safety

## 🚀 Quick Start

### Desarrollo Local

#### Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # o .venv\Scripts\activate en Windows
pip install -r requirements.txt
python app.py
```

Backend corre en `http://localhost:8000`

#### Frontend
```bash
cd frontend
npm install
npm run dev
```

Frontend corre en `http://localhost:5173`

### Deployment a AWS

Ver guía completa en [backend/AWS_DEPLOYMENT_GUIDE.md](backend/AWS_DEPLOYMENT_GUIDE.md)

**Resumen:**
```bash
# 1. Deploy Lambda backend
cd backend/scripts
./deploy-lambda.sh

# 2. Deploy SageMaker endpoint
./deploy-sagemaker.sh

# 3. Deploy frontend a Amplify (desde AWS Console)
# Conecta tu repo GitHub y Amplify detectará amplify.yml
```

## 📁 Estructura del Proyecto

```
iris-web-2/
├── backend/
│   ├── lambdas/           # Lambda functions
│   │   ├── upload/        # File upload handler
│   │   ├── process/       # Processing orchestration
│   │   ├── download/      # File download handler
│   │   └── health/        # Health check
│   ├── sagemaker/         # SageMaker inference code
│   │   ├── Dockerfile     # TotalSegmentator container
│   │   ├── inference.py   # Inference handler
│   │   └── mesh_processing.py
│   ├── layers/            # Lambda layers
│   ├── scripts/           # Deployment scripts
│   ├── template.yaml      # SAM/CloudFormation template
│   ├── app.py            # Local development server (FastAPI)
│   └── requirements.txt
└── frontend/
    ├── src/              # React application
    ├── public/           # Static assets
    ├── amplify.yml       # Amplify build config
    ├── .env.local        # Local development
    ├── .env.production   # Production config
    └── package.json
```

## 🔧 Configuración

### Variables de Entorno

#### Backend (Lambda)
Configuradas automáticamente por SAM template:
- `S3_BUCKET`: Bucket para archivos
- `DYNAMODB_TABLE`: Tabla de metadata
- `SAGEMAKER_ENDPOINT_NAME`: Endpoint de SageMaker

#### Frontend

**`.env.local`** (desarrollo):
```env
VITE_API_URL=http://localhost:8000
```

**`.env.production`** (producción):
```env
VITE_API_URL=https://api.iris-oculus.com
```

## 💰 Costos Estimados (On-Demand)

### Ejemplo: 100 procesamientos/mes

| Servicio | Uso | Costo/Mes |
|----------|-----|-----------|
| Lambda | 15min/job × 100 jobs | ~$2.50 |
| SageMaker GPU | 30min/job × 100 jobs | ~$35.00 |
| S3 | 5GB storage + transfer | ~$0.50 |
| DynamoDB | 100 reads/writes | ~$0.25 |
| Amplify | Hosting + CDN | ~$0.50 |
| **TOTAL** | | **~$39/mes** |

**💡 Sin uso = $0** (excepto S3 storage ~$0.50/mes)

### Ahorro de Costos

```bash
# Detener SageMaker endpoint cuando no esté en uso
cd backend/scripts
./manage-sagemaker.sh stop

# Iniciar cuando lo necesites
./manage-sagemaker.sh start
```

## 🔐 Seguridad

- ✅ S3 buckets privados
- ✅ CORS configurado para dominios específicos
- ✅ IAM roles con permisos mínimos
- ✅ SSL/TLS en todos los endpoints
- ✅ Encryption at rest (S3, DynamoDB)

## 📊 Monitoreo

### CloudWatch Logs
```bash
# Lambda logs
aws logs tail /aws/lambda/iris-process --follow

# SageMaker logs
aws logs tail /aws/sagemaker/Endpoints/iris-totalsegmentator-endpoint --follow
```

### Métricas
- Lambda invocations y errores
- SageMaker inference latency
- S3 storage y requests
- DynamoDB read/write capacity

## 🧪 Testing

```bash
cd frontend
npm test
```

## 📝 API Endpoints

### POST /upload
Sube archivo NIFTI/DICOM

**Request:**
```json
{
  "file": "base64_encoded_file",
  "filename": "scan.nii.gz",
  "userId": "user123"
}
```

**Response:**
```json
{
  "ok": true,
  "jobId": "abc123def456"
}
```

### POST /process/totalseg
Procesa archivo con TotalSegmentator

**Request:**
```json
{
  "jobId": "abc123def456",
  "device": "gpu",
  "fast": true,
  "reduction_percent": 90
}
```

**Response:**
```json
{
  "ok": true,
  "jobId": "abc123def456",
  "status": "processing"
}
```

### GET /files/{jobId}/{filename}
Descarga archivo procesado

**Response:** Binary file (OBJ, MTL, JSON, ZIP)

### GET /healthz
Health check

**Response:**
```json
{
  "ok": true,
  "service": "iris-oculus-api",
  "version": "1.0.0"
}
```

## 🛠️ Tecnologías

### Backend
- Python 3.11
- FastAPI (desarrollo local)
- AWS Lambda (producción)
- TotalSegmentator
- Open3D, Nibabel, scikit-image

### Frontend
- React 18
- TypeScript
- Vite
- Three.js
- TailwindCSS + shadcn/ui
- Zustand (state management)

### Infrastructure
- AWS SAM
- CloudFormation
- Docker
- GitHub (CI/CD ready)

## 🤝 Contribuir

1. Fork el proyecto
2. Crea una rama para tu feature (`git checkout -b feature/AmazingFeature`)
3. Commit tus cambios (`git commit -m 'Add some AmazingFeature'`)
4. Push a la rama (`git push origin feature/AmazingFeature`)
5. Abre un Pull Request

## 📄 Licencia

Este proyecto es privado y propietario.

## 👥 Autores

- **IRIS Oculus Team**

## 🙏 Agradecimientos

- TotalSegmentator por el modelo de segmentación
- AWS por la infraestructura serverless
- Comunidad open source

---

**🌐 Dominio:** https://iris-oculus.com  
**📧 Soporte:** support@iris-oculus.com
