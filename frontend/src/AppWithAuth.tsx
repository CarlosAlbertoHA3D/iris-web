import { useState } from 'react'
import { Login } from './components/Auth/Login'
import { Dashboard } from './components/Dashboard/Dashboard'
import App from './App'
import { useAuthenticator } from '@aws-amplify/ui-react'
import './config/amplify'

function AuthenticatedApp() {
  const { user } = useAuthenticator((context) => [context.user])
  const [view, setView] = useState<'dashboard' | 'viewer'>('dashboard')

  return (
    <div>
      <nav style={{
        padding: '1rem 2rem',
        background: '#f8f9fa',
        borderBottom: '1px solid #ddd',
        display: 'flex',
        gap: '1rem',
        alignItems: 'center'
      }}>
        <h1 style={{ margin: 0, fontSize: '1.5rem' }}>Iris Oculus</h1>
        <button
          onClick={() => setView('dashboard')}
          style={{
            padding: '0.5rem 1rem',
            background: view === 'dashboard' ? '#007bff' : '#f0f0f0',
            color: view === 'dashboard' ? 'white' : '#333',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Dashboard
        </button>
        <button
          onClick={() => setView('viewer')}
          style={{
            padding: '0.5rem 1rem',
            background: view === 'viewer' ? '#007bff' : '#f0f0f0',
            color: view === 'viewer' ? 'white' : '#333',
            border: 'none',
            borderRadius: '6px',
            cursor: 'pointer'
          }}
        >
          Visualizador
        </button>
        <div style={{ marginLeft: 'auto', color: '#666' }}>
          {user?.signInDetails?.loginId}
        </div>
      </nav>

      {view === 'dashboard' ? <Dashboard /> : <App />}
    </div>
  )
}

export default function AppWithAuth() {
  return (
    <Login>
      <AuthenticatedApp />
    </Login>
  )
}
