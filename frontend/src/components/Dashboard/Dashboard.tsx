import { useState, useEffect } from 'react'
import { fetchAuthSession, signOut } from 'aws-amplify/auth'
import { Upload, Eye, Download, LogOut, Trash2 } from 'lucide-react'
import './Dashboard.css'

interface Image {
  jobId: string
  filename: string
  status: string
  createdAt: number
  downloadUrl?: string
  inputFile: string
}

interface DashboardProps {
  onUploadNewStudy: () => void
}

export function Dashboard({ onUploadNewStudy }: DashboardProps) {
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<Image | null>(null)
  const [imageToDelete, setImageToDelete] = useState<Image | null>(null)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    loadImages()
  }, [])

  async function loadImages() {
    try {
      setLoading(true)
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString()

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/my-images`,
        {
          headers: {
            'Authorization': `Bearer ${token}`
          }
        }
      )

      if (!response.ok) {
        throw new Error(`Error: ${response.status}`)
      }

      const data = await response.json()
      console.log('Images loaded:', data)
      setImages(data.images || [])
    } catch (error) {
      console.error('Error loading images:', error)
    } finally {
      setLoading(false)
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
              <div className="image-card-body">
                <p className="image-date">{formatDate(img.createdAt)}</p>
                <p className="image-id">Job ID: {img.jobId}</p>
              </div>
              <div className="image-card-actions">
                <button 
                  className="btn-view"
                  onClick={(e) => {
                    e.stopPropagation()
                    setSelectedImage(img)
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
