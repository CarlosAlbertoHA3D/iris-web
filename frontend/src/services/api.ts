export interface CreateStudyResponse {
  studyId: string
  presignedUploadUrls: string[]
}

export interface StartProcessResponse {
  jobId: string
}

export interface JobStatusResponse {
  status: 'PENDING' | 'RUNNING' | 'SUCCEEDED' | 'FAILED'
  progress: number
  error?: string
  resultManifest?: any
}

export interface ManifestFile {
  type: 'OBJ' | 'MTL' | 'JSON' | 'GLB' | 'ZIP'
  url: string
  size?: number
  hash?: string
}

export interface ResultsManifestResponse {
  files: ManifestFile[]
}

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8787'

async function http<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json() as Promise<T>
}

export const api = {
  createGuest: () => http('/auth/guest', { method: 'POST' }),
  createStudy: (): Promise<CreateStudyResponse> => http('/studies', { method: 'POST' }),
  startProcess: (studyId: string): Promise<StartProcessResponse> => http(`/studies/${studyId}/process`, { method: 'POST' }),
  getJob: (jobId: string): Promise<JobStatusResponse> => http(`/jobs/${jobId}`),
  getResultsManifest: (studyId: string): Promise<ResultsManifestResponse> => http(`/studies/${studyId}/results/manifest`),
}
