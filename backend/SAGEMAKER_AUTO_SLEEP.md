# SageMaker Auto-Sleep/Wake System

## 🎯 Objetivo

Sistema serverless que mantiene el costo de SageMaker en **$0 cuando no se usa**, creando y eliminando automáticamente el endpoint según demanda.

---

## 🏗️ Arquitectura

```
Usuario → API Gateway → Lambda (Process)
                          ↓
                    Lambda (SageMaker Manager)
                          ↓
                    ¿Endpoint existe?
                    ├─ NO → Crear endpoint (5-10 min)
                    └─ SÍ → Usar endpoint existente
                          ↓
                    SageMaker (GPU Processing)
                          ↓
                    S3 (Resultados)

EventBridge (cada 15 min) → Lambda (Manager) → ¿Actividad reciente?
                                                  ├─ NO → Eliminar endpoint ($0)
                                                  └─ SÍ → Mantener activo
```

---

## 📊 Componentes

### 1. **Lambda: SageMaker Manager** (`iris-sagemaker-manager`)

**Responsabilidades:**
- ✅ Auto-wake: Crear endpoint cuando se necesita
- ✅ Auto-sleep: Eliminar endpoint después de inactividad
- ✅ Tracking: Registrar actividad en DynamoDB

**Acciones soportadas:**

```python
# Wake up endpoint (usado por Lambda de procesamiento)
{
  "action": "wake"
}

# Check for auto-sleep (invocado por EventBridge cada 15 min)
{
  "action": "sleep"
}

# Get status
{
  "action": "status"
}
```

### 2. **DynamoDB: Activity Table** (`iris-sagemaker-activity`)

Almacena timestamps de última actividad para determinar cuándo hacer auto-sleep.

**Schema:**
```
{
  "endpoint": "iris-totalsegmentator-endpoint",  // Partition key
  "timestamp": 1699888888,                        // Unix timestamp
  "datetime": "2024-11-12T10:00:00Z"              // ISO string
}
```

### 3. **EventBridge Rule** (`iris-sagemaker-autosleep`)

Ejecuta cada 15 minutos para verificar inactividad y hacer auto-sleep.

**Schedule:** `rate(15 minutes)`

### 4. **Lambda: Process** (`iris-process`)

Modificada para invocar auto-wake antes de procesar:

```python
# Before processing
ensure_endpoint_awake()  # Wake if sleeping, wait if needed

# Then process
sagemaker_runtime.invoke_endpoint(...)
```

---

## ⏱️ Flujos de Trabajo

### Flujo 1: Primera solicitud (Endpoint dormido)

```
1. Usuario sube archivo
2. Lambda Process invoca SageMaker Manager (wake)
3. Manager detecta que endpoint no existe
4. Manager crea endpoint (5-10 minutos)
5. Manager espera a que esté "InService"
6. Manager retorna "ready"
7. Lambda Process invoca endpoint
8. Procesamiento completa
9. Resultados guardados en S3
```

**Tiempo total:** 15-25 minutos (5-10 min wake + 10-15 min proceso)

### Flujo 2: Solicitud con endpoint activo

```
1. Usuario sube archivo
2. Lambda Process invoca SageMaker Manager (wake)
3. Manager detecta que endpoint ya existe y está "InService"
4. Manager registra actividad y retorna "ready"
5. Lambda Process invoca endpoint inmediatamente
6. Procesamiento completa (10-15 min)
7. Resultados guardados en S3
```

**Tiempo total:** 10-15 minutos

### Flujo 3: Auto-Sleep

```
1. EventBridge ejecuta cada 15 minutos
2. Invoca SageMaker Manager (sleep)
3. Manager consulta última actividad en DynamoDB
4. Si > 15 minutos sin actividad:
   - Manager elimina endpoint
   - Costo → $0/hora
5. Si actividad reciente:
   - Endpoint se mantiene activo
```

---

## 💰 Costos

### Escenario 1: Sin uso

- **Endpoint:** No existe → **$0/hora**
- **Lambda + DynamoDB + EventBridge:** ~$0.01/mes
- **Total:** ~$0.01/mes ✅

### Escenario 2: 1 procesamiento/día

- **Endpoint activo:** ~30 min/día × $0.736/hora = ~$0.37/día
- **Mes:** $0.37 × 30 = **~$11/mes**
- **Lambda + otros:** ~$1/mes
- **Total:** ~$12/mes

### Escenario 3: Múltiples procesamientos en ventana de 1 hora

- **Endpoint activo:** 1 hora × $0.736/hora = $0.74
- **Todos los procesamientos aprovechan el mismo endpoint** ✅
- **Auto-sleep después de 15 min sin actividad**

---

## 🛠️ Comandos Útiles

### Verificar estado del endpoint

```bash
aws lambda invoke \
  --function-name iris-sagemaker-manager \
  --payload '{"action":"status"}' \
  --region us-east-1 \
  /tmp/status.json && cat /tmp/status.json | jq
```

### Forzar wake del endpoint

```bash
aws lambda invoke \
  --function-name iris-sagemaker-manager \
  --payload '{"action":"wake"}' \
  --region us-east-1 \
  /tmp/wake.json && cat /tmp/wake.json | jq
```

### Forzar sleep del endpoint

```bash
aws lambda invoke \
  --function-name iris-sagemaker-manager \
  --payload '{"action":"sleep"}' \
  --region us-east-1 \
  /tmp/sleep.json && cat /tmp/sleep.json | jq
```

### Ver logs de auto-sleep

```bash
aws logs tail /aws/lambda/iris-sagemaker-manager \
  --follow \
  --region us-east-1
```

### Ver actividad en DynamoDB

```bash
aws dynamodb get-item \
  --table-name iris-sagemaker-activity \
  --key '{"endpoint":{"S":"iris-totalsegmentator-endpoint"}}' \
  --region us-east-1
```

---

## 🔧 Configuración

### Ajustar tiempo de auto-sleep

Por defecto: 15 minutos de inactividad

Para cambiar, editar `template.yaml`:

```yaml
SageMakerAutoSleepRule:
  Properties:
    ScheduleExpression: rate(15 minutes)  # Cambiar aquí
```

Y editar `lambdas/sagemaker-manager/handler.py`:

```python
# Delete if inactive for more than 15 minutes
if inactive_minutes > 15:  # Cambiar aquí
    delete_endpoint()
```

### Cambiar tipo de instancia

Por defecto: `ml.g4dn.xlarge` (GPU, $0.736/hora)

Para cambiar, editar configuración del endpoint:

```bash
aws sagemaker create-endpoint-config \
  --endpoint-config-name iris-totalsegmentator-config-autoscale \
  --production-variants \
    VariantName=AllTraffic,\
    ModelName=iris-totalsegmentator-model-autoscale,\
    InstanceType=ml.g4dn.xlarge,\  # Cambiar aquí
    InitialInstanceCount=1
```

**Opciones:**
- `ml.g4dn.xlarge`: 1 GPU, 4 vCPU, 16 GB RAM - $0.736/hora
- `ml.g4dn.2xlarge`: 1 GPU, 8 vCPU, 32 GB RAM - $1.004/hora
- `ml.p3.2xlarge`: 1 V100 GPU, 8 vCPU, 61 GB RAM - $4.28/hora

---

## 🚀 Deployment

```bash
cd backend/scripts
chmod +x deploy-auto-sleep-backend.sh
./deploy-auto-sleep-backend.sh
```

**Nota:** El endpoint NO se crea automáticamente. Se creará la primera vez que un usuario solicite procesamiento.

---

## ✅ Ventajas

1. **$0 cuando no se usa** - Ideal para aplicaciones con uso esporádico
2. **Escalabilidad automática** - Se adapta a la demanda
3. **Sin gestión manual** - Todo automático
4. **Aprovechamiento eficiente** - Múltiples procesamientos usan el mismo endpoint si hay actividad
5. **Transparente para el usuario** - UX no cambia (solo espera inicial)

---

## ⚠️ Consideraciones

1. **Primera solicitud toma 5-10 min** - Tiempo de creación del endpoint
2. **Solicitudes subsecuentes son rápidas** - Si endpoint ya está activo
3. **No apto para latencia crítica** - Si necesitas < 1 segundo de respuesta, usa endpoint siempre activo
4. **Ideal para batch processing** - Perfecto para procesamiento médico que ya toma 10-15 min

---

## 🎯 Resultado Final

✅ **Costo en idle:** $0/mes  
✅ **Auto-wake:** Automático en 5-10 min  
✅ **Auto-sleep:** Después de 15 min sin uso  
✅ **Serverless:** Sin infraestructura fija  
✅ **Producción:** Listo para usuarios reales
