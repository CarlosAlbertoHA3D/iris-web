import { create, type StateCreator } from 'zustand'
import { loadImageFromFiles } from '../services/itkLoader'

export type JobStatus = 'PENDING' | 'RUNNING' | 'PROCESSING' | 'SUBMITTED' | 'SUCCEEDED' | 'FAILED'

export type Pane = 'sagittal' | 'coronal' | 'axial' | '3d'

interface ViewerState {
  ww: number
  wl: number
  crosshair: boolean
  axialIndex: number
  coronalIndex: number
  sagittalIndex: number
  scale?: number
  panX?: number
  panY?: number
}

interface JobState {
  id?: string
  status?: JobStatus
  progress?: number
  error?: string
}

interface UploadItem {
  id: string
  file: File
  progress: number
  status: 'queued' | 'uploading' | 'done' | 'error'
  error?: string
}

export interface StructureItem {
  id: string
  name: string
  system: string
  color: [number, number, number] // 0..255 RGB
  visible: boolean
  opacity: number // 0..100
}

interface AppState {
  theme: 'dark' | 'light'
  viewer: ViewerState
  job: JobState
  uploads: UploadItem[]
  studyId?: string
  currentImage?: any
  lastLocalFiles: File[]
  layout: { fullscreenPane: Pane | null }
  structures: StructureItem[]
  artifacts?: { obj: string; mtl: string; json: string; zip: string }
  queueFiles: (files: File[]) => void
  removeUpload: (id: string) => void
  clearUploads: () => void
  startUploads: () => Promise<void>
  setCurrentImage: (image: any) => void
  loadLocalFiles: (files: File[]) => Promise<void>
  updateSlice: (plane: 'axial' | 'coronal' | 'sagittal', delta: number) => void
  setSliceIndex: (plane: 'axial' | 'coronal' | 'sagittal', index: number) => void
  setWW: (v: number) => void
  setWL: (v: number) => void
  setScale: (v: number) => void
  setPan: (x: number, y: number) => void
  toggleCrosshair: () => void
  toggleTheme: () => void
  startProcessing: () => Promise<void>
  toggleFullscreen: (pane: Pane) => void
  exitFullscreen: () => void
  setStructures: (items: StructureItem[]) => void
  setStructureVisible: (id: string, visible: boolean) => void
  setStructureOpacity: (id: string, opacity: number) => void
  setStructureColor: (id: string, color: [number, number, number]) => void
}

const creator: StateCreator<AppState> = (set, get) => ({
  theme: 'dark',
  viewer: {
    ww: 400,
    wl: 40,
    crosshair: true,
    axialIndex: 0,
    coronalIndex: 0,
    sagittalIndex: 0,
  },
  job: {
    id: undefined,
    status: undefined,
    progress: 0,
  },
  uploads: [],
  studyId: undefined,
  currentImage: undefined,
  lastLocalFiles: [],
  layout: { fullscreenPane: null },
  structures: [],
  artifacts: undefined,
  queueFiles: (files: File[]) =>
    set((state) => ({
      uploads: state.uploads.concat(
        files.map((file) => ({
          id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          file,
          progress: 0,
          status: 'queued',
        }))
      ),
    })),
  removeUpload: (id: string) => set((s) => ({ uploads: s.uploads.filter((u) => u.id !== id) })),
  clearUploads: () => set(() => ({ uploads: [] })),
  setCurrentImage: (image: any) => set(() => ({ currentImage: image })),
  // Log when image is set to help trace viewer pipeline
  // eslint-disable-next-line no-console
  // setCurrentImageWithLog: (image: any) => { console.log('[store] currentImage set size=', image?.size); set(() => ({ currentImage: image })) },
  loadLocalFiles: async (files: File[]) => {
    try {
      const res = await loadImageFromFiles(files)
      if (res?.image) {
        // eslint-disable-next-line no-console
        console.log('[store] loadLocalFiles -> image ready size=', res.image?.size)
        set({ currentImage: res.image, lastLocalFiles: files })
      } else {
        // eslint-disable-next-line no-console
        console.warn('[store] loadLocalFiles -> no image returned')
      }
    } catch (e) {
      // swallow
      // eslint-disable-next-line no-console
      console.warn('[store] loadLocalFiles error:', e)
    }
  },
  startUploads: async () => {
    const { uploads } = get()
    if (!uploads.length) return
    
    const backend = (import.meta as any).env?.VITE_BACKEND_URL || 'http://127.0.0.1:8000'
    
    try {
      // Get authentication token
      const { fetchAuthSession } = await import('aws-amplify/auth')
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString()
      
      if (!token) {
        throw new Error('Not authenticated. Please log in again.')
      }

      // Load files locally for visualization first
      try {
        const files = uploads.map((u) => u.file)
        console.log('[store] startUploads -> loadLocalFiles with', files.length, 'files')
        await get().loadLocalFiles(files)
      } catch (e) {
        console.warn('[store] startUploads: loadLocalFiles failed:', e)
      }

      // Upload each file to S3 via backend
      for (const u of uploads) {
        try {
          set((s) => ({ uploads: s.uploads.map((it) => (it.id === u.id ? { ...it, status: 'uploading', progress: 0 } : it)) }))
          
          // Step 1: Get presigned URL
          console.log(`[upload] Getting presigned URL for: ${u.file.name}`)
          const uploadResp = await fetch(`${backend}/upload`, {
            method: 'POST',
            headers: { 
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify({
              filename: u.file.name,
              contentType: u.file.type || 'application/octet-stream'
            })
          })
          
          if (!uploadResp.ok) {
            throw new Error(`Upload request failed: ${uploadResp.status}`)
          }
          
          const uploadData = await uploadResp.json()
          console.log(`[upload] Got presigned URL for: ${u.file.name}`)
          
          set((s) => ({ uploads: s.uploads.map((it) => (it.id === u.id ? { ...it, progress: 25 } : it)) }))
          
          // Step 2: Upload to S3
          console.log(`[upload] Uploading to S3: ${u.file.name}`)
          const s3Upload = await fetch(uploadData.uploadUrl, {
            method: 'PUT',
            body: u.file,
            headers: {
              'Content-Type': u.file.type || 'application/octet-stream'
            }
          })
          
          if (!s3Upload.ok) {
            throw new Error(`S3 upload failed: ${s3Upload.status}`)
          }
          
          console.log(`[upload] Successfully uploaded: ${u.file.name}`)
          
          // Mark as done
          set((s) => ({ 
            uploads: s.uploads.map((it) => (it.id === u.id ? { ...it, status: 'done', progress: 100 } : it)),
            studyId: uploadData.jobId
          }))
          
        } catch (e: any) {
          console.error(`[upload] Error uploading ${u.file.name}:`, e)
          set((s) => ({
            uploads: s.uploads.map((it) => (it.id === u.id ? { ...it, status: 'error', error: e?.message || 'Upload failed' } : it))
          }))
        }
      }
    } catch (e: any) {
      console.error('[upload] startUploads error:', e)
      set((s) => ({
        uploads: s.uploads.map((it) => (it.status === 'done' ? it : { ...it, status: 'error', error: e?.message || 'Upload failed' })),
      }))
    }
  },
  updateSlice: (plane, delta) =>
    set((state) => {
      const v = { ...state.viewer }
      if (plane === 'axial') v.axialIndex += delta
      if (plane === 'coronal') v.coronalIndex += delta
      if (plane === 'sagittal') v.sagittalIndex += delta
      return { viewer: v }
    }),
  setSliceIndex: (plane, index) =>
    set((state) => {
      const v = { ...state.viewer }
      if (plane === 'axial') v.axialIndex = index
      if (plane === 'coronal') v.coronalIndex = index
      if (plane === 'sagittal') v.sagittalIndex = index
      return { viewer: v }
    }),
  setWW: (v: number) => set((s) => ({ viewer: { ...s.viewer, ww: v } })),
  setWL: (v: number) => set((s) => ({ viewer: { ...s.viewer, wl: v } })),
  setScale: (v: number) => set((s) => ({ viewer: { ...s.viewer, scale: v } })),
  setPan: (x: number, y: number) => set((s) => ({ viewer: { ...s.viewer, panX: x, panY: y } })),
  toggleCrosshair: () => set((s) => ({ viewer: { ...s.viewer, crosshair: !s.viewer.crosshair } })),
  toggleTheme: () => set((s) => ({ theme: s.theme === 'dark' ? 'light' : 'dark' })),
  startProcessing: async () => {
    let backend = (import.meta as any).env?.VITE_BACKEND_URL || 'http://127.0.0.1:8000'
    set({ job: { id: '', status: 'RUNNING', progress: 0 } })
    try {
      // Get authentication token
      const { fetchAuthSession } = await import('aws-amplify/auth')
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString()
      
      if (!token) {
        throw new Error('Not authenticated. Please log in again.')
      }

      // Check if we already have a studyId (file already uploaded)
      const { studyId, uploads } = get()
      let jobId = studyId
      
      // If no studyId, check if there are queued uploads and upload them
      if (!jobId) {
        const anyQueued = uploads.some(u => u.status === 'queued')
        if (anyQueued) {
          console.log('[process] Uploading queued files first...')
          await get().startUploads()
          // Get the studyId set by startUploads
          jobId = get().studyId
          console.log('[process] Files uploaded, jobId:', jobId)
        }
      }

      // If still no jobId, need to upload a file
      if (!jobId) {
        console.log('[process] No study uploaded, creating new upload...')
        
        // Check backend health
        const healthy = await fetch(`${backend}/healthz`, { method: 'GET' }).then(r => r.ok).catch(() => false)
        if (!healthy) {
          throw new Error(`Backend offline at ${backend}. Please check your API Gateway.`)
        }
        
        // Pick a NIfTI from lastLocalFiles
        const { lastLocalFiles } = get()
        const nifti = (lastLocalFiles || []).find(f => /\.nii(\.gz)?$/i.test(f.name)) || lastLocalFiles?.[0]
        if (!nifti) throw new Error('No file available to process. Please upload a file first.')

        // Step 1: Get presigned URL for upload
        console.log('[process] Step 1: Requesting upload URL...')
        set((s) => ({ job: { ...s.job, progress: 5 } }))
        
        const uploadResp = await fetch(`${backend}/upload`, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({
            filename: nifti.name,
            contentType: nifti.type || 'application/octet-stream'
          })
        })
        
        if (!uploadResp.ok) {
          const error = await uploadResp.text()
          throw new Error(`Upload request failed: ${error}`)
        }
        
        const uploadData = await uploadResp.json()
        console.log('[process] Upload response:', uploadData)
        
        if (!uploadData.ok || !uploadData.uploadUrl || !uploadData.jobId) {
          throw new Error('Invalid upload response from server')
        }

        jobId = uploadData.jobId
        set({ job: { id: jobId, status: 'RUNNING', progress: 10 }, studyId: jobId })

        // Step 2: Upload file to S3 using presigned URL
        console.log('[process] Step 2: Uploading file to S3...')
        const s3Upload = await fetch(uploadData.uploadUrl, {
          method: 'PUT',
          body: nifti,
          headers: {
            'Content-Type': nifti.type || 'application/octet-stream'
          }
        })

        if (!s3Upload.ok) {
          throw new Error(`S3 upload failed: ${s3Upload.status}`)
        }

        console.log('[process] File uploaded to S3 successfully')
        set((s) => ({ job: { ...s.job, progress: 30 } }))
      } else {
        console.log('[process] Using already uploaded study:', jobId)
        set({ job: { id: jobId, status: 'RUNNING', progress: 20 } })
      }

      // Step 3: Trigger processing
      console.log('[process] Step 3: Starting SageMaker processing...')
      const processResp = await fetch(`${backend}/process/totalseg`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          jobId: jobId,
          device: 'gpu',
          fast: true,
          reduction_percent: 90
        })
      })

      if (!processResp.ok) {
        const error = await processResp.text()
        throw new Error(`Process request failed: ${error}`)
      }

      const meta = await processResp.json()
      console.log('[process] Processing started:', meta)

      // Note: Processing is now asynchronous. 
      // For now, we'll show the job is submitted and wait for completion
      // TODO: Implement polling for job status
      
      set((s) => ({ job: { ...s.job, progress: 50, status: 'PROCESSING' } }))
      console.log('[process] Job submitted to SageMaker. JobId:', jobId)
      console.log('[process] This may take 15-25 minutes on first run (endpoint creation + processing)')
      console.log('[process] Subsequent runs will be faster (10-15 minutes)')
      
      // For MVP: show success message that processing started
      // The user will need to manually check back or we need to implement polling
      set((s) => ({ 
        job: { 
          ...s.job, 
          progress: 100, 
          status: 'SUBMITTED',
          message: 'Processing started on SageMaker. This may take 15-25 minutes. Check back later for results.' 
        } 
      }))
      
      // TODO: Implement proper polling and result fetching
      // For now, we'll just return early
      
      /* Original code for when polling is implemented:
      set((s) => ({ job: { ...s.job, progress: 70 } }))
      const relJson = meta?.artifacts?.json
      const relObj = meta?.artifacts?.obj
      const relMtl = meta?.artifacts?.mtl
      const relZip = meta?.artifacts?.zip
      if (!relJson || !relObj || !relMtl) throw new Error('Artifacts missing from backend response')
      const jsonUrlAbs = `${backend}/files/${jobId}/Result.json`
      const objUrlAbs = `${backend}/files/${jobId}/Result.obj`
      const mtlUrlAbs = `${backend}/files/${jobId}/materials.mtl`
      const zipUrlAbs = relZip ? `${backend}/files/${jobId}/${relZip}` : ''
      set({ artifacts: { obj: objUrlAbs, mtl: mtlUrlAbs, json: jsonUrlAbs, zip: zipUrlAbs } })

      const jsonResp = await fetch(jsonUrlAbs)
      if (!jsonResp.ok) throw new Error('Failed to fetch Result.json')
      const systems = await jsonResp.json()

      // Map systems JSON to structures list
      const structures: StructureItem[] = []
      Object.entries<any>(systems).forEach(([system, arr]) => {
        if (Array.isArray(arr)) {
          for (const it of arr) {
            structures.push({
              id: `${system}__${it.object_name}`,
              name: it.object_name,
              system,
              color: Array.isArray(it.color) && it.color.length === 3 ? [it.color[0], it.color[1], it.color[2]] : [200,200,200],
              visible: true,
              opacity: 100,
            })
          }
        }
      })
      set({ structures })
      set((s) => ({ job: { ...s.job, progress: 100, status: 'SUCCEEDED' } }))
      */
    } catch (e: any) {
      // eslint-disable-next-line no-console
      console.warn('[process] error:', e)
      set((s) => ({ job: { ...s.job, progress: 100, status: 'FAILED', error: e?.message || 'Processing failed' } }))
    }
  },
  toggleFullscreen: (pane) => set((s) => ({ layout: { fullscreenPane: s.layout.fullscreenPane === pane ? null : pane } })),
  exitFullscreen: () => set(() => ({ layout: { fullscreenPane: null } })),
  setStructures: (items) => set(() => ({ structures: items })),
  setStructureVisible: (id, visible) => set((s) => ({ structures: s.structures.map((it) => (it.id === id ? { ...it, visible } : it)) })),
  setStructureOpacity: (id, opacity) => set((s) => ({ structures: s.structures.map((it) => (it.id === id ? { ...it, opacity } : it)) })),
  setStructureColor: (id, color) => set((s) => ({ structures: s.structures.map((it) => (it.id === id ? { ...it, color } : it)) })),
})

export const useAppStore = create<AppState>(creator)
