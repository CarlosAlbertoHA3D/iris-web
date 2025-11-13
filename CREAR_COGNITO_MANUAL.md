# 🔐 Crear Cognito User Pool - Paso a Paso

## 1. Ir a Cognito

1. Abrir: https://console.aws.amazon.com/cognito/
2. Región: **us-east-1** (verificar arriba a la derecha)
3. Click en **"Create user pool"**

---

## 2. Configure sign-in experience

**Step 1 of 6: Configure sign-in experience**

- **Provider types:**
  - ✅ **Cognito user pool** (dejar seleccionado)

- **Cognito user pool sign-in options:**
  - ✅ **Email** (marcar SOLO esta opción)
  - ❌ Phone number (NO marcar)
  - ❌ User name (NO marcar)

Click **Next**

---

## 3. Configure security requirements

**Step 2 of 6: Configure security requirements**

- **Password policy:**
  - ◉ **Cognito defaults** (dejar seleccionado)

- **Multi-factor authentication:**
  - ◉ **No MFA** (seleccionar esta opción)

- **User account recovery:**
  - ✅ **Enable self-service account recovery** (dejar marcado)
  - ✅ **Email only** (seleccionar)

Click **Next**

---

## 4. Configure sign-up experience

**Step 3 of 6: Configure sign-up experience**

- **Self-service sign-up:**
  - ✅ **Enable self-registration** (marcar)

- **Attribute verification:**
  - ◉ **Send email message, verify email address** (seleccionar)

- **Required attributes:**
  - ✅ **email** (ya debe estar marcado y bloqueado)
  - Agregar más atributos: **NO** (dejar solo email)

Click **Next**

---

## 5. Configure message delivery

**Step 4 of 6: Configure message delivery**

- **Email:**
  - ◉ **Send email with Cognito** (seleccionar esta opción)
  - Esta es la opción GRATIS (50,000 emails/mes)

- **SES Region:** (dejar por defecto)

Click **Next**

---

## 6. Integrate your app

**Step 5 of 6: Integrate your app**

- **User pool name:**
  - Escribir: `iris-oculus-users`

- **Hosted authentication pages:**
  - ❌ **NO marcar** "Use the Cognito Hosted UI"

- **Initial app client:**
  - **App type:** ◉ **Public client**
  - **App client name:** Escribir: `iris-oculus-web`
  - **Client secret:** ◉ **Don't generate a client secret** (seleccionar)

- **Advanced app client settings:**
  - **Authentication flows:**
    - ✅ **ALLOW_USER_PASSWORD_AUTH** (marcar)
    - ✅ **ALLOW_REFRESH_TOKEN_AUTH** (marcar)
    - ✅ **ALLOW_USER_SRP_AUTH** (marcar)

Click **Next**

---

## 7. Review and create

**Step 6 of 6: Review and create**

- Revisar toda la configuración
- Click **Create user pool**

---

## 8. Copiar IDs

Después de crear el User Pool:

1. **Copia el User Pool ID:**
   - Está en la parte superior de la página
   - Formato: `us-east-1_xxxxxxxxx`
   - Ejemplo: `us-east-1_abc123XYZ`

2. **Ve a la pestaña "App integration"**

3. **Click en el cliente "iris-oculus-web"**

4. **Copia el Client ID:**
   - Está en "App client information"
   - Formato: `1234567890abcdefghijklmnop`

---

## 9. Pegar aquí los valores

```
USER_POOL_ID=us-east-1_xxxxxxxxx
CLIENT_ID=1234567890abcdefghijklmnop
```

**¡Con estos valores puedo continuar configurando el frontend!** 🚀
