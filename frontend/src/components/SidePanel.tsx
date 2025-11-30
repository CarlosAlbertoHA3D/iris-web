import { Play, Trash2 } from 'lucide-react'
import { Button } from './ui/button'
import { Switch } from './ui/switch'
import { Label } from './ui/label'
import { Slider } from './ui/slider'
import { useAppStore } from '../store/useAppStore'
import StructuresList from './StructuresList'

interface SidePanelProps {
  hideProcessAI?: boolean
}

export default function SidePanel({ hideProcessAI = false }: SidePanelProps) {
  const job = useAppStore(s => s.job)
  const startProcessing = useAppStore(s => s.startProcessing)
  const studyId = useAppStore(s => s.studyId)
  const uploads = useAppStore(s => s.uploads)
  const lastLocalFiles = useAppStore(s => s.lastLocalFiles)
  const viewer = useAppStore(s => s.viewer)
  const setWW = useAppStore(s => s.setWW)
  const setWL = useAppStore(s => s.setWL)
  const toggleCrosshair = useAppStore(s => s.toggleCrosshair)

  // Only show "Process with AI" if there are files loaded
  const hasFiles = (lastLocalFiles && lastLocalFiles.length > 0) || (uploads && uploads.length > 0)
  const isProcessing = job.status === 'queued' || job.status === 'processing'

  return (
    <div className="space-y-6">
      <section>
        <div className="font-medium mb-2">Study</div>
        <div className="text-sm text-muted-foreground">ID: {studyId ?? '—'}</div>
        {hasFiles && !isProcessing && !hideProcessAI && (
          <div className="mt-2">
            <Button className="w-full" onClick={startProcessing}><Play className="w-4 h-4 mr-1"/>Process with AI</Button>
          </div>
        )}
        <div className="mt-3">
          <div className="text-xs text-muted-foreground mb-1">Progress</div>
          <div className="h-2 w-full rounded bg-muted overflow-hidden">
            <div className="h-full bg-primary transition-all" style={{ width: `${job.progress ?? 0}%` }} />
          </div>
          <div className="text-xs mt-1 capitalize">{job.status ?? '—'} {job.progress ?? 0}%</div>
          {job.message && (
            <div className="text-xs text-muted-foreground mt-1 leading-snug">
              {job.message}
            </div>
          )}
        </div>
      </section>

      <section>
        <div className="font-medium mb-2">Viewer</div>
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <Label htmlFor="ww" className="text-xs">Window Width</Label>
            <div className="w-40"><Slider id="ww" value={[viewer.ww]} onValueChange={(v) => setWW(v[0])} min={1} max={4000} /></div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="wl" className="text-xs">Window Level</Label>
            <div className="w-40"><Slider id="wl" value={[viewer.wl]} onValueChange={(v) => setWL(v[0])} min={-1000} max={1000} /></div>
          </div>
          <div className="flex items-center justify-between">
            <Label htmlFor="crosshair" className="text-xs">Crosshair</Label>
            <Switch id="crosshair" checked={viewer.crosshair} onCheckedChange={toggleCrosshair} />
          </div>
        </div>
      </section>

      <section>
        <div className="font-medium mb-2">Structures</div>
        <StructuresList />
      </section>

      <section>
        <div className="font-medium mb-2">Actions</div>
        <div className="flex items-center gap-2">
          <Button variant="outline" className="flex-1">Reset</Button>
          <Button variant="destructive"><Trash2 className="w-4 h-4"/></Button>
        </div>
      </section>
    </div>
  )
}
