# 🎯 Plan: Cognito Authentication + Dashboard DICOM/NIFTI

## 📋 RESUMEN

Implementar sistema completo de autenticación y visualización:
- ✅ Login con email + contraseña (AWS Cognito)
- ✅ Dashboard personal con historial de imágenes subidas
- ✅ Visualizador DICOM/NIFTI integrado (click para ver)
- ✅ APIs protegidas con autenticación

---

## 🏗️ ARQUITECTURA

```
Usuario
  ↓ (Login)
Cognito User Pool
  ↓ (JWT Token)
Frontend (React)
  ↓ (Authenticated API calls)
API Gateway (Cognito Authorizer)
  ↓
Lambda Functions
  ↓
DynamoDB (filtrar por userId) + S3
```

---

## 📝 FASES DE IMPLEMENTACIÓN

### FASE 1: Cognito User Pool ⏱️ 30 min

**Backend (SAM template.yaml):**
```yaml
CognitoUserPool:
  Type: AWS::Cognito::UserPool
  Properties:
    UserPoolName: iris-oculus-users
    UsernameAttributes:
      - email
    AutoVerifiedAttributes:
      - email
    Policies:
      PasswordPolicy:
        MinimumLength: 8
        RequireLowercase: true
        RequireNumbers: true
        RequireSymbols: false
        RequireUppercase: true

CognitoUserPoolClient:
  Type: AWS::Cognito::UserPoolClient
  Properties:
    ClientName: iris-oculus-web
    UserPoolId: !Ref CognitoUserPool
    ExplicitAuthFlows:
      - ALLOW_USER_PASSWORD_AUTH
      - ALLOW_REFRESH_TOKEN_AUTH
    GenerateSecret: false
```

**Outputs necesarios:**
- UserPoolId
- UserPoolClientId
- UserPoolRegion

---

### FASE 2: API Gateway Authorizer ⏱️ 20 min

**Actualizar SAM template.yaml:**
```yaml
Globals:
  Api:
    Auth:
      DefaultAuthorizer: CognitoAuthorizer
      Authorizers:
        CognitoAuthorizer:
          UserPoolArn: !GetAtt CognitoUserPool.Arn
```

**Endpoints protegidos:**
- `GET /my-images` - Lista de imágenes del usuario
- `GET /image/{imageId}` - Detalles de una imagen específica
- `POST /upload` - Ya existe, agregar userId del token
- `POST /process/totalseg` - Ya existe, verificar userId

---

### FASE 3: Backend - Lambdas ⏱️ 40 min

#### 3.1 Lambda: GET /my-images

```python
# backend/lambdas/my-images/handler.py
import json
import boto3
import os

dynamodb = boto3.resource('dynamodb')
table = dynamodb.Table(os.environ['DYNAMODB_TABLE'])

def lambda_handler(event, context):
    # Extraer userId del token de Cognito
    user_id = event['requestContext']['authorizer']['claims']['sub']
    
    # Query DynamoDB por userId
    response = table.query(
        IndexName='userIdIndex',  # Necesitamos crear este índice
        KeyConditionExpression='userId = :uid',
        ExpressionAttributeValues={':uid': user_id}
    )
    
    images = response['Items']
    
    return {
        'statusCode': 200,
        'headers': {'Access-Control-Allow-Origin': '*'},
        'body': json.dumps({
            'ok': True,
            'images': images
        })
    }
```

#### 3.2 Actualizar DynamoDB

Agregar **GSI (Global Secondary Index)** en `iris-oculus-metadata`:
- Partition Key: `userId`
- Sort Key: `createdAt` (para ordenar por fecha)

#### 3.3 Actualizar Lambda de Upload

Modificar para incluir `userId` del token:
```python
user_id = event['requestContext']['authorizer']['claims']['sub']

table.put_item(
    Item={
        'jobId': job_id,
        'userId': user_id,  # <-- NUEVO
        'status': 'pending',
        # ... resto de campos
    }
)
```

---

### FASE 4: Frontend - Auth Flow ⏱️ 60 min

#### 4.1 Instalar AWS Amplify Auth

```bash
cd frontend
npm install aws-amplify @aws-amplify/ui-react
```

#### 4.2 Configurar Amplify

```typescript
// frontend/src/config/amplify.ts
import { Amplify } from 'aws-amplify'

Amplify.configure({
  Auth: {
    Cognito: {
      userPoolId: import.meta.env.VITE_USER_POOL_ID,
      userPoolClientId: import.meta.env.VITE_USER_POOL_CLIENT_ID,
      region: 'us-east-1'
    }
  }
})
```

#### 4.3 Login Component

```tsx
// frontend/src/components/Login.tsx
import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'

export function Login() {
  return (
    <Authenticator>
      {({ signOut, user }) => (
        <div>
          <h1>Bienvenido {user.signInDetails.loginId}</h1>
          <button onClick={signOut}>Cerrar Sesión</button>
          <Dashboard />
        </div>
      )}
    </Authenticator>
  )
}
```

---

### FASE 5: Frontend - Dashboard ⏱️ 90 min

#### 5.1 Dashboard Component

```tsx
// frontend/src/components/Dashboard.tsx
import { useState, useEffect } from 'react'
import { fetchAuthSession } from 'aws-amplify/auth'
import { ImageViewer } from './ImageViewer'

export function Dashboard() {
  const [images, setImages] = useState([])
  const [selectedImage, setSelectedImage] = useState(null)
  
  useEffect(() => {
    loadImages()
  }, [])
  
  async function loadImages() {
    const session = await fetchAuthSession()
    const token = session.tokens?.idToken?.toString()
    
    const response = await fetch(
      `${import.meta.env.VITE_BACKEND_URL}/my-images`,
      {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      }
    )
    
    const data = await response.json()
    setImages(data.images)
  }
  
  return (
    <div className="dashboard">
      <h2>Mis Imágenes</h2>
      
      <div className="image-grid">
        {images.map(img => (
          <div 
            key={img.jobId}
            className="image-card"
            onClick={() => setSelectedImage(img)}
          >
            <img src={img.thumbnail} alt={img.filename} />
            <p>{img.filename}</p>
            <span>{img.status}</span>
          </div>
        ))}
      </div>
      
      {selectedImage && (
        <ImageViewer 
          image={selectedImage}
          onClose={() => setSelectedImage(null)}
        />
      )}
    </div>
  )
}
```

#### 5.2 Image Viewer Component

```tsx
// frontend/src/components/ImageViewer.tsx
import { useEffect } from 'react'

export function ImageViewer({ image, onClose }) {
  // Reutilizar tu visualizador existente
  // Ya tienes el código de ITK.js/VTK.js
  
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <button onClick={onClose}>✕</button>
        
        <div className="viewer-container">
          {/* Tu código actual de visualización */}
          <div id="viewer-3d"></div>
          <div className="slices">
            <div id="sagittal"></div>
            <div id="coronal"></div>
            <div id="axial"></div>
          </div>
        </div>
      </div>
    </div>
  )
}
```

---

## 🗂️ ESTRUCTURA DE ARCHIVOS

```
backend/
├── template.yaml           # Agregar Cognito, GSI, nuevos endpoints
├── lambdas/
│   ├── upload/            # Modificar: agregar userId
│   ├── my-images/         # NUEVO: listar imágenes del usuario
│   └── process/           # Modificar: agregar userId
└── PLAN_COGNITO_DASHBOARD.md

frontend/
├── src/
│   ├── config/
│   │   └── amplify.ts     # NUEVO: config de Cognito
│   ├── components/
│   │   ├── Login.tsx      # NUEVO: login con Cognito
│   │   ├── Dashboard.tsx  # NUEVO: grid de imágenes
│   │   └── ImageViewer.tsx # NUEVO: modal con viewer
│   └── App.tsx            # Modificar: agregar rutas
├── .env.production        # Agregar vars de Cognito
└── package.json           # Agregar aws-amplify
```

---

## 🚀 ORDEN DE EJECUCIÓN

1. ✅ **Backend primero:**
   - Actualizar `template.yaml` con Cognito
   - Agregar GSI a DynamoDB
   - Crear Lambda `my-images`
   - Actualizar Lambda `upload`
   - Desplegar con SAM

2. ✅ **Frontend después:**
   - Instalar dependencias
   - Configurar Amplify
   - Crear componentes (Login, Dashboard, ImageViewer)
   - Actualizar rutas
   - Desplegar en Amplify

---

## 📊 TIEMPOS ESTIMADOS

| Fase | Tiempo | Descripción |
|------|--------|-------------|
| 1. Cognito Setup | 30 min | User Pool + Client |
| 2. API Authorizer | 20 min | Proteger endpoints |
| 3. Backend Lambdas | 40 min | my-images + updates |
| 4. Frontend Auth | 60 min | Amplify + Login |
| 5. Dashboard + Viewer | 90 min | Grid + Modal |
| **TOTAL** | **~4 horas** | Implementación completa |

---

## ✅ CHECKLIST

- [ ] Cognito User Pool creado
- [ ] User Pool Client configurado
- [ ] API Gateway con Cognito Authorizer
- [ ] DynamoDB GSI creado (userId)
- [ ] Lambda my-images implementada
- [ ] Lambda upload actualizada (userId)
- [ ] Frontend: Amplify configurado
- [ ] Frontend: Login component
- [ ] Frontend: Dashboard component
- [ ] Frontend: ImageViewer modal
- [ ] Testing: Registro de usuario
- [ ] Testing: Login funcional
- [ ] Testing: Dashboard muestra imágenes
- [ ] Testing: Click en imagen abre viewer

---

## 💰 COSTOS ADICIONALES

**Cognito:**
- Primeros 50,000 MAU: **GRATIS** ✅
- Después: $0.0055 por MAU

**Total:** $0/mes para <50k usuarios

---

## 🔐 SEGURIDAD

✅ Tokens JWT de Cognito  
✅ APIs protegidas con Authorizer  
✅ Usuario solo ve SUS imágenes  
✅ S3 presigned URLs por usuario  
✅ HTTPS en todo el flujo

---

**¿Empezamos con la Fase 1 (Cognito)?**
