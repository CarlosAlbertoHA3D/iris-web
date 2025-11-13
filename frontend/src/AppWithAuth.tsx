import { useState } from 'react'
import { Authenticator, useAuthenticator } from '@aws-amplify/ui-react'
import { useAppStore } from './store/useAppStore'
import { LandingPage } from './components/Landing/LandingPage'
import { Login } from './components/Auth/Login'
import { Dashboard } from './components/Dashboard/Dashboard'
import App from './App'
import './config/amplify'

type View = 'dashboard' | 'viewer'

function AuthenticatedApp() {
  const [view, setView] = useState<View>('dashboard')
  const loadLocalFiles = useAppStore(s => s.loadLocalFiles)

  const handleViewStudy = async (studyUrl: string, jobId: string) => {
    try {
      console.log('[view-study] Loading study from:', studyUrl)
      
      // Download the file from S3
      const response = await fetch(studyUrl)
      if (!response.ok) {
        throw new Error('Failed to download study')
      }
      
      const blob = await response.blob()
      const filename = studyUrl.split('/').pop() || 'study.nii.gz'
      const file = new File([blob], filename, { type: blob.type || 'application/octet-stream' })
      
      // Load the file into the viewer and set studyId
      await loadLocalFiles([file])
      useAppStore.setState({ studyId: jobId })
      
      // Navigate to viewer
      setView('viewer')
    } catch (error) {
      console.error('[view-study] Error:', error)
      alert('Failed to load study. Please try again.')
    }
  }

  return (
    <>
      {view === 'dashboard' ? (
        <Dashboard 
          onUploadNewStudy={() => setView('viewer')}
          onViewStudy={handleViewStudy}
        />
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
