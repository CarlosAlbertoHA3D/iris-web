import { describe, it, expect } from 'vitest'
import { useAppStore } from './useAppStore'

describe('useAppStore', () => {
  it('toggles theme', () => {
    const before = useAppStore.getState().theme
    useAppStore.getState().toggleTheme()
    const after = useAppStore.getState().theme
    expect(after).not.toBe(before)
  })

  it('updates windowing', () => {
    useAppStore.getState().setWW(1234)
    useAppStore.getState().setWL(-50)
    const { ww, wl } = useAppStore.getState().viewer
    expect(ww).toBe(1234)
    expect(wl).toBe(-50)
  })

  it('queues uploads', () => {
    const file = new File(['x'], 'test.nii', { type: 'application/octet-stream' })
    useAppStore.getState().queueFiles([file])
    const items = useAppStore.getState().uploads
    expect(items.length).toBeGreaterThan(0)
    expect(items[0].file.name).toBe('test.nii')
  })
})
