import { useState, useEffect, useRef } from 'react'
import { fetchAuthSession, signOut } from 'aws-amplify/auth'
import { Upload, Eye, Download, LogOut, Trash2, Smartphone, Copy, Check } from 'lucide-react'
import { ProcessingStatus } from '../ProcessingStatus'
import './Dashboard.css'

interface Image {
  jobId: string
  filename: string
  status: string
  createdAt: number
  downloadUrl?: string
  inputFile: string
  expectedArtifacts?: { [key: string]: string }
  artifacts?: { [key: string]: string }
  artifactUrls?: {
    segmentation?: string
    segmentations?: string
    obj?: string
    mtl?: string
    json?: string
    zip?: string
    [key: string]: string | undefined
  }
}

interface DashboardProps {
  onUploadNewStudy: () => void
  onViewStudy?: (studyUrl: string, jobId: string, filename: string, artifacts?: any) => void
}

export function Dashboard({ onUploadNewStudy, onViewStudy }: DashboardProps) {
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<Image | null>(null)
  const [imageToDelete, setImageToDelete] = useState<Image | null>(null)
  const [deleting, setDeleting] = useState(false)
  const [vrCode, setVrCode] = useState<{ code: string, expiresAt: number } | null>(null)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [copied, setCopied] = useState(false)
  const pollingIntervalRef = useRef<number | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    loadImages(controller.signal)
    
    return () => {
      controller.abort()
      // Cleanup polling on unmount
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
      }
    }
  }, [])

  // Start/stop polling based on processing jobs
  useEffect(() => {
    const hasProcessingJobs = images.some(
      img => img.status === 'queued' || img.status === 'processing'
    )

    if (hasProcessingJobs && !pollingIntervalRef.current) {
      // Start polling every 30 seconds
      console.log('[Dashboard] Starting polling for processing jobs')
      pollingIntervalRef.current = window.setInterval(() => {
        console.log('[Dashboard] Polling for status updates')
        loadImages(undefined, true)
      }, 30000) // 30 seconds
    } else if (!hasProcessingJobs && pollingIntervalRef.current) {
      // Stop polling when no processing jobs
      console.log('[Dashboard] Stopping polling - no processing jobs')
      clearInterval(pollingIntervalRef.current)
      pollingIntervalRef.current = null
    }

    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current)
        pollingIntervalRef.current = null
      }
    }
  }, [images])

  async function loadImages(signal?: AbortSignal, isPolling = false) {
    try {
      if (!isPolling) setLoading(true)
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString()
      const userId = session.tokens?.idToken?.payload?.sub

      console.log('[Dashboard] Loading images for user:', userId)

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/my-images`,
        {
          signal,
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )

      if (!response.ok) {
        const errorText = await response.text()
        console.error('[Dashboard] Error response:', errorText)
        throw new Error(`Error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      console.log('[Dashboard] Images loaded:', {
        count: data.count,
        images: data.images?.map((img: any) => ({
          jobId: img.jobId,
          filename: img.filename,
          status: img.status,
          createdAt: img.createdAt
        }))
      })
      setImages(data.images || [])
    } catch (error: any) {
      if (error.name === 'AbortError') {
        console.log('[Dashboard] Request aborted')
        return
      }
      console.error('[Dashboard] Error loading images:', error)
      if (!isPolling) {
          alert(`Failed to load studies: ${error instanceof Error ? error.message : 'Unknown error'}`)
      }
    } finally {
      if (!isPolling) setLoading(false)
    }
  }

  async function handleSignOut() {
    try {
      await signOut()
    } catch (error) {
      console.error('Error signing out:', error)
    }
  }

  async function handleDeleteStudy() {
    if (!imageToDelete) return
    
    try {
      setDeleting(true)
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString()

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/studies/${imageToDelete.jobId}`,
        {
          method: 'DELETE',
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`)
      }

      const data = await response.json()
      console.log('Study deleted:', data)
      
      // Remove from local state
      setImages(images.filter(img => img.jobId !== imageToDelete.jobId))
      setImageToDelete(null)
      setSelectedImage(null)
    } catch (error) {
      console.error('Error deleting study:', error)
      alert('Failed to delete study. Please try again.')
    } finally {
      setDeleting(false)
    }
  }

  async function generateVRCode(jobId?: string) {
    if (!jobId) return

    // Check local storage for existing valid code
    try {
      const storedCodes = JSON.parse(localStorage.getItem('vr_codes') || '{}')
      const stored = storedCodes[jobId]
      // Check if code exists and is not expired (with 5 min buffer)
      if (stored && stored.expiresAt > (Date.now() / 1000 + 300)) {
        setVrCode(stored)
        return
      }
    } catch (e) {
      console.warn('Error reading local storage:', e)
    }

    try {
      setGeneratingCode(true)
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString()

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/vr/code`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ jobId })
        }
      )

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`)
      }

      const data = await response.json()
      setVrCode(data)
      
      // Save to local storage
      try {
        const storedCodes = JSON.parse(localStorage.getItem('vr_codes') || '{}')
        storedCodes[jobId] = data
        localStorage.setItem('vr_codes', JSON.stringify(storedCodes))
      } catch (e) {
        console.warn('Error saving to local storage:', e)
      }

    } catch (error) {
      console.error('Error generating VR code:', error)
      alert('Failed to generate VR code. Please try again.')
    } finally {
      setGeneratingCode(false)
    }
  }

  function copyToClipboard(text: string) {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  function getStatusColor(status: string) {
    switch (status) {
      case 'completed':
        return 'green'
      case 'processing':
      case 'queued':
        return 'orange'
      case 'failed':
        return 'red'
      default:
        return 'gray'
    }
  }

  function formatDate(timestamp: number) {
    return new Date(timestamp * 1000).toLocaleString()
  }

  if (loading) {
    return (
      <div className="dashboard">
        <div className="dashboard-header">
          <h1>My Studies</h1>
          <div className="header-actions">
            <button onClick={onUploadNewStudy} className="btn-upload">
              <Upload className="btn-icon" />
              Upload New Study
            </button>
            <button onClick={handleSignOut} className="btn-logout">
              <LogOut className="btn-icon" />
              Sign Out
            </button>
          </div>
        </div>
        <div className="loading">Loading your studies...</div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>My Studies</h1>
        <div className="header-actions">
          {/* <button onClick={() => generateVRCode()} className="btn-secondary" disabled={generatingCode}>
            <Smartphone className="btn-icon" />
            {generatingCode ? 'Generating...' : 'Sincronizar con VR'}
          </button> */}
          <button onClick={onUploadNewStudy} className="btn-upload">
            <Upload className="btn-icon" />
            Upload New Study
          </button>
          <button onClick={handleSignOut} className="btn-logout">
            <LogOut className="btn-icon" />
            Sign Out
          </button>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="empty-state">
          <Upload className="empty-icon" />
          <h2>No Studies Yet</h2>
          <p>You haven't uploaded any medical imaging studies yet.</p>
          <button onClick={onUploadNewStudy} className="btn-upload-large">
            <Upload className="btn-icon" />
            Upload Your First Study
          </button>
        </div>
      ) : (
        <div className="images-grid">
          {images.map((img) => (
            <div
              key={img.jobId}
              className="image-card"
              onClick={() => setSelectedImage(img)}
            >
              <div className="image-card-header">
                <h3>{img.filename}</h3>
                <span
                  className="status-badge"
                  style={{ backgroundColor: getStatusColor(img.status) }}
                >
                  {img.status}
                </span>
              </div>
              
              {/* Processing Status Indicator */}
              {(img.status === 'queued' || img.status === 'processing' || img.status === 'completed') && (
                <div className="image-card-status" onClick={(e) => e.stopPropagation()}>
                  <ProcessingStatus 
                    jobId={img.jobId} 
                    status={img.status}
                    onComplete={() => loadImages()}
                  />
                </div>
              )}
              
              <div className="image-card-body">
                <p className="image-date">{formatDate(img.createdAt)}</p>
                <p className="image-id">Job ID: {img.jobId}</p>
              </div>
              <div className="image-card-actions">
                {img.status === 'completed' && (
                  <button 
                    className="btn-view"
                    onClick={(e) => {
                      e.stopPropagation()
                      generateVRCode(img.jobId)
                    }}
                    disabled={generatingCode}
                    title="Sync with VR"
                    style={{ marginRight: '0.5rem' }}
                  >
                    <Smartphone className="btn-icon-sm" />
                  </button>
                )}
                <button 
                  className="btn-view"
                  onClick={(e) => {
                    e.stopPropagation()
                    if (onViewStudy && img.downloadUrl) {
                      // Prefer artifactUrls (signed), fallback to expectedArtifacts (s3:// - useless for frontend fetch but kept for metadata)
                      onViewStudy(img.downloadUrl, img.jobId, img.filename, img.artifactUrls || img.expectedArtifacts)
                    } else {
                      setSelectedImage(img)
                    }
                  }}
                >
                  <Eye className="btn-icon-sm" />
                  View Study
                </button>
                <button 
                  className="btn-delete"
                  onClick={(e) => {
                    e.stopPropagation()
                    setImageToDelete(img)
                  }}
                  title="Delete study"
                >
                  <Trash2 className="btn-icon-sm" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* VR Code Modal */}
      {vrCode && (
        <div className="modal-overlay" onClick={() => setVrCode(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Sync with Meta Quest 3</h2>
              <button onClick={() => setVrCode(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p className="text-center mb-4">Enter this code on your Meta Quest 3 to access your studies.</p>
              <div className="flex items-center justify-center gap-4 mb-6">
                <div className="text-5xl font-mono font-bold tracking-widest bg-muted p-4 rounded">
                  {vrCode.code}
                </div>
              </div>
              <div className="flex justify-center gap-4 mb-4">
                <button 
                  onClick={() => copyToClipboard(vrCode.code)}
                  className="btn-secondary flex items-center gap-2"
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy Code'}
                </button>
              </div>
              <p className="text-sm text-muted-foreground text-center">
                This code is valid for 24 hours.
              </p>
              <p className="text-xs text-muted-foreground text-center mt-2">
                Expires: {new Date(vrCode.expiresAt * 1000).toLocaleString()}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {imageToDelete && (
        <div className="modal-overlay" onClick={() => !deleting && setImageToDelete(null)}>
          <div className="modal-content modal-small" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>Delete Study</h2>
              <button onClick={() => !deleting && setImageToDelete(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p><strong>Are you sure you want to delete this study?</strong></p>
              <p className="delete-warning">
                Study: <strong>{imageToDelete.filename}</strong>
              </p>
              <p className="delete-info">
                This action will remove the study from your dashboard. The data will be archived and can be recovered if needed.
              </p>
              <div className="modal-actions">
                <button 
                  className="btn-cancel" 
                  onClick={() => setImageToDelete(null)}
                  disabled={deleting}
                >
                  Cancel
                </button>
                <button 
                  className="btn-delete-confirm" 
                  onClick={handleDeleteStudy}
                  disabled={deleting}
                >
                  <Trash2 className="btn-icon-sm" />
                  {deleting ? 'Deleting...' : 'Delete Study'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {selectedImage && (
        <div className="modal-overlay" onClick={() => setSelectedImage(null)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>{selectedImage.filename}</h2>
              <button onClick={() => setSelectedImage(null)}>✕</button>
            </div>
            <div className="modal-body">
              <p><strong>Status:</strong> {selectedImage.status}</p>
              <p><strong>Study ID:</strong> {selectedImage.jobId}</p>
              <p><strong>Created:</strong> {formatDate(selectedImage.createdAt)}</p>
              {selectedImage.downloadUrl && (
                <a
                  href={selectedImage.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-download"
                >
                  <Download className="btn-icon-sm" />
                  Download File
                </a>
              )}
              <div className="viewer-placeholder">
                <Eye className="placeholder-icon" />
                <p>DICOM/NIFTI Viewer</p>
                <p className="placeholder-subtitle">Interactive medical imaging visualization will appear here</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
