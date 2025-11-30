import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { LogOut, Loader2, Eye, ArrowLeft } from 'lucide-react'
import { Button } from '../ui/button'

interface Study {
  jobId: string
  filename: string
  status: string
  createdAt: number
  downloadUrl?: string
  artifacts?: { [key: string]: string }
}

export default function VRDashboard() {
  const [studies, setStudies] = useState<Study[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const code = localStorage.getItem('vr_code')
    if (!code) {
      navigate('/vr-login')
      return
    }

    fetchStudies(code)
  }, [navigate])

  async function fetchStudies(code: string) {
    try {
      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_URL}/vr/studies?code=${code}`
      )

      if (!response.ok) {
        if (response.status === 401) {
          localStorage.removeItem('vr_code')
          navigate('/vr-login')
          throw new Error('Session expired')
        }
        throw new Error('Error loading studies')
      }

      const data = await response.json()
      setStudies(data.studies)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  function handleLogout() {
    localStorage.removeItem('vr_code')
    navigate('/vr-login')
  }

  function handleViewStudy(study: Study) {
    // Navigate to the viewer with the specific VR view mode if needed
    // For now we can use the standard viewer route but we need to make sure it supports unauthenticated access 
    // or we pass the necessary data via state.
    // Alternatively, create a specific VR viewer route.
    // The user said: "si le doy click en view study, ver los estudios y el modelo 3d verlo en el vr y el nifti en sagital coronal y axial verlo en la pagina"
    
    // We'll navigate to a new route /vr-viewer/:jobId which will handle the specialized view.
    navigate(`/vr-viewer/${study.jobId}`, { state: { study } })
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-2xl font-bold">My Studies (VR)</h1>
          <Button variant="ghost" onClick={handleLogout}>
            <LogOut className="mr-2 h-4 w-4" />
            Logout
          </Button>
        </div>

        {error && (
          <div className="bg-destructive/10 text-destructive p-4 rounded mb-6">
            {error}
          </div>
        )}

        {studies.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            No studies found.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {studies.map((study) => (
              <div key={study.jobId} className="border rounded-lg p-4 bg-card hover:shadow-lg transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="truncate flex-1">
                    <h3 className="font-medium truncate" title={study.filename}>
                      {study.filename}
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1">
                      {new Date(study.createdAt * 1000).toLocaleString()}
                    </p>
                  </div>
                  <span className={`px-2 py-1 rounded text-xs ${
                    study.status === 'completed' ? 'bg-green-100 text-green-800' : 'bg-yellow-100 text-yellow-800'
                  }`}>
                    {study.status}
                  </span>
                </div>

                <div className="flex justify-end">
                  <Button onClick={() => handleViewStudy(study)} size="sm">
                    <Eye className="mr-2 h-4 w-4" />
                    View Study
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
