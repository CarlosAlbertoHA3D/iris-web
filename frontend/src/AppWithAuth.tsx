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

  const handleViewStudy = async (studyUrl: string, jobId: string, filename: string) => {
    try {
      console.log('[view-study] Loading study:', { jobId, filename, url: studyUrl })
      
      // Download the file from S3
      const response = await fetch(studyUrl)
      if (!response.ok) {
        throw new Error(`Failed to download study: ${response.status} ${response.statusText}`)
      }
      
      const blob = await response.blob()
      console.log('[view-study] Downloaded blob:', { size: blob.size, type: blob.type })
      
      // Determine content type based on filename
      let contentType = blob.type || 'application/octet-stream'
      if (filename.endsWith('.nii.gz') || filename.endsWith('.nii')) {
        contentType = 'application/gzip'
      } else if (filename.endsWith('.dcm') || filename.endsWith('.dicom')) {
        contentType = 'application/dicom'
      }
      
      // Create File object with correct name and type
      const file = new File([blob], filename, { type: contentType })
      console.log('[view-study] Created file:', { name: file.name, size: file.size, type: file.type })
      
      // Load the file into the viewer and set studyId
      console.log('[view-study] Calling loadLocalFiles...')
      await loadLocalFiles([file])
      useAppStore.setState({ studyId: jobId })
      console.log('[view-study] File loaded successfully')
      
      // Navigate to viewer
      setView('viewer')
    } catch (error) {
      console.error('[view-study] Error:', error)
      alert(`Failed to load study: ${error instanceof Error ? error.message : 'Unknown error'}`)
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
