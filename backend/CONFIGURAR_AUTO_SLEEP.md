# Configurar Auto-Sleep para SageMaker (Una sola vez)

## 🎯 Objetivo
Crear una regla de EventBridge que elimine automáticamente el endpoint de SageMaker después de 15 minutos sin uso.

---

## 📋 Pasos en la Consola AWS

### 1. Ir a EventBridge

1. Abrir consola AWS: https://console.aws.amazon.com/events/
2. Región: **us-east-1**
3. Click en **"Rules"** en el menú izquierdo
4. Click en **"Create rule"**

### 2. Configurar la Regla

**Define rule detail:**
- **Name:** `iris-sagemaker-autosleep`
- **Description:** `Auto-sleep SageMaker endpoint after 15 min of inactivity`
- **Event bus:** `default`
- **Rule type:** `Schedule`
- Click **"Next"**

**Define schedule:**
- **Schedule pattern:** `A schedule that runs at a regular rate`
- **Rate expression:** 
  - Value: `15`
  - Unit: `Minutes`
- Click **"Next"**

**Select target:**
- **Target types:** `AWS service`
- **Select a target:** `Lambda function`
- **Function:** Buscar y seleccionar `iris-oculus-backend-SageMakerManagerFunction-Hi5kUdkokyca`
- **Additional settings:**
  - Expandir **"Additional settings"**
  - **Configure target input:** `Constant (JSON text)`
  - En el campo de texto, pegar:
    ```json
    {"action":"sleep"}
    ```
- Click **"Next"**

**Configure tags (opcional):**
- Puedes agregar tags o dejarlo en blanco
- Click **"Next"**

**Review and create:**
- Revisar la configuración
- Click **"Create rule"**

### 3. Verificar

1. La regla debe aparecer en la lista con estado **"Enabled"**
2. Verás que se ejecutará cada 15 minutos

---

## ✅ ¡Listo!

Ahora tu sistema funcionará así:

### Auto-Wake (YA FUNCIONA)
```
Usuario sube archivo → Lambda → Auto-wake endpoint → Procesar
```

### Auto-Sleep (DESPUÉS DE CONFIGURAR)
```
Cada 15 min → EventBridge → Lambda → ¿Inactividad > 15 min?
                                          ├─ SÍ → Eliminar endpoint (Costo = $0)
                                          └─ NO → Mantener activo
```

---

## 💰 Resultado Final

| Estado | Costo |
|--------|-------|
| **Sin uso (idle)** | **$0.01/mes** ✅ |
| **Procesando** | $0.736/hora (solo mientras procesa) |
| **Después de 15 min sin uso** | **$0/hora** ✅ |

---

## 🧪 Probar el Sistema

Después de configurar, puedes probar:

```bash
# Ver estado actual
aws lambda invoke \
  --function-name iris-oculus-backend-SageMakerManagerFunction-Hi5kUdkokyca \
  --payload '{"action":"status"}' \
  --region us-east-1 \
  /tmp/status.json && cat /tmp/status.json | jq

# Forzar wake (crear endpoint)
aws lambda invoke \
  --function-name iris-oculus-backend-SageMakerManagerFunction-Hi5kUdkokyca \
  --payload '{"action":"wake"}' \
  --region us-east-1 \
  /tmp/wake.json && cat /tmp/wake.json | jq

# Forzar sleep (eliminar endpoint)
aws lambda invoke \
  --function-name iris-oculus-backend-SageMakerManagerFunction-Hi5kUdkokyca \
  --payload '{"action":"sleep"}' \
  --region us-east-1 \
  /tmp/sleep.json && cat /tmp/sleep.json | jq
```

---

## ⏰ Tiempo Estimado

**Configuración:** 3-5 minutos  
**Después:** Todo automático ✅
