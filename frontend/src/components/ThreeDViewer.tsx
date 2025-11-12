import { useEffect, useRef } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { useAppStore } from '../store/useAppStore'

export default function ThreeDViewer({ tall }: { tall?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<any>(null)
  const sceneRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const rootRef = useRef<any>(null)
  const artifacts = useAppStore((s) => s.artifacts)
  const structures = useAppStore((s) => s.structures)

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

    const light = new THREE.DirectionalLight(0xffffff, 1)
    light.position.set(5, 10, 7.5)
    scene.add(light)
    scene.add(new THREE.AmbientLight(0xffffff, 0.3))

    const axes = new THREE.AxesHelper(1)
    const grid = new THREE.GridHelper(10, 10, 0x444444, 0x222222)
    scene.add(axes)
    scene.add(grid)

    const resize = () => {
      const width = canvas.clientWidth
      const height = canvas.clientHeight
      if (width === 0 || height === 0) return
      renderer.setSize(width, height, false)
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    }
    resize()

    const onResize = () => {
      resize()
    }
    window.addEventListener('resize', onResize)

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
      cancelAnimationFrame(raf)
      controls.dispose()
      renderer.dispose()
    }
  }, [])

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

    const mtlLoader = new MTLLoader()
    mtlLoader.crossOrigin = 'anonymous'
    mtlLoader.load(artifacts.mtl, (materials: any) => {
      materials.preload()
      const objLoader = new OBJLoader()
      objLoader.setMaterials(materials)
      objLoader.load(artifacts.obj, (obj: any) => {
        const root = new THREE.Group()
        root.name = 'ModelRoot'
        // Ensure meshes inherit label names for structure mapping
        obj.traverse((child: any) => {
          if (child.isMesh && !child.name && child.parent?.name) child.name = child.parent.name
          if (child.material) {
            child.material.side = THREE.DoubleSide
            child.material.needsUpdate = true
          }
        })
        root.add(obj)
        scene.add(root)
        rootRef.current = root
        fitToObject(root)
      }, undefined, (err: any) => { try { console.warn('[3d] OBJ load error:', err) } catch {} })
    }, undefined, (err: any) => { try { console.warn('[3d] MTL load error:', err) } catch {} })
  }, [artifacts?.obj, artifacts?.mtl])

  // Sync visibility/color/opacity with structures
  useEffect(() => {
    const root = rootRef.current
    if (!root) return
    const map = new Map(structures.map((s) => [`${s.system}__${s.name}`, s]))
    root.traverse((child: any) => {
      if (!child.isMesh) return
      const label = child.name || child.parent?.name || ''
      const st = map.get(label)
      if (!st) return
      child.visible = st.visible
      const col = new THREE.Color(`rgb(${st.color[0]}, ${st.color[1]}, ${st.color[2]})`)
      if (child.material?.color) child.material.color.copy(col)
      if ('transparent' in child.material) child.material.transparent = st.opacity < 100
      if ('opacity' in child.material) child.material.opacity = Math.max(0.05, st.opacity / 100)
      child.material.needsUpdate = true
    })
    const scene = sceneRef.current
    const camera = cameraRef.current
    const renderer = rendererRef.current
    if (scene && camera && renderer) renderer.render(scene, camera)
  }, [structures])

  return <canvas ref={canvasRef} className={`w-full ${tall ? 'h-[70vh]' : 'h-[320px]'} rounded-md border bg-black/50`} />
}
