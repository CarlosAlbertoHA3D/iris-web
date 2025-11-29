import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { X, Eye, EyeOff } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
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

export default function ThreeDViewer({ tall }: { tall?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<any>(null)
  const sceneRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const rootRef = useRef<any>(null)
  
  const artifacts = useAppStore((s) => s.artifacts)
  const structures = useAppStore((s) => s.structures)
  const setVisible = useAppStore((s) => s.setStructureVisible)
  const setOpacity = useAppStore((s) => s.setStructureOpacity)
  const setColor = useAppStore((s) => s.setStructureColor)

  const [isLoading, setIsLoading] = useState(false)
  const [selected, setSelected] = useState<{ id: string, name: string, x: number, y: number } | null>(null)
  const selectedMeshRef = useRef<THREE.Mesh | null>(null)
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2())

  useEffect(() => {
    const canvas = canvasRef.current!
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2))
    renderer.setSize(canvas.clientWidth, canvas.clientHeight, false)
    rendererRef.current = renderer

    const scene = new THREE.Scene()
    scene.background = new THREE.Color('#0b0f19')
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 1000)
    camera.position.set(2.5, 2.5, 2.5)
    sceneRef.current = scene
    cameraRef.current = camera

    const controls = new OrbitControls(camera, renderer.domElement)
    ;(controls as any).enableDamping = true
    controlsRef.current = controls

    // Better Lighting Setup
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x222222, 1.0)
    hemiLight.position.set(0, 20, 0)
    scene.add(hemiLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 0.8)
    dirLight.position.set(5, 10, 7.5)
    scene.add(dirLight)
    
    const backLight = new THREE.DirectionalLight(0xffffff, 0.3)
    backLight.position.set(-5, 5, -10)
    scene.add(backLight)

    // scene.add(new THREE.AmbientLight(0xffffff, 0.3)) // Removed in favor of Hemisphere

    const axes = new THREE.AxesHelper(1)
    const grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222)
    scene.add(axes)
    scene.add(grid)

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      const width = rect.width
      const height = rect.height
      
      if (width === 0 || height === 0) return
      
      const needResize = canvas.width !== width || canvas.height !== height
      if (needResize) {
        renderer.setSize(width, height, false)
        camera.aspect = width / height
        camera.updateProjectionMatrix()
        renderer.render(scene, camera)
      }
    }
    resize()

    const onResize = () => {
      resize()
    }
    window.addEventListener('resize', onResize)
    
    // Add ResizeObserver to handle container size changes (e.g. toggling fullscreen)
    const resizeObserver = new ResizeObserver(() => {
      requestAnimationFrame(resize)
    })
    if (canvas) {
      resizeObserver.observe(canvas)
    }

    let raf = 0
    const animate = () => {
      controls.update()
      renderer.render(scene, camera)
      raf = requestAnimationFrame(animate)
    }
    raf = requestAnimationFrame(animate)

    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() === 'r') {
        camera.position.set(2.5, 2.5, 2.5)
        controls.target.set(0, 0, 0)
        controls.update()
      }
    }
    window.addEventListener('keydown', onKey)

    return () => {
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKey)
      resizeObserver.disconnect()
      cancelAnimationFrame(raf)
      controls.dispose()
      renderer.dispose()
    }
  }, [])

  // Handle CSS transition resize (force update after transition ends)
  useEffect(() => {
    const timers: number[] = []
    // Trigger resizes during and after the 300ms transition
    ;[50, 150, 300, 350].forEach(t => {
        timers.push(window.setTimeout(() => {
            const canvas = canvasRef.current
            if (!canvas) return
            const rect = canvas.getBoundingClientRect()
            const width = rect.width
            const height = rect.height
            if (width && height && rendererRef.current && cameraRef.current) {
                rendererRef.current.setSize(width, height, false)
                cameraRef.current.aspect = width / height
                cameraRef.current.updateProjectionMatrix()
                rendererRef.current.render(sceneRef.current, cameraRef.current)
            }
        }, t))
    })
    return () => timers.forEach(t => clearTimeout(t))
  }, [tall])

  // Helper: fit camera to object
  const fitToObject = (object: any) => {
    const scene = sceneRef.current
    const camera = cameraRef.current
    const controls = controlsRef.current
    const renderer = rendererRef.current as any
    if (!scene || !camera || !controls || !renderer) return
    const box = new THREE.Box3().setFromObject(object)
    const size = box.getSize(new THREE.Vector3())
    const center = box.getCenter(new THREE.Vector3())
    const maxSize = Math.max(size.x, size.y, size.z)
    const fitOffset = 1.5
    const fov = THREE.MathUtils.degToRad(camera.fov)
    const dist = (maxSize / 2) / Math.tan(fov / 2)
    const newPos = center.clone().add(new THREE.Vector3(1, 1, 1).normalize().multiplyScalar(dist * fitOffset))
    camera.position.set(newPos.x, newPos.y, newPos.z)
    camera.near = Math.max(0.01, dist / 100)
    camera.far = dist * 100
    camera.updateProjectionMatrix()
    controls.target.set(center.x, center.y, center.z)
    controls.update()
    renderer.render(scene, camera)
  }

  // Helper: Sync visibility/color/opacity with structures
  const syncStructures = () => {
    const root = rootRef.current
    if (!root) return

    const scene = sceneRef.current
    const camera = cameraRef.current
    const renderer = rendererRef.current

    // If no structures data yet, ensure everything is visible by default
    if (structures.length === 0) {
        root.traverse((child: any) => {
            if (child.isMesh) child.visible = true
        })
        if (scene && camera && renderer) renderer.render(scene, camera)
        return
    }

    // Map by ID (e.g. "digestive__liver") which matches the OBJ group names
    const map = new Map(structures.map((s) => [s.id, s]))
    
    root.traverse((child: any) => {
      if (!child.isMesh) return
      const label = child.name || child.parent?.name || ''
      const st = map.get(label)
      
      if (!st) {
          // If structure not found in metadata, keep it visible
          child.visible = true
          return
      }

      child.visible = st.visible
      const col = new THREE.Color(`rgb(${st.color[0]}, ${st.color[1]}, ${st.color[2]})`)
      if (child.material?.color) child.material.color.copy(col)
      if ('transparent' in child.material) child.material.transparent = st.opacity < 100
      if ('opacity' in child.material) child.material.opacity = Math.max(0.05, st.opacity / 100)
      child.material.needsUpdate = true
    })
    
    if (scene && camera && renderer) renderer.render(scene, camera)
  }

  // Load OBJ+MTL when artifacts are available
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    // Clear previous
    if (rootRef.current) {
      scene.remove(rootRef.current)
      rootRef.current.traverse((child: any) => {
        if (child.isMesh) {
          child.geometry?.dispose?.()
          const m = child.material
          if (Array.isArray(m)) m.forEach((mi) => mi.dispose && mi.dispose())
          else m?.dispose?.()
        }
      })
      rootRef.current = null
    }
    if (!artifacts?.obj || !artifacts?.mtl) return

    setIsLoading(true) // Start loading

    const mtlLoader = new MTLLoader()
    mtlLoader.crossOrigin = 'anonymous'
    mtlLoader.load(artifacts.mtl, (materials: any) => {
      materials.preload()
      const objLoader = new OBJLoader()
      objLoader.setMaterials(materials)
      objLoader.load(artifacts.obj, (obj: any) => {
        const root = new THREE.Group()
        root.name = 'ModelRoot'
        
        // Fix Orientation: Rotate -90 deg on X to make patient stand up (Y-up)
        root.rotation.x = -Math.PI / 2
        
        // Ensure meshes inherit label names for structure mapping
        obj.traverse((child: any) => {
          if (child.isMesh) {
             if (!child.name && child.parent?.name) child.name = child.parent.name
             
             // Fix "Sawtooth" look: Compute normals for smooth shading
             child.geometry.computeVertexNormals()
             
             if (child.material) {
                child.material.flatShading = false
                child.material.side = THREE.DoubleSide
                child.material.needsUpdate = true
             }
          }
        })
        root.add(obj)
        scene.add(root)
        rootRef.current = root
        
        // Sync structures immediately after load
        syncStructures()
        
        fitToObject(root)
        setIsLoading(false) // Finish loading
      }, undefined, (err: any) => { 
          try { console.warn('[3d] OBJ load error:', err) } catch {} 
          setIsLoading(false)
      })
    }, undefined, (err: any) => { 
        try { console.warn('[3d] MTL load error:', err) } catch {} 
        setIsLoading(false)
    })
  }, [artifacts?.obj, artifacts?.mtl])

  // Sync when structures change
  useEffect(() => {
    syncStructures()
  }, [structures])

  const handleCanvasClick = (event: React.MouseEvent) => {
    const canvas = canvasRef.current
    const camera = cameraRef.current
    const scene = sceneRef.current
    if (!canvas || !camera || !scene) return

    // Calculate mouse position
    const rect = canvas.getBoundingClientRect()
    mouseRef.current.x = ((event.clientX - rect.left) / rect.width) * 2 - 1
    mouseRef.current.y = -((event.clientY - rect.top) / rect.height) * 2 + 1

    raycasterRef.current.setFromCamera(mouseRef.current, camera)
    const intersects = raycasterRef.current.intersectObjects(scene.children, true)

    // Find first visible mesh
    const hit = intersects.find((i) => (i.object as THREE.Mesh).isMesh && i.object.visible)

    // Restore previous selection
    if (selectedMeshRef.current) {
        const prevMat = selectedMeshRef.current.material as THREE.MeshStandardMaterial
        if (prevMat.emissive) prevMat.emissive.setHex(0x000000)
        selectedMeshRef.current = null
    }

    if (hit) {
        const mesh = hit.object as THREE.Mesh
        const mat = mesh.material as THREE.MeshStandardMaterial
        
        // Highlight yellow
        if (mat.emissive) mat.emissive.setHex(0x333300)
        selectedMeshRef.current = mesh
        
        // Show tooltip
        let displayName = mesh.name
        if (displayName.includes('__')) {
            displayName = displayName.split('__')[1]
        }
        displayName = displayName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())

        // Store full ID (mesh.name) to look up in store
        setSelected({
            id: mesh.name, 
            name: displayName,
            x: event.clientX, 
            y: event.clientY
        })
        
        rendererRef.current?.render(scene, camera)
    } else {
        setSelected(null)
        rendererRef.current?.render(scene, camera)
    }
  }

  const selectedStructure = selected ? structures.find(s => s.id === selected.id) : null

  return (
    <div className="relative w-full h-full">
        {isLoading && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10 rounded-md">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
            </div>
        )}
        
        {selected && canvasRef.current && (
            <div 
                className="absolute z-20 p-3 bg-black/90 rounded-md border border-white/20 shadow-xl backdrop-blur-sm text-white w-64"
                style={{ 
                    left: selected.x - canvasRef.current.getBoundingClientRect().left + 15, 
                    top: selected.y - canvasRef.current.getBoundingClientRect().top - 10 
                }}
                onClick={(e) => e.stopPropagation()}
            >
                <div className="flex justify-between items-center mb-3 border-b border-white/10 pb-2">
                    <span className="font-bold text-sm">{selected.name}</span>
                    <button 
                        onClick={() => {
                            if (selectedMeshRef.current) {
                                (selectedMeshRef.current.material as any).emissive.setHex(0x000000)
                                selectedMeshRef.current = null
                            }
                            setSelected(null)
                            rendererRef.current?.render(sceneRef.current, cameraRef.current)
                        }}
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
                                setVisible(selected.id, false)
                                setSelected(null) // Close tooltip since it will vanish
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
                                style={{ backgroundColor: selectedStructure ? rgbToHex(selectedStructure.color) : '#fff' }}
                            />
                            <input 
                                type="color" 
                                value={selectedStructure ? rgbToHex(selectedStructure.color) : '#ffffff'}
                                onChange={(e) => setColor(selected.id, hexToRgb(e.target.value))}
                                className="opacity-0 absolute w-8 h-6 cursor-pointer"
                            />
                            <span className="text-xs text-gray-500">Change</span>
                        </div>
                    </div>

                    {/* Opacity Slider */}
                    <div className="space-y-1">
                        <div className="flex justify-between text-xs text-gray-400">
                            <span>Opacity</span>
                            <span>{selectedStructure?.opacity ?? 100}%</span>
                        </div>
                        <Slider 
                            value={[selectedStructure?.opacity ?? 100]} 
                            min={0} 
                            max={100} 
                            step={1}
                            onValueChange={(v) => setOpacity(selected.id, v[0])}
                            className="w-full"
                        />
                    </div>
                </div>
            </div>
        )}

        <canvas 
            ref={canvasRef} 
            onClick={handleCanvasClick}
            className={`w-full ${tall ? 'h-[70vh]' : 'h-[320px]'} rounded-md border bg-black/50 cursor-crosshair`} 
        />
    </div>
  )
}
