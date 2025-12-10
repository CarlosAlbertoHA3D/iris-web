import { useEffect, useRef, useState, useMemo } from 'react'
import { useAppStore } from '../store/useAppStore'
import { loadImageFromFiles } from '../services/itkLoader'

export type Plane = 'sagittal' | 'coronal' | 'axial'

import { X, Eye, EyeOff } from 'lucide-react'
import { Slider } from './ui/slider'

function rgbToHex([r, g, b]: [number, number, number]) {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return [r, g, b]
}

export default function TriplanarViewer({ plane, tall }: { plane: Plane; tall?: boolean }) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const viewer = useRef<any>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const [fallbackActive, setFallbackActive] = useState(false)
  const [viewerReadyTick, setViewerReadyTick] = useState(0)
  
  // Segmentation state
  const artifacts = useAppStore(s => s.artifacts)
  const structures = useAppStore(s => s.structures)
  const setVisible = useAppStore(s => s.setStructureVisible)
  const setOpacity = useAppStore(s => s.setStructureOpacity)
  const setColor = useAppStore(s => s.setStructureColor)
  const [labelImage, setLabelImage] = useState<any>(null)
  const [showLabel, setShowLabel] = useState(false)
  const [selectedLabel, setSelectedLabel] = useState<{ id: number, x: number, y: number } | null>(null)

  const crosshair = useAppStore(s => s.viewer.crosshair)
  const ww = useAppStore(s => s.viewer.ww)
  const wl = useAppStore(s => s.viewer.wl)
  const updateSlice = useAppStore(s => s.updateSlice)
  const currentImage = useAppStore(s => s.currentImage)
  const axialIndex = useAppStore(s => s.viewer.axialIndex)
  const coronalIndex = useAppStore(s => s.viewer.coronalIndex)
  const sagittalIndex = useAppStore(s => s.viewer.sagittalIndex)
  const setSliceIndex = useAppStore(s => s.setSliceIndex)
  const setWWAction = useAppStore(s => s.setWW)
  const setWLAction = useAppStore(s => s.setWL)
  const setScaleAction = useAppStore(s => s.setScale)
  const scale = useAppStore(s => s.viewer.scale)
  const setPanAction = useAppStore(s => s.setPan)
  const panX = useAppStore(s => s.viewer.panX)
  const panY = useAppStore(s => s.viewer.panY)
  const initWWWL = useRef(false)

  // Compute color map for segmentation labels
  const colorMap = useMemo(() => {
    const map = new Map<number, {r: number, g: number, b: number, visible: boolean, opacity: number}>()
    structures.forEach(s => {
        if (typeof s.labelId === 'number') {
            map.set(s.labelId, {
                r: s.color[0],
                g: s.color[1],
                b: s.color[2],
                visible: s.visible,
                opacity: s.opacity
            })
        }
    })
    return map
  }, [structures])

  // Download segmentation mask if available
  useEffect(() => {
    if (!artifacts?.segmentation || labelImage) return
    
    fetch(artifacts.segmentation)
        .then(res => {
            if (!res.ok) throw new Error('Fetch failed')
            return res.blob()
        })
        .then(blob => {
            const file = new File([blob], "segmentation.nii.gz")
            loadImageFromFiles([file]).then(res => {
                if (res?.image) {
                    console.log(`[viewer] Label image loaded for ${plane}`)
                    
                    // Fix: Flip X axis (Horizontal Mirror) for segmentation mask
                    // This aligns with the 3D view fix and standard radiological display
                    const img = res.image
                    const data = img.data
                    const size = img.size
                    
                    if (data && size && size.length >= 3) {
                        const sx = size[0]
                        const sy = size[1]
                        const sz = size[2]
                        
                        // Process slice by slice, row by row
                        // X is the inner-most dimension (contiguous)
                        for (let z = 0; z < sz; z++) {
                            for (let y = 0; y < sy; y++) {
                                const offset = (z * sy + y) * sx
                                // subarray returns a view, reverse modifies in-place
                                data.subarray(offset, offset + sx).reverse()
                            }
                        }
                        console.log(`[viewer] Applied X-flip to segmentation mask`)
                    }

                    setLabelImage(res.image)
                }
            })
        })
        .catch(err => console.warn('[viewer] Failed to load segmentation', err))
  }, [artifacts?.segmentation])

  // Sync label image with viewer
  useEffect(() => {
    const v = viewer.current
    if (!v) return
    
    try {
        if (typeof v.setLabelImage === 'function') {
            if (labelImage && showLabel) {
                console.log(`[viewer] Setting label image...`)
                v.setLabelImage(labelImage)
                
                // Force blend mode to ensure visibility
                if (typeof v.setLabelImageBlend === 'function') {
                    v.setLabelImageBlend(0.5)
                }
                // Ensure weights if applicable
                if (typeof v.setLabelImageWeights === 'function') {
                    v.setLabelImageWeights(0.5)
                }
            } else {
                v.setLabelImage(null)
            }
        }
    } catch (e) {
        console.warn('[viewer] Error setting label image:', e)
    }
  }, [labelImage, showLabel, viewerReadyTick, currentImage])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault()
        updateSlice(plane, e.key === 'ArrowUp' ? 1 : -1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [plane, updateSlice])

  useEffect(() => {
    // Lazy-load itk-vtk-viewer without breaking the placeholder UI
    try { console.log(`[viewer:${plane}] mount effect start`) } catch {}
    let canceled = false
    ;(async () => {
      try {
        if (!containerRef.current) { try { console.log(`[viewer:${plane}] containerRef is null`) } catch {}; return }
        let createViewer: any | undefined
        try {
          const mod: any = await import('itk-vtk-viewer')
          createViewer = mod?.default ?? mod?.createViewer ?? mod
        } catch (e) {
          console.warn(`[viewer:${plane}] itk-vtk-viewer dynamic import failed, using canvas fallback`, e)
          setFallbackActive(true)
          return
        }
        if (typeof createViewer !== 'function') {
          try { console.log(`[viewer:${plane}] createViewer is not a function, using canvas fallback`) } catch {}
          setFallbackActive(true)
          return
        }
        const stateAtCreate = (useAppStore as any).getState?.()
        const imgAtCreate = stateAtCreate?.currentImage
        const v = await createViewer(containerRef.current, {
          // Keep built-in UI hidden; we manage our own controls
          uiCollapsed: true,
          use2D: true,
          ...(imgAtCreate ? { image: imgAtCreate } : {}),
        })
        if (!canceled) viewer.current = v
        try { setViewerReadyTick((t) => t + 1); console.log(`[viewer:${plane}] ready`) } catch {}
        try {
          const keys = Object.keys(v || {})
          console.log(`[viewer:${plane}] created. has setImage=${typeof (v as any)?.setImage} keys[0..20]=`, keys.slice(0, 20))
        } catch {}
        // Set plane view mode if available
        try {
          if (typeof v.setViewMode === 'function') {
            if (plane === 'axial') v.setViewMode('ZPlane')
            if (plane === 'coronal') v.setViewMode('YPlane')
            if (plane === 'sagittal') v.setViewMode('XPlane')
            try { console.log(`[viewer:${plane}] setViewMode applied`) } catch {}
          }
        } catch {}
        // Ensure viewer sized/rendered
        try { if (typeof v.resize === 'function') v.resize() } catch {}
        try { if (typeof v.render === 'function') v.render() } catch {}
      } catch (e) {
        // Fail silently; placeholder stays visible
        console.warn('itk-vtk-viewer load failed, using canvas fallback:', e)
        setFallbackActive(true)
      }
    })()
    return () => {
      canceled = true
      try {
        if (viewer.current?.destroy) viewer.current.destroy()
      } catch {}
      viewer.current = null
    }
  }, [])

  // Force resize/redraw after CSS transition (300ms)
  const [, forceUpdate] = useState(0)
  useEffect(() => {
    const timers: number[] = []
    // Check at intervals, and definitely after transition ends
    ;[50, 150, 300, 400].forEach(t => {
        timers.push(window.setTimeout(() => {
            const v = viewer.current
            
            // 1. Force VTK Resize & Render
            if (v) {
                try { if (typeof v.resize === 'function') v.resize() } catch {}
                
                // Hack: Re-set current slice to force pipeline update (fixes aspect ratio)
                try {
                    if (plane === 'axial') {
                        const idx = useAppStore.getState().viewer.axialIndex
                        if (typeof v.setZSlice === 'function') v.setZSlice(idx)
                    } else if (plane === 'coronal') {
                        const idx = useAppStore.getState().viewer.coronalIndex
                        if (typeof v.setYSlice === 'function') v.setYSlice(idx)
                    } else if (plane === 'sagittal') {
                        const idx = useAppStore.getState().viewer.sagittalIndex
                        if (typeof v.setXSlice === 'function') v.setXSlice(idx)
                    }
                } catch {}
                
                try { if (typeof v.render === 'function') v.render() } catch {}
            }

            // 2. Force Fallback Redraw
            forceUpdate(n => n + 1)
        }, t))
    })
    return () => timers.forEach(t => clearTimeout(t))
  }, [tall, plane])

  // Mouse wheel / touchpad: change slices
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    const onWheel = (e: WheelEvent) => {
      try {
        e.preventDefault()
        e.stopPropagation()
      } catch {}
      const dir = Math.sign(e.deltaY || 0) || 0
      if (dir === 0) return
      const step = e.shiftKey ? 5 : 1
      updateSlice(plane, dir > 0 ? step : -step)
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [plane, updateSlice])

  // Keep viewer in sync with container size
  useEffect(() => {
    const v = viewer.current
    const el = containerRef.current
    if (!v || !el) return
    let ro: ResizeObserver | null = null
    const onResize = () => {
      try { if (typeof v.resize === 'function') v.resize() } catch {}
      try { if (typeof v.render === 'function') v.render() } catch {}
    }
    try {
      ro = new ResizeObserver(onResize)
      ro.observe(el)
    } catch {}
    window.addEventListener('resize', onResize)
    return () => {
      window.removeEventListener('resize', onResize)
      try { ro?.disconnect() } catch {}
    }
  }, [viewer.current])

  useEffect(() => {
    const v = viewer.current
    if ((!v && !fallbackActive) || !currentImage) return
    ;(async () => {
      try {
        if (!v && fallbackActive) {
          // Canvas fallback has no setImage; just trigger draw via deps below
          return
        }
        // Load image
        let applied = false
        if (typeof v.setImage === 'function') {
          try {
            await v.setImage(currentImage)
            applied = true
          } catch (e) {
            console.warn(`[viewer:${plane}] setImage threw, will re-create viewer with image`, e)
          }
        }
        if (!applied) {
          // Re-create viewer with image provided at construction
          try { if (viewer.current?.destroy) viewer.current.destroy() } catch {}
          try {
            const mod: any = await import('itk-vtk-viewer')
            const createViewer: any = mod?.default ?? mod?.createViewer ?? mod
            if (typeof createViewer === 'function' && containerRef.current) {
              const v2 = await createViewer(containerRef.current, {
                uiCollapsed: true,
                use2D: true,
                image: currentImage,
              })
              viewer.current = v2
              try {
                const keys2 = Object.keys(v2 || {})
                console.log(`[viewer:${plane}] re-created with image. has setImage=${typeof (v2 as any)?.setImage} keys[0..20]=`, keys2.slice(0, 20))
              } catch {}
              // Set plane view mode if available
              try {
                if (typeof v2.setViewMode === 'function') {
                  if (plane === 'axial') v2.setViewMode('ZPlane')
                  if (plane === 'coronal') v2.setViewMode('YPlane')
                  if (plane === 'sagittal') v2.setViewMode('XPlane')
                }
              } catch {}
              // Ensure viewer sized/rendered
              try { if (typeof v2.resetCamera === 'function') v2.resetCamera() } catch {}
              try { if (typeof v2.resize === 'function') v2.resize() } catch {}
              try { if (typeof v2.render === 'function') v2.render() } catch {}
            } else {
              setFallbackActive(true)
              return
            }
          } catch (e) {
            console.warn(`[viewer:${plane}] re-create failed`, e)
            setFallbackActive(true)
            return
          }
        }
        try {
          const sz = (currentImage as any)?.size || (currentImage as any)?.image?.size
          console.log(`[viewer:${plane}] setImage OK. size=`, sz)
        } catch {}
        // Set view mode for this pane
        try {
          const vv = viewer.current || v
          if (vv && typeof vv.setViewMode === 'function') {
            if (plane === 'axial') vv.setViewMode('ZPlane')
            if (plane === 'coronal') vv.setViewMode('YPlane')
            if (plane === 'sagittal') vv.setViewMode('XPlane')
            try { console.log(`[viewer:${plane}] setViewMode re-applied after image`) } catch {}
          }
        } catch {}
        // Center slices if we know image size
        initWWWL.current = false
        const size = (currentImage as any)?.size || (currentImage as any)?.image?.size
        if (Array.isArray(size) && size.length >= 3) {
          const sx = Math.max(0, Math.floor(size[0] / 2))
          const sy = Math.max(0, Math.floor(size[1] / 2))
          const sz = Math.max(0, Math.floor(size[2] / 2))
          setSliceIndex('sagittal', sx)
          setSliceIndex('coronal', sy)
          setSliceIndex('axial', sz)
          try { console.log(`[viewer:${plane}] centered slices -> X:${sx} Y:${sy} Z:${sz}`) } catch {}
        }
        // Compute initial WW/WL from pixel range if data exists (once per image)
        if (!initWWWL.current) {
          const data: any = (currentImage as any)?.data || (currentImage as any)?.image?.data
          if (data && typeof data.length === 'number' && data.length > 0) {
            let min = Number.POSITIVE_INFINITY
            let max = Number.NEGATIVE_INFINITY
            const len = data.length
            for (let i = 0; i < len; i++) {
              const pv = data[i]
              if (pv < min) min = pv
              if (pv > max) max = pv
            }
            if (Number.isFinite(min) && Number.isFinite(max) && max > min) {
              const wlNew = (min + max) / 2
              const wwNew = (max - min)
              setWLAction(wlNew)
              setWWAction(wwNew)
              try {
                if (typeof (v as any).setImageColorRange === 'function') {
                  try { (v as any).setImageColorRange(0, [min, max]) } catch {}
                  try { (v as any).setImageColorRange([min, max]) } catch {}
                }
                console.log(`[viewer:${plane}] initial colorRange set -> [${min}, ${max}] (WL=${wlNew}, WW=${wwNew})`)
              } catch {}
              initWWWL.current = true
            }
          }
        }
        // Render
        try {
          const vv = viewer.current || v
          if (vv) {
            if (typeof vv.resetCamera === 'function') vv.resetCamera()
            if (typeof vv.resize === 'function') vv.resize()
            if (typeof vv.render === 'function') vv.render()
          }
        } catch {}
        try { console.log(`[viewer:${plane}] initial render complete`) } catch {}
      } catch (e) {
        console.warn('setImage failed:', e)
      }
    })()
  }, [currentImage, viewerReadyTick, fallbackActive])

  // Canvas fallback renderer
  useEffect(() => {
    if (!fallbackActive) return
    const img: any = currentImage
    if (!img || !img.data || !Array.isArray(img.size)) return
    const [sx, sy, sz] = img.size as number[]
    const data: Float32Array = img.data as Float32Array
    
    // Image is now reoriented to RAS in the loader, so use standard radiological conventions
    // For radiological viewing (patient facing you):
    // - Axial: flip Y so anterior is at top of screen
    // - Coronal: flip Z so superior (head) is at top
    // - Sagittal: flip Z so superior (head) is at top
    const flipY = true
    const flipZ = true
    
    // Label data
    const lbl = (showLabel && labelImage) ? labelImage : null
    const lblData = lbl ? (lbl.data as Float32Array | Uint8Array | Int16Array) : null
    
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const toSlice = () => {
      let w = 0, h = 0
      const zStride = sx * sy
      const pick = (x: number, y: number, z: number) => data[x + y * sx + z * zStride]
      const pickLbl = (x: number, y: number, z: number) => lblData ? lblData[x + y * sx + z * zStride] : 0
      
      let zIndex = Math.max(0, Math.min(sz - 1, (plane === 'axial' ? useAppStore.getState().viewer.axialIndex : plane === 'coronal' ? useAppStore.getState().viewer.coronalIndex : useAppStore.getState().viewer.sagittalIndex)))
      if (plane === 'axial') { w = sx; h = sy }
      if (plane === 'coronal') { w = sx; h = sz }
      if (plane === 'sagittal') { w = sy; h = sz }
      
      // Allocate RGBA buffer
      const imageData = new ImageData(w, h)
      // Window/level
      const wl = useAppStore.getState().viewer.wl
      const ww = useAppStore.getState().viewer.ww
      const min = wl - ww / 2
      const max = wl + ww / 2
      const denom = Math.max(1e-6, max - min)
      const clamp01 = (v: number) => Math.max(0, Math.min(1, (v - min) / denom))
      
      // Fill buffer
      if (plane === 'axial') {
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            // Flip Y based on direction matrix
            const yy = flipY ? (sy - 1 - y) : y
            const v = pick(x, yy, zIndex)
            const l = pickLbl(x, yy, zIndex)
            
            const g = Math.round(clamp01(v) * 255)
            const off = (y * w + x) * 4
            
            let rOut = g, gOut = g, bOut = g
            
            if (l > 0) {
                const c = colorMap.get(l)
                // Use structure color if available, otherwise fallback to red
                // Also respect structure visibility
                if (c) {
                    if (c.visible) {
                        const alpha = Math.max(0.1, c.opacity / 100) * 0.5 // Base opacity 0.5 * structure opacity
                        rOut = g * (1 - alpha) + c.r * alpha
                        gOut = g * (1 - alpha) + c.g * alpha
                        bOut = g * (1 - alpha) + c.b * alpha
                    }
                } else {
                    // Fallback red
                    const alpha = 0.5
                    rOut = g * (1 - alpha) + 255 * alpha
                    gOut = g * (1 - alpha) + 0 * alpha
                    bOut = g * (1 - alpha) + 0 * alpha
                }
            }
            
            imageData.data[off + 0] = rOut
            imageData.data[off + 1] = gOut
            imageData.data[off + 2] = bOut
            imageData.data[off + 3] = 255
          }
        }
      } else if (plane === 'coronal') {
        const yIndex = Math.max(0, Math.min(sy - 1, useAppStore.getState().viewer.coronalIndex))
        for (let z = 0; z < h; z++) {
          for (let x = 0; x < w; x++) {
            // Flip Z based on direction matrix
            const zz = flipZ ? (sz - 1 - z) : z
            const v = pick(x, yIndex, zz)
            const l = pickLbl(x, yIndex, zz)
            
            const g = Math.round(clamp01(v) * 255)
            const off = (z * w + x) * 4
            
            let rOut = g, gOut = g, bOut = g
            
            if (l > 0) {
                const c = colorMap.get(l)
                if (c) {
                    if (c.visible) {
                        const alpha = Math.max(0.1, c.opacity / 100) * 0.5
                        rOut = g * (1 - alpha) + c.r * alpha
                        gOut = g * (1 - alpha) + c.g * alpha
                        bOut = g * (1 - alpha) + c.b * alpha
                    }
                } else {
                    const alpha = 0.5
                    rOut = g * (1 - alpha) + 255 * alpha
                    gOut = g * (1 - alpha) + 0 * alpha
                    bOut = g * (1 - alpha) + 0 * alpha
                }
            }
            
            imageData.data[off + 0] = rOut
            imageData.data[off + 1] = gOut
            imageData.data[off + 2] = bOut
            imageData.data[off + 3] = 255
          }
        }
      } else {
        const xIndex = Math.max(0, Math.min(sx - 1, useAppStore.getState().viewer.sagittalIndex))
        for (let z = 0; z < h; z++) {
          for (let y = 0; y < w; y++) {
            // Flip Z based on direction matrix
            const zz = flipZ ? (sz - 1 - z) : z
            const v = pick(xIndex, y, zz)
            const l = pickLbl(xIndex, y, zz)
            
            const g = Math.round(clamp01(v) * 255)
            const off = (z * w + y) * 4
            
            let rOut = g, gOut = g, bOut = g
            
            if (l > 0) {
                const c = colorMap.get(l)
                if (c) {
                    if (c.visible) {
                        const alpha = Math.max(0.1, c.opacity / 100) * 0.5
                        rOut = g * (1 - alpha) + c.r * alpha
                        gOut = g * (1 - alpha) + c.g * alpha
                        bOut = g * (1 - alpha) + c.b * alpha
                    }
                } else {
                    const alpha = 0.5
                    rOut = g * (1 - alpha) + 255 * alpha
                    gOut = g * (1 - alpha) + 0 * alpha
                    bOut = g * (1 - alpha) + 0 * alpha
                }
            }
            
            imageData.data[off + 0] = rOut
            imageData.data[off + 1] = gOut
            imageData.data[off + 2] = bOut
            imageData.data[off + 3] = 255
          }
        }
      }

      // Resize canvas to container
      const rect = container.getBoundingClientRect()
      const dpr = Math.min(2, window.devicePixelRatio || 1)
      const cw = rect.width
      const ch = rect.height
      
      canvas.width = Math.floor(cw * dpr)
      canvas.height = Math.floor(ch * dpr)
      
      const ctx = canvas.getContext('2d')!
      
      // Offscreen rendering
      const off = document.createElement('canvas')
      off.width = w
      off.height = h
      const offCtx = off.getContext('2d')!
      offCtx.putImageData(imageData, 0, 0)
      
      // Fit preserving aspect
      const scale = Math.min(cw / w, ch / h)
      const dw = w * scale
      const dh = h * scale
      const dx = (cw - dw) / 2
      const dy = (ch - dh) / 2
      
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
      ctx.fillStyle = 'black'
      ctx.fillRect(0, 0, cw, ch)
      ctx.imageSmoothingEnabled = false // Pixelated look for medical images
      ctx.drawImage(off, dx, dy, dw, dh)
    }
    toSlice()
  }, [fallbackActive, currentImage, axialIndex, coronalIndex, sagittalIndex, wl, ww, labelImage, showLabel, colorMap])

  // Slice sync (store -> viewer)
  useEffect(() => {
    const v = viewer.current
    if (!v) return
    // Clamp based on current image size if present
    const size: number[] | undefined = (currentImage as any)?.size || (currentImage as any)?.image?.size
    try {
      if (plane === 'axial' && typeof v.setZSlice === 'function') {
        const zMax = Array.isArray(size) && size.length >= 3 ? (size[2] - 1) : undefined
        const z = zMax != null ? Math.max(0, Math.min(zMax, axialIndex)) : axialIndex
        v.setZSlice(z)
      }
      if (plane === 'coronal' && typeof v.setYSlice === 'function') {
        const yMax = Array.isArray(size) && size.length >= 2 ? (size[1] - 1) : undefined
        const y = yMax != null ? Math.max(0, Math.min(yMax, coronalIndex)) : coronalIndex
        v.setYSlice(y)
      }
      if (plane === 'sagittal' && typeof v.setXSlice === 'function') {
        const xMax = Array.isArray(size) && size.length >= 1 ? (size[0] - 1) : undefined
        const x = xMax != null ? Math.max(0, Math.min(xMax, sagittalIndex)) : sagittalIndex
        v.setXSlice(x)
      }
    } catch (e) {
      console.warn('set*Slice failed:', e)
    }
  }, [plane, axialIndex, coronalIndex, sagittalIndex, currentImage])

  // WW/WL sync (store -> viewer)
  useEffect(() => {
    const v = viewer.current
    if (!v) return
    const min = wl - ww / 2
    const max = wl + ww / 2
    try {
      const setRange = (v as any).setImageColorRange
      if (typeof setRange !== 'function') return
      // Try multiple signatures to support different versions
      let ok = false
      try { setRange(0, [min, max]); ok = true } catch {}
      if (!ok) { try { setRange([min, max]); ok = true } catch {} }
      if (!ok) {
        const names = typeof (v as any).getLayerNames === 'function' ? (v as any).getLayerNames() : undefined
        const first = names && names.length ? names[0] : undefined
        try { setRange(0, first, [min, max]); ok = true } catch {}
      }
    } catch (e) {
      console.warn('setImageColorRange failed:', e)
    }
  }, [ww, wl])

  // Crosshair/annotations sync (store -> viewer)
  useEffect(() => {
    const v = viewer.current
    if (!v) return
    try {
      if (typeof v.setAnnotationsEnabled === 'function') v.setAnnotationsEnabled(crosshair)
    } catch (e) {
      console.warn('setAnnotationsEnabled failed:', e)
    }
  }, [crosshair])

  // Scale sync (store -> viewer)
  useEffect(() => {
    const v = viewer.current
    if (!v || scale == null) return
    try {
      if (typeof v.setScale === 'function') v.setScale(scale)
      else if (typeof v.setImageScale === 'function') v.setImageScale(scale)
    } catch (e) {
      console.warn('setScale failed:', e)
    }
  }, [scale])

  // Pan sync (store -> viewer)
  useEffect(() => {
    const v = viewer.current
    if (!v || panX == null || panY == null) return
    try {
      if (typeof (v as any).setViewCenter === 'function') (v as any).setViewCenter([panX, panY])
      else if (typeof (v as any).setPan === 'function') (v as any).setPan(panX, panY)
      else if (typeof (v as any).setCenter === 'function') (v as any).setCenter(panX, panY)
    } catch (e) {
      console.warn('setPan failed:', e)
    }
  }, [panX, panY])

  // Viewer -> Store sync (polling)
  useEffect(() => {
    const v = viewer.current
    if (!v) return
    let raf = 0
    let lastX = axialIndex, lastY = coronalIndex, lastZ = sagittalIndex
    const tick = () => {
      try {
        // Slice indices
        if (typeof v.getZSlice === 'function') {
          const z = v.getZSlice()
          if (Number.isFinite(z) && z !== axialIndex) setSliceIndex('axial', z)
          lastZ = z
        }
        if (typeof v.getYSlice === 'function') {
          const y = v.getYSlice()
          if (Number.isFinite(y) && y !== coronalIndex) setSliceIndex('coronal', y)
          lastY = y
        }
        if (typeof v.getXSlice === 'function') {
          const x = v.getXSlice()
          if (Number.isFinite(x) && x !== sagittalIndex) setSliceIndex('sagittal', x)
          lastX = x
        }
        // WW/WL from color range
        if (typeof (v as any).getImageColorRange === 'function') {
          let range: any
          try { range = (v as any).getImageColorRange(0) } catch {}
          if (!range) { try { range = (v as any).getImageColorRange() } catch {} }
          if (!range) {
            const names = typeof (v as any).getLayerNames === 'function' ? (v as any).getLayerNames() : undefined
            const first = names && names.length ? names[0] : undefined
            try { range = (v as any).getImageColorRange(0, first) } catch {}
          }
          if (range && Array.isArray(range) && range.length === 2) {
            const [min, max] = range
            if (Number.isFinite(min) && Number.isFinite(max)) {
              const wlNew = (min + max) / 2
              const wwNew = (max - min)
              const eps = 0.5
              if (Math.abs(wlNew - wl) > eps) setWLAction(wlNew)
              if (Math.abs(wwNew - ww) > eps) setWWAction(wwNew)
            }
          }
        }
        // Scale (zoom)
        if (typeof (v as any).getScale === 'function') {
          const s = (v as any).getScale()
          if (Number.isFinite(s) && s !== scale) setScaleAction(s)
        } else if (typeof (v as any).getImageScale === 'function') {
          const s = (v as any).getImageScale()
          if (Number.isFinite(s) && s !== scale) setScaleAction(s)
        }
        // Pan (center)
        if (typeof (v as any).getViewCenter === 'function') {
          const c = (v as any).getViewCenter()
          if (Array.isArray(c) && c.length >= 2) {
            const [cx, cy] = c
            const eps = 0.25
            if ((panX == null || Math.abs(cx - panX) > eps) || (panY == null || Math.abs(cy - panY) > eps)) {
              setPanAction(cx, cy)
            }
          }
        } else if (typeof (v as any).getPan === 'function') {
          const p = (v as any).getPan()
          if (p && typeof p.x === 'number' && typeof p.y === 'number') {
            const eps = 0.25
            if ((panX == null || Math.abs(p.x - panX) > eps) || (panY == null || Math.abs(p.y - panY) > eps)) {
              setPanAction(p.x, p.y)
            }
          }
        } else if (typeof (v as any).getCenter === 'function') {
          const c = (v as any).getCenter()
          if (Array.isArray(c) && c.length >= 2) {
            const [cx, cy] = c
            const eps = 0.25
            if ((panX == null || Math.abs(cx - panX) > eps) || (panY == null || Math.abs(cy - panY) > eps)) {
              setPanAction(cx, cy)
            }
          }
        }
      } catch {}
      raf = window.requestAnimationFrame(tick)
    }
    raf = window.requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [setSliceIndex, setWWAction, setWLAction, axialIndex, coronalIndex, sagittalIndex, wl, ww])

  const showOverlay = !currentImage
  try { console.log(`[viewer:${plane}] showOverlay=${showOverlay} hasImage=${!!currentImage} hasViewer=${!!viewer.current}`) } catch {}
  const handleCanvasClick = (e: React.MouseEvent) => {
    if (!labelImage || !showLabel || !currentImage) return

    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const rect = container.getBoundingClientRect()
    const img: any = currentImage
    const [sx, sy, sz] = img.size as number[]
    
    // Reconstruct view params (same as render logic)
    let w = 0, h = 0
    if (plane === 'axial') { w = sx; h = sy }
    if (plane === 'coronal') { w = sx; h = sz }
    if (plane === 'sagittal') { w = sy; h = sz }
    
    const cw = rect.width
    const ch = rect.height
    const scale = Math.min(cw / w, ch / h)
    const dw = w * scale
    const dh = h * scale
    const dx = (cw - dw) / 2
    const dy = (ch - dh) / 2
    
    // Mouse relative to container
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    
    // Map to image coords
    const ix = Math.floor((mx - dx) / scale)
    const iy = Math.floor((my - dy) / scale)
    
    if (ix < 0 || ix >= w || iy < 0 || iy >= h) {
        setSelectedLabel(null)
        return
    }
    
    // Map to 3D coords
    let x = 0, y = 0, z = 0
    const zIndex = Math.max(0, Math.min(sz - 1, (plane === 'axial' ? useAppStore.getState().viewer.axialIndex : plane === 'coronal' ? useAppStore.getState().viewer.coronalIndex : useAppStore.getState().viewer.sagittalIndex)))
    
    if (plane === 'axial') {
        // axial: x=ix, y=(sy - 1 - iy), z=zIndex
        x = ix
        y = sy - 1 - iy
        z = zIndex
    } else if (plane === 'coronal') {
        // coronal: x=ix, y=yIndex, z=(sz - 1 - iy)
        const yIndex = Math.max(0, Math.min(sy - 1, useAppStore.getState().viewer.coronalIndex))
        x = ix
        y = yIndex
        z = sz - 1 - iy
    } else {
        // sagittal: x=xIndex, y=ix, z=(sz - 1 - iy)
        const xIndex = Math.max(0, Math.min(sx - 1, useAppStore.getState().viewer.sagittalIndex))
        x = xIndex
        y = ix
        z = sz - 1 - iy
    }
    
    // Look up label value
    const lblData = labelImage.data as Float32Array | Uint8Array | Int16Array
    const zStride = sx * sy
    const idx = x + y * sx + z * zStride
    const val = lblData[idx]
    
    if (val > 0) {
        setSelectedLabel({ id: val, x: e.clientX, y: e.clientY })
    } else {
        setSelectedLabel(null)
    }
  }

  const selectedStructure = selectedLabel ? structures.find(s => s.labelId === selectedLabel.id) : null

  return (
    <div ref={containerRef} onClick={handleCanvasClick} className={`relative ${tall ? 'h-[70vh]' : 'h-[320px]'} bg-black/70 rounded-md overflow-hidden cursor-crosshair`}>
      {/* Selection Tooltip */}
      {selectedLabel && selectedStructure && (
        <div 
            className="absolute z-20 p-3 bg-black/90 rounded-md border border-white/20 shadow-xl backdrop-blur-sm text-white w-64 max-h-[60vh] overflow-y-auto overflow-x-hidden"
            style={(() => {
                if (!containerRef.current) return {};
                const rect = containerRef.current.getBoundingClientRect();
                const x = selectedLabel.x - rect.left;
                const y = selectedLabel.y - rect.top;
                const isBottom = y > rect.height / 2;
                const isRight = x > rect.width / 2;
                
                return {
                    left: isRight ? 'auto' : Math.min(x + 15, rect.width - 270),
                    right: isRight ? Math.min(rect.width - x + 15, rect.width - 270) : 'auto',
                    top: isBottom ? 'auto' : y + 10,
                    bottom: isBottom ? (rect.height - y + 10) : 'auto'
                };
            })()}
            onClick={(e) => e.stopPropagation()}
        >
            <div className="flex justify-between items-center mb-3 border-b border-white/10 pb-2">
                <span className="font-bold text-sm">{selectedStructure.name}</span>
                <button 
                    onClick={() => setSelectedLabel(null)}
                    className="hover:text-red-400 transition-colors"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>

            <div className="space-y-3">
                {/* Hide Button */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Visibility</span>
                    <button 
                        onClick={() => {
                            setVisible(selectedStructure.id, false)
                            setSelectedLabel(null)
                        }}
                        className="flex items-center gap-2 px-2 py-1 bg-white/10 hover:bg-white/20 rounded text-xs transition-colors"
                    >
                        <EyeOff className="w-3 h-3" />
                        Hide
                    </button>
                </div>

                {/* Color Picker */}
                <div className="flex items-center justify-between">
                    <span className="text-xs text-gray-400">Color</span>
                    <div className="flex items-center gap-2">
                        <div 
                            className="w-4 h-4 rounded-full border border-white/30"
                            style={{ backgroundColor: rgbToHex(selectedStructure.color) }}
                        />
                        <input 
                            type="color" 
                            value={rgbToHex(selectedStructure.color)}
                            onChange={(e) => setColor(selectedStructure.id, hexToRgb(e.target.value))}
                            className="opacity-0 absolute w-8 h-6 cursor-pointer"
                        />
                        <span className="text-xs text-gray-500">Change</span>
                    </div>
                </div>

                {/* Opacity Slider */}
                <div className="space-y-1">
                    <div className="flex justify-between text-xs text-gray-400">
                        <span>Opacity</span>
                        <span>{selectedStructure.opacity}%</span>
                    </div>
                    <Slider 
                        value={[selectedStructure.opacity]} 
                        min={0} 
                        max={100} 
                        step={1}
                        onValueChange={(v) => setOpacity(selectedStructure.id, v[0])}
                        className="w-full"
                    />
                </div>
            </div>
        </div>
      )}
      
      {showOverlay && (
        <div className="absolute inset-0 grid place-items-center text-xs text-white/70 select-none pointer-events-none">
          <div>
            <div className="font-medium text-white">{plane.toUpperCase()} VIEW</div>
            <div>WW/WL: {ww}/{wl} | Crosshair: {crosshair ? 'On' : 'Off'}</div>
            <div>Use ↑/↓ to change slice</div>
          </div>
        </div>
      )}
      
      {/* Overlay Toggle */}
      {labelImage && (
        <div className="absolute top-2 right-2 z-10 pointer-events-auto">
            <button 
                onClick={(e) => { e.stopPropagation(); setShowLabel(!showLabel) }}
                className="bg-black/60 hover:bg-black/80 text-white px-2 py-1 rounded text-[10px] border border-white/20 transition-colors"
            >
                {showLabel ? 'Hide Masks' : 'Show Masks'}
            </button>
        </div>
      )}

      {fallbackActive && (
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full" />
      )}
      {/* Debug footer */}
      <div className="absolute left-2 bottom-2 text-[10px] text-white/70 pointer-events-none select-none">
        <span>fallback={String(fallbackActive)}</span>
        <span className="ml-2">img={Array.isArray((currentImage as any)?.size) ? (currentImage as any).size.join('x') : '—'}</span>
      </div>
    </div>
  )
}
