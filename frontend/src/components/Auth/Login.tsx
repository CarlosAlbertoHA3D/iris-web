import { Authenticator } from '@aws-amplify/ui-react'
import '@aws-amplify/ui-react/styles.css'
import './Login.css'
import '../../config/amplify'

interface LoginProps {
  children: React.ReactNode
  onVRLogin?: () => void
}

export function Login({ children, onVRLogin }: LoginProps) {
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
      
      {onVRLogin && (
        <div style={{ marginTop: '1rem', textAlign: 'center' }}>
          <button 
            className="btn-secondary" 
            onClick={onVRLogin}
            style={{ 
              background: 'transparent', 
              border: '1px solid rgba(255,255,255,0.2)',
              color: 'white',
              padding: '0.5rem 1rem',
              borderRadius: '0.25rem',
              cursor: 'pointer'
            }}
          >
            Login with VR Code
          </button>
        </div>
      )}
    </div>
  )
}
