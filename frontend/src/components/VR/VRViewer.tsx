import { useEffect, useState } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import { Loader2 } from 'lucide-react'
import App from '../../App'
import { useAppStore } from '../../store/useAppStore'

export default function VRViewer() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const loadLocalFiles = useAppStore(s => s.loadLocalFiles)

  useEffect(() => {
    const code = localStorage.getItem('vr_code')
    if (!code) {
      navigate('/vr-login')
      return
    }

    const initViewer = async () => {
      try {
        let study = location.state?.study

        // If study not in state, fetch it (we need to fetch all studies and find the one matching jobId
        // because our API /vr/studies returns a list. Optimized API would be /vr/studies/:jobId)
        if (!study) {
           const response = await fetch(
            `${import.meta.env.VITE_BACKEND_URL}/vr/studies?code=${code}`
          )
          if (!response.ok) throw new Error('Error fetching study details')
          const data = await response.json()
          study = data.studies.find((s: any) => s.jobId === jobId)
          
          if (!study) throw new Error('Study not found')
        }

        // Load the study
        await loadStudy(study)
      } catch (err: any) {
        console.error('Error initializing viewer:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    initViewer()

    // Cleanup on unmount
    return () => {
      useAppStore.setState({ 
        studyId: undefined,
        currentImage: undefined,
        job: { id: undefined, status: 'idle', progress: 0, message: 'Ready to start processing.' }
      })
    }
  }, [jobId, navigate, location.state])

  const loadStudy = async (study: any) => {
    console.log('[VRViewer] Loading study:', study)
    
    // We need the downloadUrl. If it's not presigned, we might have issues if it requires auth headers.
    // The backend /vr/studies should return presigned URLs.
    const studyUrl = study.downloadUrl
    if (!studyUrl) throw new Error('No download URL for study')

    // Download file
    const response = await fetch(studyUrl)
    if (!response.ok) throw new Error(`Failed to download study: ${response.status}`)
    
    const blob = await response.blob()
    const filename = study.filename
    
    let contentType = blob.type || 'application/octet-stream'
    if (filename.endsWith('.nii.gz') || filename.endsWith('.nii')) {
      contentType = 'application/gzip'
    } else if (filename.endsWith('.dcm') || filename.endsWith('.dicom')) {
      contentType = 'application/dicom'
    }

    const file = new File([blob], filename, { type: contentType })
    
    await loadLocalFiles([file])
    
    // Process artifacts
    let artifacts = study.artifacts || {}
    // If backend sends 'segmentations' instead of 'segmentation', fix it
    // In VR/backend handler we populated 'artifacts' map.
    // Note: The backend handler I wrote populates 'artifacts' based on study.artifacts
    
    useAppStore.setState({ studyId: study.jobId, artifacts: artifacts })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white">
        <Loader2 className="h-8 w-8 animate-spin mb-4" />
        <p>Loading study for VR...</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white">
        <div className="text-red-500 mb-4">Error: {error}</div>
        <button onClick={() => navigate('/vr-dashboard')} className="underline">
          Back to Dashboard
        </button>
      </div>
    )
  }

  return (
    <App 
      isIntegrated={true} 
      hideUploads={true}
      onBackToDashboard={() => navigate('/vr-dashboard')} 
    />
  )
}
