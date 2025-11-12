import { useEffect } from 'react'
import { Upload, Play, Download, Sun, Moon, Maximize2, Minimize2 } from 'lucide-react'
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

export default function App() {
  const theme = useAppStore(s => s.theme)
  const toggleTheme = useAppStore(s => s.toggleTheme)
  const job = useAppStore(s => s.job)
  const fullscreenPane = useAppStore(s => s.layout.fullscreenPane)
  const toggleFullscreen = useAppStore(s => s.toggleFullscreen)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark')
  }, [theme])

  return (
    <div className="min-h-screen flex flex-col">
      <header className="border-b bg-card/50 sticky top-0 z-10 backdrop-blur supports-[backdrop-filter]:bg-card/60">
        <div className="mx-auto max-w-[1600px] px-4 py-3 flex items-center gap-3">
          <div className="font-semibold tracking-tight text-lg">Iris Medical Viewer</div>
          <div className="ml-auto flex items-center gap-3">
            <Button size="sm" variant="ghost" onClick={toggleTheme} title="Toggle theme">
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <Button size="sm" variant="secondary">Login</Button>
          </div>
        </div>
      </header>

      <div className="flex-1 mx-auto max-w-[1600px] w-full flex">
        <main className="flex-1 p-4">
          <div className="mb-3">
            <UploadDropzone />
          </div>
          <div className="mb-4">
            <UploadsList />
          </div>
          {fullscreenPane ? (
            <div className="rounded-lg border bg-card p-2">
              <div className="flex items-center justify-between mb-1">
                <div className="text-sm text-muted-foreground capitalize">{fullscreenPane === '3d' ? '3D' : fullscreenPane}</div>
                <div className="flex items-center gap-2">
                  {fullscreenPane === '3d' && (
                    <div className="flex items-center gap-3">
                      <Label htmlFor="opacity-full" className="text-xs">Opacity</Label>
                      <div className="w-40"><Slider id="opacity-full" defaultValue={[80]} max={100} step={1} /></div>
                    </div>
                  )}
                  <Button size="icon" variant="ghost" onClick={() => toggleFullscreen(fullscreenPane!)} title="Exit fullscreen">
                    <Minimize2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
              {fullscreenPane === 'sagittal' && <TriplanarViewer plane="sagittal" tall />}
              {fullscreenPane === 'coronal' && <TriplanarViewer plane="coronal" tall />}
              {fullscreenPane === 'axial' && <TriplanarViewer plane="axial" tall />}
              {fullscreenPane === '3d' && <ThreeDViewer tall />}
            </div>
          ) : (
            <div className="grid grid-cols-2 grid-rows-2 gap-3">
              <div className="rounded-lg border bg-card p-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-muted-foreground">Sagittal</div>
                  <Button size="icon" variant="ghost" title="Fullscreen" onClick={() => toggleFullscreen('sagittal')}>
                    <Maximize2 className="w-4 h-4" />
                  </Button>
                </div>
                <TriplanarViewer plane="sagittal" />
              </div>
              <div className="rounded-lg border bg-card p-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-muted-foreground">Coronal</div>
                  <Button size="icon" variant="ghost" title="Fullscreen" onClick={() => toggleFullscreen('coronal')}>
                    <Maximize2 className="w-4 h-4" />
                  </Button>
                </div>
                <TriplanarViewer plane="coronal" />
              </div>
              <div className="rounded-lg border bg-card p-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-muted-foreground">Axial</div>
                  <Button size="icon" variant="ghost" title="Fullscreen" onClick={() => toggleFullscreen('axial')}>
                    <Maximize2 className="w-4 h-4" />
                  </Button>
                </div>
                <TriplanarViewer plane="axial" />
              </div>
              <div className="rounded-lg border bg-card p-2">
                <div className="flex items-center justify-between mb-1">
                  <div className="text-sm text-muted-foreground">3D</div>
                  <div className="flex items-center gap-3">
                    <Label htmlFor="opacity" className="text-xs">Opacity</Label>
                    <div className="w-40"><Slider id="opacity" defaultValue={[80]} max={100} step={1} /></div>
                    <Button size="icon" variant="ghost" title="Fullscreen" onClick={() => toggleFullscreen('3d')}>
                      <Maximize2 className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
                <ThreeDViewer />
              </div>
            </div>
          )}
        </main>
        <aside className="w-[320px] border-l p-4 bg-background/40">
          <SidePanel />
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
