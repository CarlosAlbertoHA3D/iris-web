# Abrir Caso de AWS Support - Plantilla

## 🚨 URGENTE: Cuotas EC2 Bloqueando Producción

Tu cuenta no tiene AWS Support Plan activo. Tienes dos opciones:

---

## Opción 1: Contactar a través de AWS Console (GRATIS)

### Paso 1: Ir a Support Center
https://console.aws.amazon.com/support/home

### Paso 2: Click en "Create case"
- Si no ves el botón, ve a: **Account and billing support** (esto es gratis)

### Paso 3: Llenar el formulario:

**Subject:**
```
Critical: Unable to launch EC2 instances - All quota increase requests rejected
```

**Category:** Account and billing support

**Type:** Service limit increase

**Descripción (copia y pega):**
```
Dear AWS Support Team,

CRITICAL ISSUE - Medical Imaging Platform Blocked

Account ID: 390844768950
Application: IRIS Oculus Medical Imaging Platform
Production URL: https://iris-oculus.com
Region: us-east-1

PROBLEM:
We are completely unable to launch ANY EC2 instances for our production medical imaging application. All automated quota increase requests are being rejected immediately.

QUOTAS AFFECTED:
1. Running On-Demand G and VT instances (GPU): 0 vCPUs (Quota L-3819A6DF)
2. Running On-Demand Standard instances (C5): 0 or severely limited vCPUs (Quota L-1216C47A)
3. All Standard Spot Instance Requests (C5): 0 or severely limited vCPUs (Quota L-34B43A08)

BUSINESS IMPACT:
- IRIS Oculus is a production medical imaging platform that processes CT and MRI scans for healthcare professionals
- Application uses AWS Batch + EC2 for AI-powered 3D anatomical segmentation using TotalSegmentator
- Currently BLOCKED: Cannot process any medical imaging studies
- Healthcare professionals are waiting for processed scans for clinical decision-making

ARCHITECTURE:
- AWS Batch with containerized TotalSegmentator AI model
- Target instance: c5.2xlarge (8 vCPUs) for CPU processing or g4dn.xlarge (4 vCPUs + GPU) for GPU processing
- Minimum requirement: 2-8 vCPUs to process a single medical study
- Stack: ECR + Batch + Lambda + DynamoDB + S3 + Cognito
- Backend: SAM/CloudFormation deployed
- Processing time: 45-60 minutes per study on CPU

ATTEMPTS MADE:
1. Requested GPU Spot quota increase (L-3819A6DF) → REJECTED
2. Attempted to use CPU On-Demand instances → Cannot launch (insufficient quota)
3. Attempted to use CPU Spot instances → Cannot launch (insufficient quota)
4. All automated Service Quotas requests are being rejected

IMMEDIATE REQUEST:
We urgently need manual review and approval for ONE of the following:
- Option 1 (Preferred): 8 vCPUs for GPU Spot instances (g4dn.xlarge) - for optimal performance
- Option 2 (Acceptable): 16 vCPUs for CPU On-Demand Standard instances (c5.2xlarge) - for reliable processing
- Option 3 (Acceptable): 16 vCPUs for CPU Spot Standard instances (c5.2xlarge) - cost-effective
- Option 4 (Minimum): 4 vCPUs for CPU Spot/On-Demand (c5.large) - to at least get the application working

JUSTIFICATION:
- This is a production medical application serving healthcare professionals
- Processing medical imaging data is time-sensitive for patient care
- Application is fully deployed and tested, only blocked by quota limits
- We are willing to start with minimal capacity (even 2-4 vCPUs) to demonstrate usage
- We will implement auto-scaling and cost controls

TECHNICAL DETAILS:
- Batch Compute Environment: iris-cpu-spot-compute-v3
- Job Queue: iris-processing-queue
- Job Definition: iris-totalsegmentator-job:2
- Current Job Status: RUNNABLE (waiting for instances that cannot launch)

We appreciate urgent attention to this matter as it affects medical professionals' ability to analyze patient imaging studies.

Thank you,
IRIS Oculus Development Team
Contact: diva3d.developer@gmail.com
```

**Contact Method:**
- Email: diva3d.developer@gmail.com

---

## Opción 2: Solicitar Cuotas Directamente (GRATIS)

### Ir a Service Quotas y solicitar:
https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas

### Solicitar CUALQUIERA de estas (en orden de preferencia):

1. **GPU Spot (Preferred):**
   - Quota: "All G and VT Spot Instance Requests"
   - Código: L-3819A6DF
   - Valor actual: 0
   - Solicitar: 8 vCPUs
   - Justificación: Ver texto arriba

2. **CPU Spot (Alternative):**
   - Quota: "All Standard (A, C, D, H, I, M, R, T, Z) Spot Instance Requests"
   - Código: L-34B43A08
   - Valor actual: Posiblemente 0
   - Solicitar: 16 vCPUs
   - Justificación: Ver texto arriba

3. **CPU On-Demand (Alternative):**
   - Quota: "Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances"
   - Código: L-1216C47A
   - Valor actual: Posiblemente 0
   - Solicitar: 16 vCPUs
   - Justificación: Ver texto arriba

---

## 💡 Tips para Aumentar Probabilidad de Aprobación

1. **Usar Business Email:** diva3d.developer@gmail.com
2. **Enfatizar Uso Médico:** Aplicación de salud en producción
3. **Mostrar Preparación:** Toda la infra ya está deployada
4. **Ser Razonable:** Empezar con mínimo (8 vCPUs GPU o 16 vCPUs CPU)
5. **Seguimiento:** Si rechazan, responder explicando la urgencia médica

---

## ⏱️ Tiempos Esperados

- **Account Support Case:** 24-48 horas de respuesta
- **Service Quotas Request:** 1-3 días hábiles
- **Premium Support (si lo activas):** 1-4 horas

---

## 🔄 Mientras Tanto: Probando c5.large

Voy a modificar el sistema para usar c5.large (2 vCPUs) mientras esperamos respuesta de AWS.
