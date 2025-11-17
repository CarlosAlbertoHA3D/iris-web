# 🧪 Probar el Sistema IRIS + TotalSegmentator

## ✅ Pre-requisitos Completados

- [x] Infraestructura AWS deployada
- [x] Docker image en ECR
- [x] Frontend configurado
- [x] AWS Batch listo

## 🎯 Test End-to-End

### 1. Iniciar Frontend

```bash
cd frontend
npm install
npm run dev
```

Abre: http://localhost:5173

### 2. Crear Usuario

1. Click en "Sign Up" o "Registrarse"
2. Email: tu-email@example.com
3. Password: MínimO_8_caracteres1
4. Verifica email si es necesario

### 3. Subir Archivo NIFTI

**Opción A: Archivo de prueba**
Descarga sample: https://www.nitrc.org/frs/download.php/11818/TotalSegmentator_test_data.zip

**Opción B: Crear dummy file**
```bash
# Solo para testing (no procesará correctamente pero prueba el flujo)
dd if=/dev/zero of=test.nii.gz bs=1M count=10
```

1. En la UI, arrastra el archivo .nii.gz
2. Espera que cargue en el visor

### 4. Procesar con AI

1. Click **"Process with AI"**
2. Observa los mensajes:
   - "Uploading study to secure storage..."
   - "Job submitted to GPU processing queue..."
   - Status: queued → processing → completed

### 5. Monitorear Progreso

**En UI:**
- Progreso se actualiza cada 15s
- Verás: 0% → 45% → 80% → 100%

**En AWS Console:**
1. AWS Batch → Job queues → iris-processing-queue
2. Ver job: SUBMITTED → RUNNABLE → STARTING → RUNNING → SUCCEEDED

**CloudWatch Logs:**
```bash
# Buscar logs del job
aws logs tail /aws/batch/job --follow
```

### 6. Ver Resultados

Cuando status = "completed":
- Modelos 3D aparecen en el visualizador
- Puedes descargar el ZIP con todos los archivos
- Panel derecho muestra estructuras anatómicas

---

## ⏱️ Tiempos Esperados

| Fase | Tiempo | Detalles |
|------|--------|----------|
| Upload | 10-30s | Dependiendo del tamaño |
| Spot Instance Startup | 3-5 min | Primera vez más largo |
| TotalSegmentator | 10-15 min | Con --fast |
| Mesh Generation | 2-3 min | Simplificación 90% |
| **Total** | **15-23 min** | Primera ejecución |

**Ejecuciones subsecuentes**: ~13-18 min (instancia ya caliente)

---

## 🔍 Verificar en AWS Console

### Batch Job
```bash
# Ver status del último job
aws batch list-jobs \
  --job-queue iris-processing-queue \
  --job-status RUNNING \
  --output table
```

### DynamoDB
```bash
# Ver job en DB
aws dynamodb scan \
  --table-name iris-oculus-metadata \
  --limit 5 \
  --output table
```

### S3 Artifacts
```bash
# Listar resultados (reemplaza JOB_ID)
aws s3 ls s3://iris-oculus-data-390844768950/results/JOB_ID/
```

Deberías ver:
```
Result.obj
materials.mtl
Result.json
result.zip
```

---

## 🐛 Troubleshooting

### Job stuck en RUNNABLE
**Causa**: No hay instancias disponibles o subnet sin internet  
**Fix**: 
```bash
# Verificar compute environment
aws batch describe-compute-environments \
  --compute-environments iris-gpu-spot-compute
```

### Job FAILED inmediatamente
**Causa**: Image pull error o permisos  
**Fix**: Ver CloudWatch logs
```bash
aws logs tail /aws/batch/job --follow
```

### "Not authenticated" en frontend
**Causa**: Token expiró  
**Fix**: Logout y login nuevamente

### S3 upload error
**Causa**: CORS o presigned URL expirado  
**Fix**: Verificar CORS en S3 bucket

---

## 📊 Métricas a Observar

### Costos
```bash
# Ver costos de hoy
aws ce get-cost-and-usage \
  --time-period Start=2025-11-16,End=2025-11-17 \
  --granularity DAILY \
  --metrics BlendedCost \
  --filter file://cost-filter.json
```

`cost-filter.json`:
```json
{
  "Tags": {
    "Key": "Application",
    "Values": ["iris-oculus"]
  }
}
```

### Performance
- Tiempo total de procesamiento
- Tamaño de archivos generados
- Calidad de meshes (triángulos)

---

## ✅ Checklist de Testing

- [ ] Usuario puede registrarse
- [ ] Usuario puede subir NIFTI
- [ ] Visor muestra el estudio
- [ ] "Process with AI" inicia job
- [ ] Job aparece en AWS Batch
- [ ] Status se actualiza en UI
- [ ] Job completa exitosamente
- [ ] Modelos 3D aparecen en visor
- [ ] Se puede descargar ZIP
- [ ] Costos están dentro de lo esperado ($0.12-0.19/estudio)

---

## 🎉 Éxito

Si todos los pasos funcionan, tienes:
- ✅ Pipeline completo de segmentación médica
- ✅ Infraestructura on-demand cost-effective
- ✅ Visualización 3D interactiva
- ✅ Sistema escalable para múltiples usuarios

**Costo por estudio**: ~$0.12-0.19 (70-90% más barato que SageMaker)
