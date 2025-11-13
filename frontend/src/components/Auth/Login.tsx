import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import '../../config/amplify'

interface LoginProps {
  children: React.ReactNode
}

export function Login({ children }: LoginProps) {
  return (
    <Authenticator
      signUpAttributes={['email']}
      loginMechanisms={['email']}
      formFields={{
        signUp: {
          email: {
            order: 1,
            placeholder: 'Ingresa tu email',
            label: 'Email',
            isRequired: true
          },
          password: {
            order: 2,
            placeholder: 'Crea una contraseña',
            label: 'Contraseña',
            isRequired: true
          },
          confirm_password: {
            order: 3,
            placeholder: 'Confirma tu contraseña',
            label: 'Confirmar Contraseña',
            isRequired: true
          }
        },
        signIn: {
          username: {
            placeholder: 'Ingresa tu email',
            label: 'Email',
            isRequired: true
          },
          password: {
            placeholder: 'Ingresa tu contraseña',
            label: 'Contraseña',
            isRequired: true
          }
        }
      }}
    >
      {children}
    </Authenticator>
  )
}
