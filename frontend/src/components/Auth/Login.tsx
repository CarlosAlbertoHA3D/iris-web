import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import './Login.css'
import '../../config/amplify'

interface LoginProps {
  children: React.ReactNode
}

export function Login({ children }: LoginProps) {
  return (
    <div className="auth-container">
      <Authenticator
        signUpAttributes={['email']}
        loginMechanisms={['email']}
        formFields={{
          signUp: {
            email: {
              order: 1,
              placeholder: 'Enter your email',
              label: 'Email',
              isRequired: true
            },
            password: {
              order: 2,
              placeholder: 'Create a password',
              label: 'Password',
              isRequired: true
            },
            confirm_password: {
              order: 3,
              placeholder: 'Confirm your password',
              label: 'Confirm Password',
              isRequired: true
            }
          },
          signIn: {
            username: {
              placeholder: 'Enter your email',
              label: 'Email',
              isRequired: true
            },
            password: {
              placeholder: 'Enter your password',
              label: 'Password',
              isRequired: true
            }
          }
        }}
      >
        {children}
      </Authenticator>
    </div>
  )
}
