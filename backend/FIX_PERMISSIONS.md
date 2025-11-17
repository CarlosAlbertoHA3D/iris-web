# 🔐 Arreglar Permisos de AWS Batch

## Problema
El deploy falló porque tu usuario IAM no tiene permisos para crear recursos de AWS Batch.

## Solución Rápida (AWS Console)

### 1. Ir a IAM Console
https://console.aws.amazon.com/iam/

### 2. Buscar tu usuario
- Click en "Users" (Usuarios)
- Buscar: `Carlos-Rodriguez-DB`

### 3. Agregar Policy
- Click en tu usuario
- Tab "Permissions" (Permisos)
- Click "Add permissions" → "Attach policies directly"
- Buscar y agregar estas policies:
  - ✅ `AWSBatchFullAccess` (managed policy)
  - ✅ `AmazonEC2FullAccess` (managed policy)
  - ✅ `AmazonECS_FullAccess` (managed policy)
  - ✅ `AmazonEC2ContainerRegistryFullAccess` (managed policy)

### 4. Crear Custom Policy (Opcional - más segura)
Si prefieres permisos mínimos:
- Click "Add permissions" → "Create inline policy"
- Tab "JSON"
- Pega el contenido de `iam-batch-permissions.json`
- Nombra la policy: `IrisBatchDeployment`
- Click "Create policy"

## Solución AWS CLI

```bash
# Adjuntar managed policies
aws iam attach-user-policy \
  --user-name Carlos-Rodriguez-DB \
  --policy-arn arn:aws:iam::aws:policy/AWSBatchFullAccess

aws iam attach-user-policy \
  --user-name Carlos-Rodriguez-DB \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2FullAccess

aws iam attach-user-policy \
  --user-name Carlos-Rodriguez-DB \
  --policy-arn arn:aws:iam::aws:policy/AmazonECS_FullAccess

aws iam attach-user-policy \
  --user-name Carlos-Rodriguez-DB \
  --policy-arn arn:aws:iam::aws:policy/AmazonEC2ContainerRegistryFullAccess
```

O crear custom policy:

```bash
# Crear policy custom
aws iam create-policy \
  --policy-name IrisBatchDeployment \
  --policy-document file://iam-batch-permissions.json

# Adjuntar al usuario
aws iam attach-user-policy \
  --user-name Carlos-Rodriguez-DB \
  --policy-arn arn:aws:iam::390844768950:policy/IrisBatchDeployment
```

## Verificar Permisos

```bash
# Listar policies del usuario
aws iam list-attached-user-policies --user-name Carlos-Rodriguez-DB

# Test básico
aws batch describe-compute-environments
```

## Después de Agregar Permisos

```bash
cd backend

# Re-deploy
sam deploy
```

## Permisos Específicos Requeridos

| Servicio | Permisos | Por qué |
|----------|----------|---------|
| **AWS Batch** | `batch:*` | Crear job queues, definitions, compute environments |
| **EC2** | `ec2:CreateVpc`, etc | Crear VPC para Batch |
| **ECS** | `ecs:*` | Batch usa ECS internamente |
| **ECR** | `ecr:*` | Repositorio para Docker images |
| **IAM** | `iam:CreateRole`, etc | Crear roles para Batch |

## Seguridad

⚠️ Estas son políticas amplias para **desarrollo**. Para **producción**:

1. Usa roles específicos por recurso
2. Limita por tags: `iris-oculus-*`
3. Usa CloudFormation Stack Sets con menor scope

## Troubleshooting

**Error: "User is not authorized to perform: batch:RegisterJobDefinition"**
→ Agregar `AWSBatchFullAccess`

**Error: "User is not authorized to perform: ec2:CreateVpc"**
→ Agregar `AmazonEC2FullAccess`

**Error: "User is not authorized to perform: iam:CreateRole"**
→ Agregar permisos IAM o usar role existente

## Alternativa: Usar AWS CloudShell

Si no tienes permisos para modificar IAM:

1. Abre AWS CloudShell en Console
2. CloudShell tiene más permisos por default
3. Deploy desde ahí:
```bash
git clone <tu-repo>
cd iris-web-2/backend
sam build
sam deploy --guided
```

---

**Después de arreglar permisos, el deploy debería completar en ~5-10 minutos** ✅
