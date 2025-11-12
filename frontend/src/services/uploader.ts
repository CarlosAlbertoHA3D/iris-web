export interface PresignedPart {
  partNumber: number
  url: string
}

export interface MultipartPlan {
  uploadId: string
  key: string
  parts: PresignedPart[]
}

export interface UploadedPart {
  ETag: string
  PartNumber: number
}

export async function uploadPart(url: string, blob: Blob): Promise<string> {
  const res = await fetch(url, {
    method: 'PUT',
    body: blob,
  })
  if (!res.ok) throw new Error(`Part upload failed: ${res.status}`)
  // ETag usually returned in header
  const etag = res.headers.get('ETag') || ''
  return etag.replace(/"/g, '')
}

export async function uploadMultipart(
  file: File,
  plan: MultipartPlan,
  onProgress?: (loaded: number, total: number) => void,
  concurrency = 4
) {
  const size = file.size
  const totalParts = plan.parts.length
  let completed = 0
  let loadedBytes = 0

  const partSize = Math.ceil(size / totalParts)

  const queue = [...plan.parts]
  const uploaded: UploadedPart[] = []

  async function worker() {
    while (queue.length) {
      const part = queue.shift()!
      const start = (part.partNumber - 1) * partSize
      const end = Math.min(start + partSize, size)
      const blob = file.slice(start, end)
      const etag = await uploadPart(part.url, blob)
      uploaded.push({ ETag: etag, PartNumber: part.partNumber })
      completed += 1
      loadedBytes = Math.min(size, completed * partSize)
      onProgress?.(loadedBytes, size)
    }
  }

  const workers = Array.from({ length: Math.min(concurrency, totalParts) }, worker)
  await Promise.all(workers)
  return uploaded.sort((a, b) => a.PartNumber - b.PartNumber)
}
