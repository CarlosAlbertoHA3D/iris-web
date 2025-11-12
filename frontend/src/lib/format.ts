export function formatBytes(bytes: number, decimals = 1) {
  if (!Number.isFinite(bytes)) return '—'
  if (bytes === 0) return '0 B'
  const k = 1024
  const dm = decimals < 0 ? 0 : decimals
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'] as const
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  const val = parseFloat((bytes / Math.pow(k, i)).toFixed(dm))
  return `${val} ${sizes[i]}`
}
