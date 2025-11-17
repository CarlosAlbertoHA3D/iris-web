# AWS Batch No Está Escalando - Diagnóstico

## ❌ Problema Actual

**Síntomas:**
- Job: `aws-bcb0c625604e` (Batch: `7e0f1f55-8cdb-4458-9845-37d5219f2402`)
- Status: `RUNNABLE` por más de 10 minutos
- `desiredvCpus`: permanece en 0
- No se arranca ninguna instancia EC2

**Configuración Correcta:**
- ✅ DEVICE: cpu
- ✅ vCPUs: 8
- ✅ Compute Environment: ENABLED & VALID
- ✅ Job Queue: ENABLED & VALID
- ✅ VPC/Subnet: configuradas correctamente
- ✅ Service Role: existe y está configurado

## 🔍 Causa Más Probable

**Cuota de vCPUs On-Demand Insuficiente**

AWS Batch necesita cuota de vCPUs para arrancar instancias On-Demand. Similar al problema con GPU, es posible que también tengas cuota limitada de vCPUs On-Demand standard.

## ✅ Solución 1: Verificar Cuota de vCPUs On-Demand

### Paso 1: Ir a Service Quotas
https://console.aws.amazon.com/servicequotas/home/services/ec2/quotas

### Paso 2: Buscar las siguientes cuotas:
1. **"Running On-Demand Standard (A, C, D, H, I, M, R, T, Z) instances"**
   - Código: `L-1216C47A`
   - Necesitas: **mínimo 8 vCPUs** (para 1x c5.2xlarge)
   - Recomendado: **16 vCPUs** (para 2 jobs concurrentes)

2. **"All Standard (A, C, D, H, I, M, R, T, Z) Spot Instance Requests"**
   - Por si decides usar Spot en lugar de On-Demand

### Paso 3: Solicitar Aumento
Si la cuota actual es < 8 vCPUs:
1. Click en la cuota
2. "Request quota increase"
3. Solicitar **16 vCPUs**
4. Justificación:
```
Running IRIS Oculus medical imaging platform on AWS Batch with c5.2xlarge instances (8 vCPUs each).
Application processes CT/MRI scans using AI segmentation. Need capacity for 2 concurrent jobs.
Currently blocked - cannot launch instances due to 0 vCPU quota.
Production site: iris-oculus.com
```

## ✅ Solución 2: Usar Spot Instances (Alternativa Temporal)

Si Spot instances tienen cuota disponible, podemos cambiar temporalmente:

### Ventajas:
- ✅ Puede tener cuota disponible inmediatamente
- ✅ ~70% más barato que On-Demand
- ❌ Puede interrumpirse (raro para c5.2xlarge)
- ❌ Tarda más en arrancar (~3-5 min vs 2-3 min)

### Para cambiar a Spot CPU:
```bash
# Modificar template.yaml compute environment:
Type: SPOT  # Cambiar de EC2 a SPOT
AllocationStrategy: SPOT_CAPACITY_OPTIMIZED
BidPercentage: 100  # Pagar hasta el 100% del precio On-Demand
```

## 🔧 Solución 3: Usar Instancia Más Pequeña

Si c5.2xlarge (8 vCPUs) no tiene cuota, probar con c5.xlarge (4 vCPUs):

### Cambiar en template.yaml:
```yaml
instanceTypes:
  - c5.xlarge  # 4 vCPUs, 8 GB RAM
```

### Cambiar en Job Definition:
```yaml
Vcpus: 4  # Reducir de 8 a 4
Memory: 8192  # Reducir de 16384 a 8192
```

**Impacto:**
- Procesamiento más lento: ~60-75 min (vs 45-60 min)
- Pero al menos funciona

## 📊 Verificar Cuota Actual (CLI)

```bash
# Verificar cuota de vCPUs On-Demand Standard
aws service-quotas get-service-quota \
  --service-code ec2 \
  --quota-code L-1216C47A \
  --region us-east-1
```

## 🎯 Acción Inmediata Recomendada

1. **Ir a Service Quotas** y verificar cuota On-Demand vCPUs
2. **Solicitar aumento** a 16 vCPUs (justificación arriba)
3. Mientras tanto, **cancelar el job actual**:
   ```bash
   aws batch terminate-job \
     --job-id 7e0f1f55-8cdb-4458-9845-37d5219f2402 \
     --reason "Waiting for vCPU quota increase"
   ```

## 📞 Soporte AWS

Si el problema persiste después de aumentar cuota:
- Abrir caso de soporte en AWS Console
- Incluir: JobId, Compute Environment ARN, región
- Pedir ayuda para diagnosticar por qué Batch no escala

---

## 🔄 Estado Actual

- **GPU Quota**: Solicitada (L-3819A6DF) - PENDING
- **CPU On-Demand Quota**: Necesita verificación (L-1216C47A)
- **Job actual**: Bloqueado en RUNNABLE

## 💡 Recomendación Final

**Opción A (Recomendada):**
1. Solicitar cuota On-Demand vCPUs (16)
2. Esperar aprobación (1-2 días)
3. Procesamiento rápido y confiable

**Opción B (Temporal):**
1. Cambiar a Spot CPU
2. Funciona ahora (si tiene cuota)
3. Más barato pero puede interrumpirse

**Opción C (Workaround):**
1. Usar instancia más pequeña (c5.xlarge)
2. Más lento pero funciona
3. Requiere menos cuota
