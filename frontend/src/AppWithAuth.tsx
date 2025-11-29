import { useState, useEffect } from 'react'
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
  const [isLoading, setIsLoading] = useState(false)
  const loadLocalFiles = useAppStore(s => s.loadLocalFiles)

  // Clear store on mount (fresh login)
  useEffect(() => {
    console.log('[AuthenticatedApp] Clearing store on login')
    useAppStore.setState({ 
      studyId: undefined,
      currentImage: undefined,
      lastLocalFiles: [],
      job: { id: undefined, status: 'idle', progress: 0, message: 'Ready to start processing.' }
    })
  }, [])

  const handleBackToDashboard = () => {
    // Clear viewer state when going back to dashboard
    useAppStore.setState({ 
      studyId: undefined,
      currentImage: undefined,
      job: { id: undefined, status: 'idle', progress: 0, message: 'Ready to start processing.' }
    })
    setView('dashboard')
  }

  const handleViewStudy = async (studyUrl: string, jobId: string, filename: string) => {
    try {
      setIsLoading(true)
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
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <>
      {isLoading && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm text-white">
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-blue-500 border-t-transparent rounded-full animate-spin" />
            <p className="text-lg font-medium">Loading study...</p>
          </div>
        </div>
      )}
      {view === 'dashboard' ? (
        <Dashboard 
          onUploadNewStudy={() => setView('viewer')}
          onViewStudy={handleViewStudy}
        />
      ) : (
        <App 
          isIntegrated={true} 
          onBackToDashboard={handleBackToDashboard} 
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
