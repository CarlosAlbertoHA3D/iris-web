import { useCallback, useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import { Button } from './ui/button'
import { useAppStore } from '../store/useAppStore'

export default function UploadDropzone() {
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const folderInputRef = useRef<HTMLInputElement | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const queueFiles = useAppStore(s => s.queueFiles)
  const loadLocalFiles = useAppStore(s => s.loadLocalFiles)

  const onFiles = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    queueFiles(arr)
    // Load locally into viewer (NIfTI or DICOM series)
    loadLocalFiles(arr)
  }, [queueFiles, loadLocalFiles])

  async function collectFilesFromItems(items: DataTransferItemList): Promise<File[]> {
    const result: File[] = []
    const promises: Promise<void>[] = []
    const toEntry = (item: DataTransferItem) => (item as any).webkitGetAsEntry?.() as any
    const pushFile = (file: File) => {
      // Skip hidden or system files
      if (file.name === '.DS_Store' || file.name.startsWith('._')) return
      result.push(file)
    }
    const walkDir = (dir: any): Promise<void> => {
      return new Promise((resolve) => {
        const reader = dir.createReader()
        const read = () => {
          reader.readEntries(async (entries: any[]) => {
            if (!entries.length) return resolve()
            for (const entry of entries) {
              if (entry.isFile) {
                await new Promise<void>((res2) => entry.file((f: File) => { pushFile(f); res2() }))
              } else if (entry.isDirectory) {
                await walkDir(entry)
              }
            }
            read()
          })
        }
        read()
      })
    }
    for (let i = 0; i < items.length; i++) {
      const item = items[i]
      if (item.kind === 'file') {
        const entry = toEntry(item)
        if (entry && (entry as any).isDirectory) {
          promises.push(walkDir(entry))
        } else {
          const file = item.getAsFile()
          if (file) pushFile(file)
        }
      }
    }
    await Promise.all(promises)
    return result
  }

  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
      onDragLeave={() => setDragOver(false)}
      onDrop={(e) => {
        e.preventDefault()
        setDragOver(false)
        const items = e.dataTransfer.items
        if (items && items.length && (items[0] as any).webkitGetAsEntry) {
          collectFilesFromItems(items).then((files) => files.length && onFiles(files))
        } else if (e.dataTransfer.files?.length) onFiles(e.dataTransfer.files)
      }}
      className={`border rounded-md p-4 flex items-center justify-between ${dragOver ? 'border-primary' : ''}`}
    >
      <div className="flex items-center gap-3">
        <div className="rounded-md bg-muted p-2"><Upload className="w-5 h-5"/></div>
        <div className="text-sm">
          <div className="font-medium">Upload NIfTI (.nii/.nii.gz) or DICOM (.zip or folder)</div>
          <div className="text-muted-foreground">Drag & drop or choose files. Max 5GB per file (multipart supported).</div>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {/* Files input (allows selecting .nii/.nii.gz, .dcm, .zip, etc.) */}
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="hidden"
          onChange={(e) => { if (e.currentTarget.files) onFiles(e.currentTarget.files); e.currentTarget.value = '' }}
        />
        {/* Folder input (Chromium) - select an entire DICOM folder */}
        <input
          ref={folderInputRef}
          type="file"
          multiple
          {...({ webkitdirectory: 'true', directory: 'true' } as any)}
          className="hidden"
          onChange={(e) => { if (e.currentTarget.files) onFiles(e.currentTarget.files); e.currentTarget.value = '' }}
        />
        <Button variant="secondary" onClick={() => fileInputRef.current?.click()}>Choose files</Button>
        <Button variant="outline" onClick={() => folderInputRef.current?.click()}>Choose folder</Button>
      </div>
    </div>
  )
}
