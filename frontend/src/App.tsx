import { useEffect } from 'react'
import { Upload, Play, Download, Sun, Moon, Maximize2, Minimize2, ArrowLeft } from 'lucide-react'
import { Button } from './components/ui/button'
import { Switch } from './components/ui/switch'
import { Label } from './components/ui/label'
import { Slider } from './components/ui/slider'
import TriplanarViewer from './components/TriplanarViewer'
import ThreeDViewer from './components/ThreeDViewer'
import UploadDropzone from './components/UploadDropzone'
import UploadsList from './components/UploadsList'
import SidePanel from './components/SidePanel'
import { useAppStore } from './store/useAppStore'

interface AppProps {
  isIntegrated?: boolean
  hideUploads?: boolean
  onBackToDashboard?: () => void
}

export default function App({ isIntegrated = false, hideUploads = false, onBackToDashboard }: AppProps) {
  const theme = useAppStore(s => s.theme)
  const toggleTheme = useAppStore(s => s.toggleTheme)
  const job = useAppStore(s => s.job)
  const fullscreenPane = useAppStore(s => s.layout.fullscreenPane)
  const toggleFullscreen = useAppStore(s => s.toggleFullscreen)
  const restoreJobState = useAppStore(s => s.restoreJobState)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  // Restore job state on mount (if user reloads page with active job)
  useEffect(() => {
    restoreJobState()
  }, [])

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#000000' }}>
      <header style={{
        borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
        background: 'rgba(255, 255, 255, 0.03)',
        backdropFilter: 'blur(20px)',
        position: 'sticky',
        top: 0,
        zIndex: 10
      }}>
        <div className="mx-auto max-w-[1600px] px-4 py-3 flex items-center gap-3">
          {isIntegrated && onBackToDashboard && (
            <Button 
              size="sm" 
              variant="ghost" 
              onClick={onBackToDashboard}
              style={{
                color: 'white',
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem'
              }}
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Dashboard
            </Button>
          )}
          <div className="font-semibold tracking-tight text-lg" style={{ color: 'white' }}>
            {isIntegrated ? 'Upload Study' : 'Iris Medical Viewer'}
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Button size="sm" variant="ghost" onClick={toggleTheme} title="Toggle theme" style={{ color: 'white' }}>
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
          </div>
        </div>
      </header>

      <div className="flex-1 mx-auto max-w-[1600px] w-full flex">
        <main className="flex-1 p-4">
          {!hideUploads && (
            <>
              <div className="mb-3">
                <UploadDropzone />
              </div>
              <div className="mb-4">
                <UploadsList />
              </div>
            </>
          )}
          {/* Viewer Grid Container */}
          <div className="relative h-[calc(100vh-130px)] w-full bg-background rounded-lg overflow-hidden border grid grid-cols-2 grid-rows-2 gap-1 p-1">
            
            {/* Sagittal Panel */}
            <div className={`
                flex flex-col bg-card border rounded-md overflow-hidden transition-all duration-300 ease-in-out
                ${fullscreenPane === 'sagittal' 
                    ? 'absolute inset-0 z-50 m-0 rounded-none border-0 w-full h-full' 
                    : 'relative w-full h-full'
                }
            `}>
              <div className="flex items-center justify-between px-2 py-1 bg-secondary/30 shrink-0 border-b">
                <div className="text-xs font-medium text-muted-foreground">Sagittal</div>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleFullscreen('sagittal')}>
                  {fullscreenPane === 'sagittal' ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </Button>
              </div>
              <div className="flex-1 relative min-h-0 bg-black">
                <TriplanarViewer plane="sagittal" tall={!!fullscreenPane} />
              </div>
            </div>

            {/* Coronal Panel */}
            <div className={`
                flex flex-col bg-card border rounded-md overflow-hidden transition-all duration-300 ease-in-out
                ${fullscreenPane === 'coronal' 
                    ? 'absolute inset-0 z-50 m-0 rounded-none border-0 w-full h-full' 
                    : 'relative w-full h-full'
                }
            `}>
              <div className="flex items-center justify-between px-2 py-1 bg-secondary/30 shrink-0 border-b">
                <div className="text-xs font-medium text-muted-foreground">Coronal</div>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleFullscreen('coronal')}>
                  {fullscreenPane === 'coronal' ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </Button>
              </div>
              <div className="flex-1 relative min-h-0 bg-black">
                <TriplanarViewer plane="coronal" tall={!!fullscreenPane} />
              </div>
            </div>

            {/* Axial Panel */}
            <div className={`
                flex flex-col bg-card border rounded-md overflow-hidden transition-all duration-300 ease-in-out
                ${fullscreenPane === 'axial' 
                    ? 'absolute inset-0 z-50 m-0 rounded-none border-0 w-full h-full' 
                    : 'relative w-full h-full'
                }
            `}>
              <div className="flex items-center justify-between px-2 py-1 bg-secondary/30 shrink-0 border-b">
                <div className="text-xs font-medium text-muted-foreground">Axial</div>
                <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleFullscreen('axial')}>
                  {fullscreenPane === 'axial' ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </Button>
              </div>
              <div className="flex-1 relative min-h-0 bg-black">
                <TriplanarViewer plane="axial" tall={!!fullscreenPane} />
              </div>
            </div>

            {/* 3D Panel */}
            {!hideUploads && (
            <div className={`
                flex flex-col bg-card border rounded-md overflow-hidden transition-all duration-300 ease-in-out
                ${fullscreenPane === '3d' 
                    ? 'absolute inset-0 z-50 m-0 rounded-none border-0 w-full h-full' 
                    : 'relative w-full h-full'
                }
            `}>
              <div className="flex items-center justify-between px-2 py-1 bg-secondary/30 shrink-0 border-b">
                <div className="text-xs font-medium text-muted-foreground">3D Model</div>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-2 px-2">
                    <Label htmlFor="opacity" className="text-[10px] uppercase tracking-wider text-muted-foreground">Opacity</Label>
                    <div className="w-24"><Slider id="opacity" defaultValue={[80]} max={100} step={1} /></div>
                  </div>
                  <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => toggleFullscreen('3d')}>
                    {fullscreenPane === '3d' ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                  </Button>
                </div>
              </div>
              <div className="flex-1 relative min-h-0 bg-black">
                <ThreeDViewer tall={!!fullscreenPane} />
              </div>
            </div>
            )}

          </div>
        </main>
        <aside className="w-[320px] border-l p-4 bg-background/40">
          <SidePanel hideProcessAI={hideUploads} />
        </aside>
      </div>

      <footer className="text-xs text-muted-foreground px-4 py-3 border-t">
        <div className="mx-auto max-w-[1600px] flex items-center justify-between">
          <div>Job: {job.id ?? '—'} | Status: {job.status ?? '—'} | Progress: {job.progress ?? 0}%</div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline"><Download className="w-4 h-4 mr-1"/>Download ZIP</Button>
          </div>
        </div>
      </footer>
    </div>
  )
}
