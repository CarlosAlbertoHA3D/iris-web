# Build SageMaker Image on EC2

## 🎯 Por qué usar EC2

- ✅ No requiere espacio local (imagen ~9GB)
- ✅ Build más rápido (instancia dedicada)
- ✅ No consume recursos de tu laptop
- ✅ Costo bajo (~$0.58 por build)
- ✅ Se auto-destruye después del build

## 🚀 Uso Rápido

### 1. Lanzar build en EC2
```bash
cd backend/sagemaker
./build-on-ec2.sh fixed-healthcheck
```

Esto:
- Crea key pair, security group, IAM role (si no existen)
- Lanza instancia t3.xlarge (4 vCPU, 16GB RAM, 50GB storage)
- Instala Docker automáticamente
- Clona el repo
- Build la imagen (~10-20 min)
- Push a ECR (~5-10 min)
- Total: ~20-30 minutos

### 2. Monitorear progreso
```bash
./monitor-ec2-build.sh
```

O conéctate directamente:
```bash
ssh -i sagemaker-build-key.pem ec2-user@<PUBLIC_IP>
tail -f /var/log/sagemaker-build.log
```

### 3. Limpiar después
```bash
./cleanup-ec2-build.sh
```

Termina la instancia EC2 y opcionalmente limpia todos los recursos.

## 📋 Scripts Disponibles

| Script | Descripción |
|--------|-------------|
| `build-on-ec2.sh` | Lanza EC2 y construye imagen |
| `monitor-ec2-build.sh` | Monitorea progreso del build |
| `cleanup-ec2-build.sh` | Termina instancia y limpia |

## 💰 Costos

| Recurso | Costo |
|---------|-------|
| t3.xlarge (30 min) | ~$0.08 |
| EBS 50GB (temporal) | ~$0.001 |
| Transfer out 9GB | ~$0.50 |
| **TOTAL** | **~$0.58** |

## 🔍 Timeline Típico

```
0:00 - Script lanza instancia
0:02 - EC2 está running
0:03 - Docker instalándose
0:05 - Clonando repositorio
0:06 - Iniciando build de imagen
0:20 - Build completado
0:22 - Subiendo a ECR
0:30 - Upload completado ✅
```

## 📊 Detalles Técnicos

### Instancia EC2
- **Tipo**: t3.xlarge
- **vCPU**: 4
- **RAM**: 16 GB
- **Storage**: 50 GB GP3
- **OS**: Amazon Linux 2023
- **Region**: us-east-1

### User Data Script
El script automatiza:
1. Instalación de Docker
2. Login a ECR
3. Clone del repositorio
4. Build de imagen
5. Tag y push a ECR
6. Marca de completado

### IAM Role
Permisos necesarios:
- `AmazonEC2ContainerRegistryFullAccess` (push a ECR)

### Security Group
- SSH (22) desde tu IP únicamente
- Más seguro que 0.0.0.0/0

## 🛠️ Troubleshooting

### Build falló
```bash
# Ver logs completos
ssh -i sagemaker-build-key.pem ec2-user@<IP>
cat /var/log/sagemaker-build.log

# Ver console output desde AWS
aws ec2 get-console-output --instance-id <ID> --region us-east-1 --output text
```

### No puedo conectar via SSH
```bash
# Verifica security group
aws ec2 describe-security-groups \
  --filters "Name=group-name,Values=sagemaker-build-sg" \
  --region us-east-1

# Tu IP cambió? Actualiza ingress rule
MY_IP=$(curl -s ifconfig.me)
aws ec2 authorize-security-group-ingress \
  --group-id <SG_ID> \
  --protocol tcp \
  --port 22 \
  --cidr ${MY_IP}/32
```

### Imagen no aparece en ECR
```bash
# Verifica que se subió
aws ecr describe-images \
  --repository-name iris-totalsegmentator \
  --region us-east-1

# Si está vacío, revisa los logs del build
```

### Instancia se quedó corriendo
```bash
# Termínala manualmente
aws ec2 terminate-instances \
  --instance-ids <INSTANCE_ID> \
  --region us-east-1
```

## 🎯 Próximos Pasos

Después de que el build complete:

1. **Verifica imagen en ECR**:
   ```bash
   aws ecr describe-images \
     --repository-name iris-totalsegmentator \
     --image-ids imageTag=fixed-healthcheck \
     --region us-east-1
   ```

2. **Limpia EC2**:
   ```bash
   ./cleanup-ec2-build.sh
   ```

3. **Usa "Process with AI"**:
   - El sistema auto-creará endpoint con la nueva imagen
   - Health check pasará ✅
   - Procesamiento funcionará ✅

## 📝 Notas

- La instancia NO se auto-termina (debes hacerlo manualmente)
- Key pair se guarda como `sagemaker-build-key.pem` (guárdalo seguro)
- Los recursos (SG, role) se pueden reutilizar en builds futuros
- El build es idempotente (puedes ejecutarlo múltiples veces)

## ⚠️ Importante

- **NO olvides terminar la instancia** después del build ($0.1664/hora)
- **Guarda el key pair** si planeas builds futuros
- **Verifica la imagen en ECR** antes de limpiar
- La imagen tarda ~5-10 min en subir (9GB)
