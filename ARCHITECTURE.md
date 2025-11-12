# IRIS Oculus - Arquitectura Serverless

## Diagrama de Arquitectura

```
┌─────────────────────────────────────────────────────────────────────┐
│                         USUARIO                                      │
│                    (iris-oculus.com)                                 │
└──────────────────────────────┬──────────────────────────────────────┘
                               │
                ┌──────────────┴───────────────┐
                │                              │
                ▼                              ▼
┌───────────────────────────┐   ┌──────────────────────────────┐
│   AWS Amplify (Frontend)  │   │  Route 53 + CloudFront       │
│   - React + Vite          │   │  - DNS Management            │
│   - Static Hosting        │   │  - SSL/TLS Certificates      │
│   - Auto SSL              │   │  - CDN                       │
└───────────┬───────────────┘   └──────────────┬───────────────┘
            │                                  │
            │                                  │
            │        API Requests              │
            └──────────────────┬───────────────┘
                               │
                               ▼
               ┌───────────────────────────────┐
               │   API Gateway (REST API)      │
               │   - Custom Domain             │
               │   - api.iris-oculus.com       │
               │   - CORS Enabled              │
               │   - SSL/TLS                   │
               └───────────┬───────────────────┘
                           │
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
┌─────────────┐   ┌─────────────┐   ┌─────────────┐
│   Lambda    │   │   Lambda    │   │   Lambda    │
│   Upload    │   │   Process   │   │  Download   │
└──────┬──────┘   └──────┬──────┘   └──────┬──────┘
       │                 │                 │
       │                 │                 │
       ▼                 ▼                 ▼
┌──────────────────────────────────────────────────┐
│                    AWS S3                         │
│   - uploads/           (input files)              │
│   - results/           (processed models)         │
│   - sagemaker-inputs/  (processing payloads)      │
└──────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────┐
│              DynamoDB Table                       │
│   - jobId (PK)                                    │
│   - userId + createdAt (GSI)                      │
│   - status, artifacts, metadata                   │
│   - TTL: 90 days                                  │
└──────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────┐
│       SageMaker On-Demand Endpoint                │
│   - Instance: ml.g4dn.xlarge (GPU)                │
│   - TotalSegmentator + Mesh Processing            │
│   - Docker Container (ECR)                        │
│   - Auto-scaling (0-N instances)                  │
└──────────────────────────────────────────────────┘
                          │
                          ▼
┌──────────────────────────────────────────────────┐
│       Amazon ECR (Container Registry)             │
│   - iris-totalsegmentator:latest                  │
└──────────────────────────────────────────────────┘
```

## Flujo de Datos

### 1. Upload de Archivo NIFTI/DICOM

```
Usuario → Amplify → API Gateway → Lambda Upload
                                      ↓
                                    S3 (uploads/)
                                      ↓
                                  DynamoDB (metadata)
                                      ↓
                          Response: {jobId: "abc123"}
```

### 2. Procesamiento con TotalSegmentator

```
Usuario → Amplify → API Gateway → Lambda Process
                                      ↓
                          Query DynamoDB (get job)
                                      ↓
                          Prepare SageMaker payload
                                      ↓
                       Save payload to S3 (sagemaker-inputs/)
                                      ↓
                    Invoke SageMaker Endpoint (async)
                                      ↓
                    ┌─────────────────────────────┐
                    │   SageMaker Processing      │
                    │   1. Download from S3       │
                    │   2. Run TotalSegmentator   │
                    │   3. Generate meshes        │
                    │   4. Decimate polygons      │
                    │   5. Export OBJ/MTL/JSON    │
                    │   6. Upload to S3           │
                    └─────────────────────────────┘
                                      ↓
                          Update DynamoDB (status)
                                      ↓
                    Response: {status: "processing"}
```

### 3. Descarga de Resultados

```
Usuario → Amplify → API Gateway → Lambda Download
                                      ↓
                          Query DynamoDB (verify job)
                                      ↓
                         Get file from S3 (results/)
                                      ↓
                      Response: Binary file (OBJ/MTL/JSON)
```

## Componentes Principales

### Frontend (Amplify)
- **Framework:** React 18 + Vite
- **Styling:** TailwindCSS + shadcn/ui
- **3D Rendering:** Three.js
- **State:** Zustand
- **Hosting:** AWS Amplify
- **Domain:** iris-oculus.com
- **Costo:** ~$0.50/mes (casi gratis)

### Backend API (Lambda + API Gateway)
- **Runtime:** Python 3.11
- **Functions:**
  - `iris-upload` - File upload handler
  - `iris-process` - Processing orchestration
  - `iris-download` - File download handler
  - `iris-health` - Health check
- **Memory:** 3008 MB
- **Timeout:** 900s (15 min)
- **Domain:** api.iris-oculus.com
- **Costo:** ~$2.50/mes (100 requests)

### Processing Engine (SageMaker)
- **Instance:** ml.g4dn.xlarge (NVIDIA T4 GPU)
- **Container:** Custom Docker (ECR)
- **Software:**
  - TotalSegmentator 2.2.1+
  - Open3D (mesh processing)
  - scikit-image (marching cubes)
- **Scaling:** On-demand (0-1 instances)
- **Costo:** ~$0.70/hora SOLO cuando procesa

### Storage (S3)
- **Bucket:** iris-oculus-data-{AccountId}
- **Folders:**
  - `uploads/` - Input NIFTI/DICOM files
  - `results/` - Processed 3D models
  - `sagemaker-inputs/` - Processing payloads
- **Lifecycle:** 90 days TTL
- **Costo:** ~$0.50/mes (5GB)

### Database (DynamoDB)
- **Table:** iris-oculus-metadata
- **Billing:** Pay-per-request
- **Indexes:**
  - PK: jobId
  - GSI: userId + createdAt
- **TTL:** 90 days
- **Costo:** ~$0.25/mes (100 ops)

## Seguridad

### Network
- ✅ HTTPS/TLS en todos los endpoints
- ✅ Custom domains con SSL certificates (ACM)
- ✅ CORS configurado para dominios específicos
- ✅ Private S3 buckets (no public access)

### IAM
- ✅ Least privilege roles
- ✅ Separate roles por servicio:
  - Lambda execution role
  - SageMaker execution role
- ✅ No hardcoded credentials

### Data
- ✅ Encryption at rest (S3, DynamoDB)
- ✅ Encryption in transit (TLS 1.2+)
- ✅ TTL para limpieza automática
- ✅ Presigned URLs para downloads

## Escalabilidad

### Horizontal Scaling
- **Lambda:** Auto-scales a 1000 concurrent executions
- **SageMaker:** On-demand, puede escalar a múltiples instancias
- **DynamoDB:** Auto-scaling con pay-per-request
- **S3:** Infinito

### Performance
- **API Response:** <100ms (Lambda cold start: 1-2s)
- **Upload:** ~1s para archivos de 100MB
- **Processing:** 2-5 min por escaneo CT
- **Download:** <1s para archivos OBJ

## Monitoring

### CloudWatch Logs
- `/aws/lambda/iris-upload`
- `/aws/lambda/iris-process`
- `/aws/lambda/iris-download`
- `/aws/sagemaker/Endpoints/iris-totalsegmentator-endpoint`

### Métricas
- Lambda: Invocations, Errors, Duration
- SageMaker: ModelLatency, Invocations
- API Gateway: 4xxError, 5xxError, Latency
- DynamoDB: ConsumedReadCapacity, ConsumedWriteCapacity

### Alarmas (Recomendadas)
- Lambda errors > 10%
- SageMaker endpoint status != InService
- API Gateway 5xx errors > 5%
- S3 storage > 100GB

## Disaster Recovery

### Backups
- **DynamoDB:** Point-in-time recovery enabled
- **S3:** Versioning enabled
- **Lambda:** Code stored in S3 + Git

### Recovery
- **RTO:** <1 hora (re-deploy completo)
- **RPO:** <5 minutos (DynamoDB PITR)

## Cost Optimization

### On-Demand Strategy
1. **SageMaker:** Delete endpoint cuando no esté en uso
   ```bash
   ./manage-sagemaker.sh stop  # No cost
   ./manage-sagemaker.sh start # Only when needed
   ```

2. **Lambda:** Pay per invocation (no idle cost)

3. **S3:** Lifecycle policies para archivar/eliminar archivos viejos

4. **DynamoDB:** Pay-per-request (no provisioned capacity)

### Costo Proyectado

| Escenario | Costo/Mes |
|-----------|-----------|
| 0 requests | $0-1 |
| 10 requests | $5-10 |
| 100 requests | $35-40 |
| 1000 requests | $350-400 |

**Breakpoint:** >1000 requests/mes → considerar reserved instances

## CI/CD Pipeline

```
Git Push (main)
      ↓
GitHub Actions
      ↓
┌─────────────────┐
│  Build & Test   │
└────────┬────────┘
         │
    ┌────┴────┐
    ▼         ▼
Backend   Frontend
(SAM)     (Amplify)
    ↓         ↓
   AWS      AWS
  Lambda  Amplify
```

## Future Enhancements

### Short Term
- [ ] Cognito authentication
- [ ] WebSocket for real-time updates
- [ ] CloudFront CDN
- [ ] WAF protection

### Long Term
- [ ] Multi-region deployment
- [ ] Batch processing (Step Functions)
- [ ] Machine learning model versioning
- [ ] Advanced analytics (QuickSight)

---

**Última actualización:** $(date)
