import { create, type StateCreator } from 'zustand'
import { loadImageFromFiles } from '../services/itkLoader'

export type JobStatus = 'idle' | 'uploading' | 'queued' | 'processing' | 'completed' | 'failed'

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
  status: JobStatus
  progress: number
  error?: string
  message?: string
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
  labelId?: number
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
  artifacts?: { obj: string; mtl: string; json: string; zip: string; segmentation?: string }
  jobPollTimer?: number
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
  uploadStudy: () => Promise<string | undefined>
  startProcessing: () => Promise<void>
  restoreJobState: () => Promise<void>
  startJobMonitor: (jobId: string) => Promise<void>
  stopJobMonitor: () => void
  toggleFullscreen: (pane: Pane) => void
  exitFullscreen: () => void
  setStructures: (items: StructureItem[]) => void
  setStructureVisible: (id: string, visible: boolean) => void
  setStructureOpacity: (id: string, opacity: number) => void
  setStructureColor: (id: string, color: [number, number, number]) => void
}

const statusProgress: Record<JobStatus, number> = {
  idle: 0,
  uploading: 20,
  queued: 45,
  processing: 80,
  completed: 100,
  failed: 100,
}

const statusMessages: Record<JobStatus, string> = {
  idle: 'Ready to start processing.',
  uploading: 'Uploading study to secure storage...',
  queued: 'Starting GPU Spot instance (3-5 min)...',
  processing: 'AI is processing your study on GPU (typically 15-20 min).',
  completed: 'Processing finished. 3D models are ready to view.',
  failed: 'Processing failed. Please review the error and try again.',
}

const normalizeStatus = (status?: string): JobStatus => {
  if (!status) return 'idle'
  const normalized = status.toLowerCase()
  if (normalized === 'queued') return 'queued'
  if (normalized === 'processing') return 'processing'
  if (normalized === 'completed' || normalized === 'succeeded' || normalized === 'success') return 'completed'
  if (normalized === 'failed' || normalized === 'error') return 'failed'
  if (normalized === 'uploading' || normalized === 'uploaded' || normalized === 'pending') return 'uploading'
  return 'idle'
}

const buildStructuresFromSystems = (systems: any): StructureItem[] => {
  if (!systems || typeof systems !== 'object') return []
  const items: StructureItem[] = []
  Object.entries<any>(systems).forEach(([system, arr]) => {
    if (Array.isArray(arr)) {
      for (const it of arr) {
        items.push({
          id: `${system}__${it.object_name}`,
          name: it.object_name,
          system,
          labelId: it.label_id,
          color: Array.isArray(it.color) && it.color.length === 3 ? [it.color[0], it.color[1], it.color[2]] : [200, 200, 200],
          visible: true,
          opacity: 100,
        })
      }
    }
  })
  return items
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
  updateSlice: (plane, delta) =>
    set((state) => ({
      viewer: {
        ...state.viewer,
        [`${plane}Index`]: Math.max(0, state.viewer[`${plane}Index`] + delta),
      } as ViewerState,
    })),
  setSliceIndex: (plane, index) =>
    set((state) => ({
      viewer: {
        ...state.viewer,
        [`${plane}Index`]: index,
      } as ViewerState,
    })),
  setWW: (v) => set((state) => ({ viewer: { ...state.viewer, ww: v } })),
  setWL: (v) => set((state) => ({ viewer: { ...state.viewer, wl: v } })),
  setScale: (scale) => set((state) => ({ viewer: { ...state.viewer, scale } })),
  setPan: (x, y) => set((state) => ({ viewer: { ...state.viewer, panX: x, panY: y } })),
  toggleCrosshair: () =>
    set((state) => ({ viewer: { ...state.viewer, crosshair: !state.viewer.crosshair } })),
  toggleTheme: () => set((state) => ({ theme: state.theme === 'dark' ? 'light' : 'dark' })),
  job: {
    id: undefined,
    status: 'idle',
    progress: 0,
    message: statusMessages.idle,
  },
  uploads: [],
  studyId: undefined,
  currentImage: undefined,
  lastLocalFiles: [],
  layout: { fullscreenPane: null },
  structures: [],
  artifacts: undefined,
  jobPollTimer: undefined,
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
        
        // Center views by default
        const [x, y, z] = res.image.size
        const newState = {
            currentImage: res.image,
            lastLocalFiles: files,
            viewer: {
                ...get().viewer,
                // ITK images are (x, y, z). Axial slices along Z, Coronal along Y, Sagittal along X
                axialIndex: Math.floor(z / 2),
                coronalIndex: Math.floor(y / 2),
                sagittalIndex: Math.floor(x / 2)
            }
        }
        set(newState)
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
  uploadStudy: async () => {
    const backend = (import.meta as any).env?.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

    try {
      set((s) => ({ job: { ...s.job, status: 'uploading', progress: statusProgress.uploading, message: statusMessages.uploading } }))
      const { fetchAuthSession } = await import('aws-amplify/auth')
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString()
      
      if (!token) {
        throw new Error('Not authenticated. Please log in again.')
      }

      const { studyId, lastLocalFiles } = get()
      
      // If already uploaded, don't upload again
      if (studyId) {
        console.log('[upload] Study already uploaded:', studyId)
        set((s) => ({ job: { ...s.job, status: 'idle', progress: 0, message: 'Study already uploaded' } }))
        return studyId
      }

      console.log('[upload] Creating new upload...')
      
      const nifti = (lastLocalFiles || []).find(f => /\.nii(\.gz)?$/i.test(f.name)) || lastLocalFiles?.[0]
      if (!nifti) throw new Error('No file available to process. Please upload a file first.')

      let jobId: string

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
      console.log('[upload] Upload response:', uploadData)
      
      if (!uploadData.ok || !uploadData.uploadUrl || !uploadData.jobId) {
        throw new Error('Invalid upload response from server')
      }

      jobId = uploadData.jobId
      set((s) => ({
        job: { id: jobId, status: 'uploading', progress: 35, message: statusMessages.uploading },
        studyId: jobId,
      }))

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

      console.log('[upload] File uploaded to S3 successfully')
      
      try {
        await fetch(`${backend}/studies/${jobId}/status`, {
          method: 'PATCH',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          body: JSON.stringify({ status: 'uploaded' })
        })
        console.log(`[upload] Status updated to 'uploaded' for jobId: ${jobId}`)
      } catch (statusError) {
        console.error('[upload] Failed to update status:', statusError)
        // Continue anyway, upload was successful
      }
      
      set((s) => ({
        job: { id: jobId, status: 'idle', progress: 0, message: 'Upload complete' },
        studyId: jobId
      }))

      console.log('[upload] Upload complete. JobId:', jobId)
      return jobId

    } catch (e: any) {
      console.warn('[upload] error:', e)
      set((s) => ({
        job: {
          ...s.job,
          status: 'failed',
          progress: statusProgress.failed,
          error: e?.message || 'Upload failed',
          message: e?.message || statusMessages.failed,
        },
      }))
      throw e
    }
  },
  startProcessing: async () => {
    const backend = (import.meta as any).env?.VITE_BACKEND_URL || 'http://127.0.0.1:8000'

    try {
      const { fetchAuthSession } = await import('aws-amplify/auth')
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString()
      
      if (!token) {
        throw new Error('Not authenticated. Please log in again.')
      }

      let { studyId } = get()

      // If no studyId, upload first
      if (!studyId) {
        console.log('[process] No study uploaded, uploading first...')
        studyId = await get().uploadStudy()
        if (!studyId) {
          throw new Error('Upload failed, cannot process')
        }
      }

      console.log('[process] Starting processing for study:', studyId)
      set((s) => ({ job: { ...s.job, status: 'queued', progress: 50, message: 'Submitting job to GPU queue...' } }))

      // Now trigger the processing
      const processResp = await fetch(`${backend}/process/totalseg`, {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          jobId: studyId,
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

      set((s) => ({
        job: {
          id: studyId,
          status: 'queued',
          progress: statusProgress.queued,
          message: statusMessages.queued,
          error: undefined,
        },
        studyId: studyId,
      }))

      console.log('[process] Job submitted. JobId:', studyId)
      console.log('[process] This may take 18-25 minutes (Spot instance startup + GPU processing)')
      console.log('[process] Using GPU Spot instances (g4dn.xlarge)')

      await get().startJobMonitor(studyId)

    } catch (e: any) {
      console.warn('[process] error:', e)
      set((s) => ({
        job: {
          ...s.job,
          status: 'failed',
          progress: statusProgress.failed,
          error: e?.message || 'Processing failed',
          message: e?.message || statusMessages.failed,
        },
      }))
    }
  },
  startUploads: async () => {
    // Upload only, don't process
    await get().uploadStudy()
  },
  restoreJobState: async () => {
    const backend = (import.meta as any).env?.VITE_BACKEND_URL || 'http://127.0.0.1:8000'
    const { studyId } = get()
    
    if (!studyId) return

    try {
      const { fetchAuthSession } = await import('aws-amplify/auth')
      const session = await fetchAuthSession()
      const token = session.tokens?.idToken?.toString()
      
      if (!token) return

      console.log('[restore] Checking status for study:', studyId)
      const res = await fetch(`${backend}/jobs/${studyId}`, {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      })

      if (!res.ok) return

      const data = await res.json()
      const jobPayload = data?.job || {}
      const status = normalizeStatus(jobPayload.status)

      // If job is active OR completed, restore state and ensure artifacts are loaded
      if (status === 'queued' || status === 'processing' || status === 'completed') {
        console.log('[restore] Restoring job state:', status)
        set((s) => ({
          job: {
            id: studyId,
            status,
            progress: statusProgress[status],
            message: statusMessages[status],
          },
          studyId,
        }))
        await get().startJobMonitor(studyId)
      }
    } catch (e) {
      console.warn('[restore] Failed to restore job state:', e)
    }
  },
  startJobMonitor: async (jobId: string) => {
    const backend = (import.meta as any).env?.VITE_BACKEND_URL || 'http://127.0.0.1:8000'
    const { jobPollTimer, stopJobMonitor } = get()

    if (jobPollTimer) {
      stopJobMonitor()
    }

    const poll = async () => {
      try {
        const { fetchAuthSession } = await import('aws-amplify/auth')
        const session = await fetchAuthSession()
        const token = session.tokens?.idToken?.toString()
        if (!token) {
          throw new Error('Not authenticated. Please log in again.')
        }

        const res = await fetch(`${backend}/jobs/${jobId}`, {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
          },
        })

        if (!res.ok) {
          throw new Error(`Job status request failed: ${res.status}`)
        }

        const data = await res.json()
        const jobPayload = data?.job || {}
        const normalizedStatus = normalizeStatus(jobPayload.status)
        const message = statusMessages[normalizedStatus]
        const progress = statusProgress[normalizedStatus]
        const errorMessage: string | undefined = jobPayload.errorMessage
        const artifactUrls = jobPayload.artifactUrls as Record<string, string> | undefined

        set((s) => ({
          job: {
            id: jobId,
            status: normalizedStatus,
            progress,
            message,
            error: normalizedStatus === 'failed' ? (errorMessage || 'Processing failed') : undefined,
          },
          artifacts: artifactUrls && Object.keys(artifactUrls).length ? {
            obj: artifactUrls.obj || s.artifacts?.obj || '',
            mtl: artifactUrls.mtl || s.artifacts?.mtl || '',
            json: artifactUrls.json || s.artifacts?.json || '',
            zip: artifactUrls.zip || s.artifacts?.zip || '',
            segmentation: artifactUrls.segmentations || s.artifacts?.segmentation || '',
          } : s.artifacts,
        }))

        if (normalizedStatus === 'completed' && artifactUrls?.json) {
          try {
            const jsonResp = await fetch(artifactUrls.json)
            if (jsonResp.ok) {
              const systems = await jsonResp.json()
              const structures = buildStructuresFromSystems(systems)
              set({ structures })
            } else {
              console.warn('[process] Failed to fetch structures JSON:', jsonResp.status)
            }
          } catch (err) {
            console.warn('[process] Error fetching structures JSON:', err)
          }
        }

        if (normalizedStatus === 'completed' || normalizedStatus === 'failed') {
          stopJobMonitor()
        }
      } catch (err) {
        console.error('[process] Error polling job status:', err)
      }
    }

    await poll()
    const timer = window.setInterval(poll, 15000)
    set({ jobPollTimer: timer })
  },
  stopJobMonitor: () => {
    const current = get().jobPollTimer
    if (current) {
      window.clearInterval(current)
      set({ jobPollTimer: undefined })
    }
  },
  toggleFullscreen: (pane) => set((s) => ({ layout: { fullscreenPane: s.layout.fullscreenPane == null || s.layout.fullscreenPane !== pane ? pane : null } })),
  exitFullscreen: () => set(() => ({ layout: { fullscreenPane: null } })),
  setStructures: (items) => set(() => ({ structures: items })),
  setStructureVisible: (id, visible) => set((s) => ({ structures: s.structures.map((it) => (it.id === id ? { ...it, visible } : it)) })),
  setStructureOpacity: (id, opacity) => set((s) => ({ structures: s.structures.map((it) => (it.id === id ? { ...it, opacity } : it)) })),
  setStructureColor: (id, color) => set((s) => ({ structures: s.structures.map((it) => (it.id === id ? { ...it, color } : it)) })),
})

export const useAppStore = create<AppState>(creator)
