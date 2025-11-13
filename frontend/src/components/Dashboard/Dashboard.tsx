import { useState, useEffect } from 'react'
import { fetchAuthSession, signOut } from 'aws-amplify/auth'
import './Dashboard.css'

interface Image {
  jobId: string
  filename: string
  status: string
  createdAt: number
  downloadUrl?: string
  inputFile: string
}

export function Dashboard() {
  const [images, setImages] = useState<Image[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState<Image | null>(null)

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
          <h1>Mis Imágenes</h1>
          <button onClick={handleSignOut} className="btn-logout">
            Cerrar Sesión
          </button>
        </div>
        <div className="loading">Cargando...</div>
      </div>
    )
  }

  return (
    <div className="dashboard">
      <div className="dashboard-header">
        <h1>Mis Imágenes</h1>
        <button onClick={handleSignOut} className="btn-logout">
          Cerrar Sesión
        </button>
      </div>

      {images.length === 0 ? (
        <div className="empty-state">
          <p>No has subido ninguna imagen aún.</p>
          <p>Ve al visualizador para subir tu primera imagen médica.</p>
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
                <button className="btn-view">Ver Imagen</button>
              </div>
            </div>
          ))}
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
              <p>Status: {selectedImage.status}</p>
              <p>Job ID: {selectedImage.jobId}</p>
              <p>Creado: {formatDate(selectedImage.createdAt)}</p>
              {selectedImage.downloadUrl && (
                <a
                  href={selectedImage.downloadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="btn-download"
                >
                  Descargar
                </a>
              )}
              <div className="viewer-placeholder">
                <p>Aquí irá el visualizador DICOM/NIFTI</p>
                <p>(Siguiente paso: integrar tu código existente)</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
