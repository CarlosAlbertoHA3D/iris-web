# Solicitar Cuota de GPU para AWS Batch

## ❌ Problema
Tu cuenta tiene cuota de **0 vCPUs** para instancias GPU (G and VT), por lo que no puede lanzar `g4dn.xlarge`.

## ✅ Solución: Aumentar Cuota

### Paso 1: Ir a Service Quotas
1. Abre la consola de AWS: https://console.aws.amazon.com/servicequotas/
2. Busca **"EC2"** en los servicios
3. Busca **"All G and VT Spot Instance Requests"**

### Paso 2: Solicitar Aumento
1. Click en la cuota
2. Click **"Request quota increase"**
3. Solicita al menos **4 vCPUs** (para 1 instancia g4dn.xlarge)
4. Justificación: "Running TotalSegmentator medical imaging AI processing on AWS Batch"

### Paso 3: Esperar Aprobación
- **Tiempo**: 1-2 días hábiles
- Recibirás email cuando se apruebe
- Después los jobs funcionarán automáticamente

---

## 🔧 Opción Alternativa: Usar CPU (Mientras tanto)

Si necesitas procesar ahora, podemos cambiar a CPU:
- ✅ No requiere cuota especial
- ❌ Más lento (~45-60 min vs 15-20 min)
- ✅ Funciona inmediatamente

Para cambiar a CPU, ejecuta:
```bash
cd /Users/carlos3d/Documents/GitHub/iris-web-2/backend
# Editar template.yaml para usar instancia CPU
```

---

## 📞 Solicitar por CLI (Opcional)

```bash
aws service-quotas request-service-quota-increase \
  --service-code ec2 \
  --quota-code L-3819A6DF \
  --desired-value 4 \
  --region us-east-1
```

**Código de cuota**: `L-3819A6DF` (All G and VT Spot Instance Requests)
