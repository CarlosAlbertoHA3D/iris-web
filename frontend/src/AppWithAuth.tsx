import { useState } from 'react'
import { LandingPage } from './components/Landing/LandingPage'
import { Login } from './components/Auth/Login'
import { Dashboard } from './components/Dashboard/Dashboard'
import App from './App'
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react'
import './config/amplify'

type View = 'dashboard' | 'viewer'

function AuthenticatedApp() {
  const [view, setView] = useState<View>('dashboard')

  return (
    <>
      {view === 'dashboard' ? (
        <Dashboard onUploadNewStudy={() => setView('viewer')} />
      ) : (
        <App 
          isIntegrated={true} 
          onBackToDashboard={() => setView('dashboard')} 
        />
      )}
    </>
  )
}

function AppRouter() {
  const [showAuth, setShowAuth] = useState(false)
  const { authStatus } = useAuthenticator((context) => [context.authStatus])

  // If user is authenticated, show the app
  if (authStatus === 'authenticated') {
    return <AuthenticatedApp />
  }

  // If user clicked login, show auth UI
  if (showAuth) {
    return (
      <Login>
        <AuthenticatedApp />
      </Login>
    )
  }

  // Otherwise show landing page
  return <LandingPage onLogin={() => setShowAuth(true)} />
}

export default function AppWithAuth() {
  return (
    <Authenticator.Provider>
      <AppRouter />
    </Authenticator.Provider>
  )
}
