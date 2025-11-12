# GitHub Secrets Configuration

Para que el workflow de CI/CD funcione, debes configurar los siguientes secretos en GitHub.

## Paso a Paso

1. Ve a tu repositorio en GitHub
2. Click en **Settings** → **Secrets and variables** → **Actions**
3. Click en **New repository secret**

## Secretos Requeridos

### AWS_ACCESS_KEY_ID

1. En AWS Console, ve a IAM
2. Crea un nuevo usuario para CI/CD: `github-actions-iris`
3. Asigna permisos:
   - `AWSCloudFormationFullAccess`
   - `AWSLambdaFullAccess`
   - `AmazonS3FullAccess`
   - `AmazonDynamoDBFullAccess`
   - `AmazonSageMakerFullAccess`
   - `IAMFullAccess`
   - `AmazonAPIGatewayAdministrator`
4. Crea Access Key en Security credentials
5. Copia el **Access Key ID** y agrégalo como secreto en GitHub

**Name:** `AWS_ACCESS_KEY_ID`  
**Value:** `AKIAIOSFODNN7EXAMPLE` (tu access key)

### AWS_SECRET_ACCESS_KEY

Usando la misma Access Key creada arriba:

**Name:** `AWS_SECRET_ACCESS_KEY`  
**Value:** `wJalrXUtnFEMI/K7MDENG/bPxRfiCYEXAMPLEKEY` (tu secret key)

## Verificación

Después de agregar los secretos:

1. Ve a **Actions** tab en GitHub
2. Click en workflow "Deploy to AWS"
3. Click **Run workflow**
4. Verifica que el deployment sea exitoso

## Seguridad

⚠️ **IMPORTANTE:**
- Nunca commits las credenciales en el código
- Los secretos de GitHub están encriptados y solo disponibles durante workflow execution
- Considera usar AWS IAM Roles con OIDC para mayor seguridad (más avanzado)

## Troubleshooting

### Error: "AccessDenied"
- Verifica que el usuario IAM tiene los permisos correctos
- Revisa que los secretos estén correctamente configurados

### Error: "Invalid security token"
- Las credenciales pueden haber expirado
- Regenera las Access Keys en AWS IAM

## Deployment Manual

Si prefieres no usar CI/CD automático:

```bash
# Desactiva el workflow automático en push
# Edita .github/workflows/deploy.yml y comenta:
# on:
#   push:
#     branches:
#       - main

# Usa solo workflow_dispatch para deployment manual
```
