import { Button } from './ui/button'
import { useAppStore } from '../store/useAppStore'
import { formatBytes } from '../lib/format'

export default function UploadsList() {
  const uploads = useAppStore((s) => s.uploads)
  const removeUpload = useAppStore((s) => s.removeUpload)
  const clearUploads = useAppStore((s) => s.clearUploads)
  const startUploads = useAppStore((s) => s.startUploads)
  const job = useAppStore((s) => s.job)
  const studyId = useAppStore((s) => s.studyId)

  if (!uploads.length) return null

  const anyQueued = uploads.some((u) => u.status === 'queued')
  const anyUploading = uploads.some((u) => u.status === 'uploading')
  const allDone = uploads.every((u) => u.status === 'done')
  const isProcessing = job.status === 'processing' || job.status === 'queued'
  const alreadyUploaded = !!studyId

  return (
    <div className="border rounded-md p-3 bg-card">
      <div className="flex items-center justify-between mb-2">
        <div className="text-sm font-medium">Uploads</div>
        <div className="flex items-center gap-2">
          {anyQueued && !anyUploading && !isProcessing && !alreadyUploaded && (
            <Button size="sm" onClick={() => startUploads()}>Start Upload</Button>
          )}
          <Button size="sm" variant="outline" onClick={() => clearUploads()} disabled={!uploads.length || !allDone}>
            Clear done
          </Button>
        </div>
      </div>
      <div className="space-y-2">
        {uploads.map((u) => (
          <div key={u.id} className="p-2 rounded border">
            <div className="flex items-center justify-between">
              <div className="text-sm font-medium truncate max-w-[60%]" title={u.file.name}>{u.file.name}</div>
              <div className="text-xs text-muted-foreground">{formatBytes(u.file.size)}</div>
            </div>
            <div className="mt-1 flex items-center justify-between">
              <div className="flex-1 mr-3">
                <div className="h-2 w-full rounded bg-muted overflow-hidden">
                  <div className={`h-full ${u.status === 'error' ? 'bg-destructive' : 'bg-primary'} transition-all`} style={{ width: `${u.progress}%` }} />
                </div>
              </div>
              <div className="text-xs w-28 text-right">
                {u.status === 'queued' && 'Queued'}
                {u.status === 'uploading' && `Uploading ${u.progress}%`}
                {u.status === 'done' && 'Done'}
                {u.status === 'error' && 'Error'}
              </div>
              <div className="ml-2">
                <Button size="icon" variant="ghost" title="Remove" disabled={u.status === 'uploading' || u.status === 'done'} onClick={() => removeUpload(u.id)}>
                  ✕
                </Button>
              </div>
            </div>
            {u.error && <div className="text-xs text-destructive mt-1">{u.error}</div>}
          </div>
        ))}
      </div>
    </div>
  )
}
