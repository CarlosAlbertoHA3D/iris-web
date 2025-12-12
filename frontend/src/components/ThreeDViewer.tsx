import { useEffect, useRef, useState, useMemo } from 'react'
import * as THREE from 'three'
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { X, Eye, EyeOff, Box, Scissors, Settings } from 'lucide-react'
import { useAppStore } from '../store/useAppStore'
import { Slider } from './ui/slider'
import { VIEWPORT_PRESETS } from '../constants/volumePresets'
import { createColormapTexture } from '../utils/volumeRenderHelper'

const volVertexShader = `
varying vec3 vOrigin;
varying vec3 vDirection;
void main() {
  vOrigin = vec3(inverse(modelMatrix) * vec4(cameraPosition, 1.0)).xyz;
  vDirection = position - vOrigin;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`

const volFragmentShader = `
precision highp float;
precision highp sampler3D;

uniform sampler3D u_data;
uniform sampler2D u_colormap;
uniform float u_threshold;
uniform float u_opacity;
uniform vec3 u_size;
uniform vec3 u_clipMin;
uniform vec3 u_clipMax;
uniform float u_ambient;
uniform float u_diffuse;
uniform float u_specular;
uniform float u_shininess;

varying vec3 vOrigin;
varying vec3 vDirection;

float rand(vec2 co) {
    return fract(sin(dot(co.xy ,vec2(12.9898,78.233))) * 43758.5453);
}

vec2 hitBox(vec3 orig, vec3 dir) {
    vec3 boxMin = u_clipMin;
    vec3 boxMax = u_clipMax;
    vec3 invDir = 1.0 / dir;
    vec3 tmin = (boxMin - orig) * invDir;
    vec3 tmax = (boxMax - orig) * invDir;
    vec3 t1 = min(tmin, tmax);
    vec3 t2 = max(tmin, tmax);
    float tNear = max(max(t1.x, t1.y), t1.z);
    float tFar = min(min(t2.x, t2.y), t2.z);
    return vec2(tNear, tFar);
}

void main() {
    vec3 rayDir = normalize(vDirection);
    vec2 bounds = hitBox(vOrigin, rayDir);
    
    if (bounds.x > bounds.y) discard;
    
    bounds.x = max(bounds.x, 0.0);
    
    // Dynamic step size based on volume resolution
    float maxDim = max(u_size.x, max(u_size.y, u_size.z));
    float stepSize = 1.0 / maxDim;
    // Supersample for better quality (0.5 voxel step)
    stepSize *= 0.5;
    
    // Ensure we traverse the diagonal (1.732) within max steps
    stepSize = max(stepSize, 0.0009);
    
    // Jitter start position to reduce aliasing/grain
    float noise = rand(gl_FragCoord.xy);
    float t = bounds.x + stepSize * noise;
    
    vec3 p = vOrigin + t * rayDir;
    vec3 stepVec = rayDir * stepSize;
    
    float accAlpha = 0.0;
    vec3 accColor = vec3(0.0);
    
    // Lighting
    vec3 lightDir = normalize(vec3(0.5, 1.0, 1.0));
    vec3 viewDir = -rayDir;
    
    for(int i = 0; i < 2000; i++) {
        if (t > bounds.y) break;
        if (accAlpha >= 0.99) break;
        
        // Clipping
        if (p.x < u_clipMin.x || p.x > u_clipMax.x || 
            p.y < u_clipMin.y || p.y > u_clipMax.y || 
            p.z < u_clipMin.z || p.z > u_clipMax.z) {
            p += stepVec;
            t += stepSize;
            continue;
        }

        vec3 tex = p + 0.5;
        float val = texture(u_data, tex).r;
        
        if (val > u_threshold) {
             // Sample transfer function
             vec4 tf = texture(u_colormap, vec2(val, 0.5));
             float density = tf.a;
             
             // Apply opacity multiplier and step size correction
             float alpha = 1.0 - exp(-density * u_opacity * 10.0 * stepSize);
             
             if (alpha > 0.01) {
                 // Compute gradient
                 float d = 1.0 / maxDim; 
                 if (d < 0.002) d = 0.002;

                 float vx = texture(u_data, tex + vec3(d, 0.0, 0.0)).r - texture(u_data, tex - vec3(d, 0.0, 0.0)).r;
                 float vy = texture(u_data, tex + vec3(0.0, d, 0.0)).r - texture(u_data, tex - vec3(0.0, d, 0.0)).r;
                 float vz = texture(u_data, tex + vec3(0.0, 0.0, d)).r - texture(u_data, tex - vec3(0.0, 0.0, d)).r;
                 
                 vec3 normal = normalize(vec3(vx, vy, vz));
                 if (length(normal) == 0.0) normal = -rayDir;
                 
                 // Phong Shading
                 float diff = max(dot(normal, lightDir), 0.0);
                 vec3 halfDir = normalize(lightDir + viewDir);
                 float spec = pow(max(dot(normal, halfDir), 0.0), u_shininess);
                 
                 vec3 col = tf.rgb;
                 // Add some ambient, diffuse and specular
                 vec3 shaded = col * (u_ambient + u_diffuse * diff) + vec3(u_specular) * spec;

                 accColor += (1.0 - accAlpha) * alpha * shaded;
                 accAlpha += (1.0 - accAlpha) * alpha;
             }
        }
        
        p += stepVec;
        t += stepSize;
    }
    
    gl_FragColor = vec4(accColor, accAlpha);
}
`

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

function getUrlPath(url: string) {
  try {
    const u = new URL(url)
    return u.origin + u.pathname
  } catch {
    return url.split('?')[0]
  }
}

// Global cache to persist across unmounts/remounts
const modelCache: Record<string, THREE.Group> = {}
const modelPromises: Record<string, Promise<THREE.Group>> = {}
// Track which models we've already fit the camera to (avoid resetting view on re-render)
const fittedModels: Set<string> = new Set()

export default function ThreeDViewer({ tall }: { tall?: boolean }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const rendererRef = useRef<any>(null)
  const sceneRef = useRef<any>(null)
  const cameraRef = useRef<any>(null)
  const controlsRef = useRef<OrbitControls | null>(null)
  const rootRef = useRef<any>(null)
  
  const artifacts = useAppStore((s) => s.artifacts)
  const currentImage = useAppStore((s) => s.currentImage)
  const structures = useAppStore((s) => s.structures)
  const setVisible = useAppStore((s) => s.setStructureVisible)
  const setOpacity = useAppStore((s) => s.setStructureOpacity)
  const setColor = useAppStore((s) => s.setStructureColor)

  const [isLoading, setIsLoading] = useState(false)
  const [showVolume, setShowVolume] = useState(false)
  const [volThreshold, setVolThreshold] = useState(0.00) // Default 0 to avoid cutting off presets
  const [volOpacity, setVolOpacity] = useState(5.0) // Boost opacity for "solid" look
  const [presetName, setPresetName] = useState('Natural')
  const [dataRange, setDataRange] = useState<[number, number] | null>(null)
  
  const [clipEnabled, setClipEnabled] = useState(false)
  const [clipX, setClipX] = useState(1) // 0 to 1 (normalized)
  const [clipY, setClipY] = useState(1)
  const [clipZ, setClipZ] = useState(1)
  const clipPlanes = useRef([
    new THREE.Plane(new THREE.Vector3(-1, 0, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, -1, 0), 0),
    new THREE.Plane(new THREE.Vector3(0, 0, -1), 0)
  ])
  const volumeMeshRef = useRef<THREE.Mesh | null>(null)
  const [selected, setSelected] = useState<{ id: string, name: string, x: number, y: number } | null>(null)
  const selectedMeshRef = useRef<THREE.Mesh | null>(null)
  // We use a global cache instead of local refs to handle unmount/remount and multiple requests
  const raycasterRef = useRef(new THREE.Raycaster())
  const mouseRef = useRef(new THREE.Vector2())

  // Memoize URL paths to avoid re-triggering effect on query param changes (presigned URLs)
  const stableObjUrl = useMemo(() => artifacts?.obj ? getUrlPath(artifacts.obj) : '', [artifacts?.obj])
  const stableMtlUrl = useMemo(() => artifacts?.mtl ? getUrlPath(artifacts.mtl) : '', [artifacts?.mtl])

  useEffect(() => {
    const canvas = canvasRef.current!
    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true })
    renderer.localClippingEnabled = true
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
    const hemiLight = new THREE.HemisphereLight(0xffffff, 0x444444, 1.5)
    hemiLight.position.set(0, 20, 0)
    scene.add(hemiLight)

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.5)
    dirLight.position.set(5, 10, 7.5)
    scene.add(dirLight)
    
    const backLight = new THREE.DirectionalLight(0xffffff, 0.5)
    backLight.position.set(-5, 5, -10)
    scene.add(backLight)
    
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5)
    fillLight.position.set(-5, 0, 5)
    scene.add(fillLight)

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

  // Volume Rendering: Load Data & Create Mesh
  useEffect(() => {
      const scene = sceneRef.current
      const renderer = rendererRef.current
      const camera = cameraRef.current
      
      if (!scene || !renderer || !camera) return
      
      if (showVolume && currentImage) {
          if (!volumeMeshRef.current) {
             console.log('[3d] Creating volume mesh...')
             const { data, size, spacing, origin } = currentImage
             
             // Calculate Min/Max for normalization
             let min = Infinity, max = -Infinity
             const len = data.length
             for(let i=0; i<len; i++) {
                 const v = data[i]
                 if(v < min) min = v
                 if(v > max) max = v
             }
             // Fallback
             if (!isFinite(min)) min = 0
             if (!isFinite(max)) max = 255
             
             setDataRange([min, max])
             
             const range = max - min || 1
             const fData = new Float32Array(len)
             for(let i=0; i<len; i++) {
                 fData[i] = (data[i] - min) / range
             }
             
             const texture = new THREE.Data3DTexture(fData, size[0], size[1], size[2])
             texture.format = THREE.RedFormat
             texture.type = THREE.FloatType
             texture.minFilter = THREE.LinearFilter
             texture.magFilter = THREE.LinearFilter
             texture.unpackAlignment = 1
             texture.needsUpdate = true
             
             const geometry = new THREE.BoxGeometry(1, 1, 1)
             
             // Create placeholder colormap (white)
             const colormap = new THREE.DataTexture(new Uint8Array([255, 255, 255, 255]), 1, 1, THREE.RGBAFormat)
             
             const material = new THREE.ShaderMaterial({
                 uniforms: {
                     u_data: { value: texture },
                     u_colormap: { value: colormap },
                     u_size: { value: new THREE.Vector3(size[0], size[1], size[2]) },
                     u_clipMin: { value: new THREE.Vector3(-0.5, -0.5, -0.5) },
                     u_clipMax: { value: new THREE.Vector3(0.5, 0.5, 0.5) },
                     u_threshold: { value: volThreshold }, 
                     u_opacity: { value: volOpacity },
                     u_ambient: { value: 0.2 },
                     u_diffuse: { value: 0.7 },
                     u_specular: { value: 0.3 },
                     u_shininess: { value: 64.0 }
                 },
                 vertexShader: volVertexShader,
                 fragmentShader: volFragmentShader,
                 side: THREE.FrontSide,
                 transparent: true,
                 depthTest: true,
                 depthWrite: false,
             })
             
             const mesh = new THREE.Mesh(geometry, material)
             const dimX = size[0] * spacing[0]
             const dimY = size[1] * spacing[1]
             const dimZ = size[2] * spacing[2]
             mesh.scale.set(dimX, dimY, dimZ)

             // Center volume at origin (0,0,0) to align with centered 3D model
             mesh.position.set(0, 0, 0)
             
             const group = new THREE.Group()
             group.rotation.x = -Math.PI / 2
             group.add(mesh)
             scene.add(group)
             
             volumeMeshRef.current = mesh
          }
          renderer.render(scene, camera)
      } else {
          if (volumeMeshRef.current) {
              const group = volumeMeshRef.current.parent
              if (group) scene.remove(group)
              
              const mesh = volumeMeshRef.current
              mesh.geometry.dispose()
              const mat = mesh.material as THREE.ShaderMaterial
              mat.uniforms.u_data.value.dispose()
              mat.uniforms.u_colormap.value.dispose()
              mat.dispose()
              volumeMeshRef.current = null
              renderer.render(scene, camera)
          }
      }
  }, [showVolume, currentImage])

  // Update Colormap & Lighting when Preset changes
  useEffect(() => {
      if (volumeMeshRef.current && dataRange) {
          const mat = volumeMeshRef.current.material as THREE.ShaderMaterial
          const preset = VIEWPORT_PRESETS.find(p => p.name === presetName)
          if (preset) {
              // Update Colormap
              const oldTex = mat.uniforms.u_colormap.value
              const newTex = createColormapTexture(preset, dataRange[0], dataRange[1])
              mat.uniforms.u_colormap.value = newTex
              if(oldTex) oldTex.dispose()
              
              // Update Lighting Uniforms
              mat.uniforms.u_ambient.value = parseFloat(preset.ambient || '0.2')
              mat.uniforms.u_diffuse.value = parseFloat(preset.diffuse || '0.7')
              mat.uniforms.u_specular.value = parseFloat(preset.specular || '0.3')
              mat.uniforms.u_shininess.value = parseFloat(preset.specularPower || '10.0')
          }
      }
  }, [presetName, dataRange, showVolume])

  // Update volume uniforms when sliders change
  useEffect(() => {
      if (volumeMeshRef.current) {
          const mat = volumeMeshRef.current.material as THREE.ShaderMaterial
          mat.uniforms.u_threshold.value = volThreshold
          mat.uniforms.u_opacity.value = volOpacity
          
          // Map World Space clipping to Local Space clipping
          // World X (Slider X) -> Local X
          // World Y (Slider Y) -> Local Z (inverted?)
          // World Z (Slider Z) -> Local Y
          
          // Default box is -0.5 to 0.5
          const min = new THREE.Vector3(-0.5, -0.5, -0.5)
          const max = new THREE.Vector3(0.5, 0.5, 0.5)
          
          if (clipEnabled) {
              // Slider X: 1 = Keep All, 0 = Keep None. Cuts from +X to -X.
              // Local X: range -0.5 to 0.5
              max.x = -0.5 + clipX
              
              // Slider Z: 1 = Keep All, 0 = Keep None. Cuts from +Z to -Z.
              // Local Y maps to World -Z. 
              // Mesh cuts +Z (Front). So we want to remove region where z is large.
              // z large means -y large means y small.
              // So we want to remove small y. Keep y > threshold.
              min.y = 0.5 - clipZ
              
              // Slider Y: 1 = Keep All, 0 = Keep None. Cuts from +Y to -Y.
              // Local Z maps to World Y (via rotation or coords swap?).
              // Mesh cuts +Y (Top). So we want to remove region where y is large.
              // y large means z large (if y=z).
              // So we want to remove large z. Keep z < threshold.
              max.z = -0.5 + clipY
          }
          
          mat.uniforms.u_clipMin.value.copy(min)
          mat.uniforms.u_clipMax.value.copy(max)
      }
  }, [volThreshold, volOpacity, clipEnabled, clipX, clipY, clipZ, showVolume, currentImage])

  // Helper: Update Clipping Plane Constants (Bounds + Sliders)
  const updateClippingPlanes = () => {
    if (!rendererRef.current) return

    let box = new THREE.Box3(
        new THREE.Vector3(-150, -150, -150), 
        new THREE.Vector3(150, 150, 150)
    )
    
    // Try to get bounds from volume or models
    if (volumeMeshRef.current) {
        box.setFromObject(volumeMeshRef.current)
    } else if (rootRef.current) {
        box.setFromObject(rootRef.current)
    }
    
    // Add some padding
    box.expandByScalar(10)
    
    const min = box.min
    const max = box.max
    
    // Planes:
    // 0: X Plane (-1,0,0). Keeps x < constant. 
    // 1: Y Plane (0,-1,0). Keeps y < constant.
    // 2: Z Plane (0,0,-1). Keeps z < constant.
    
    // If clipX is 1.0, we want constant = max.x (keep everything)
    // If clipX is 0.0, we want constant = min.x (keep nothing)
    
    const cX = min.x + (max.x - min.x) * clipX
    const cY = min.y + (max.y - min.y) * clipY
    const cZ = min.z + (max.z - min.z) * clipZ
    
    // Update plane constants
    // When disabled, set constant to Infinity to keep everything
    clipPlanes.current[0].constant = clipEnabled ? cX : Infinity
    clipPlanes.current[1].constant = clipEnabled ? cY : Infinity
    clipPlanes.current[2].constant = clipEnabled ? cZ : Infinity
  }

  // Helper: Apply clipping planes to materials
  const applyClippingToMaterials = () => {
      const root = rootRef.current
      if (!root) return
      root.traverse((child: any) => {
          if (child.isMesh && child.material) {
              child.material.clippingPlanes = clipEnabled ? clipPlanes.current : []
              child.material.needsUpdate = true
          }
      })
  }

  // Update Clipping Planes
  useEffect(() => {
      updateClippingPlanes()
  }, [clipX, clipY, clipZ, clipEnabled, showVolume, structures]) // Add dependencies to update when content changes

  // Apply clipping to structures
  useEffect(() => {
      applyClippingToMaterials()
  }, [clipEnabled, structures]) // Also when structures reload



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

    // Map by ID (e.g. "digestive__liver") and Name (e.g. "liver") to match OBJ group names
    // We also add lowercase versions to handle case-mismatches
    const map = new Map<string, any>()
    structures.forEach(s => {
        map.set(s.id, s)
        map.set(s.name, s)
        map.set(s.id.toLowerCase(), s)
        map.set(s.name.toLowerCase(), s)
    })
    
    let matchCount = 0
    root.traverse((child: any) => {
      if (!child.isMesh) return
      let label = child.name || child.parent?.name || ''
      
      // Try exact match first
      let st = map.get(label)
      
      // Try case-insensitive match
      if (!st) st = map.get(label.toLowerCase())
      
      if (!st) {
          // If structure not found in metadata, keep it visible
          child.visible = true
          return
      }

      matchCount++
      child.visible = st.visible
      const col = new THREE.Color(`rgb(${st.color[0]}, ${st.color[1]}, ${st.color[2]})`)
      if (child.material?.color) child.material.color.copy(col)
      if ('transparent' in child.material) child.material.transparent = st.opacity < 100
      if ('opacity' in child.material) child.material.opacity = Math.max(0.05, st.opacity / 100)
      child.material.needsUpdate = true
    })
    
    console.log(`[3d] syncStructures: ${structures.length} structures, ${matchCount} matched meshes updated.`)
    
    if (scene && camera && renderer) renderer.render(scene, camera)
  }

  // Load OBJ+MTL when artifacts are available
  useEffect(() => {
    const scene = sceneRef.current
    if (!scene) return
    
    if (!stableObjUrl || !stableMtlUrl || !artifacts?.obj || !artifacts?.mtl) return

    const objUrl = stableObjUrl
    
    // Clear previous model from scene
    if (rootRef.current) {
      scene.remove(rootRef.current)
      rootRef.current.traverse((child: any) => {
        if (child.isMesh) {
          child.geometry?.dispose?.()
        }
      })
      rootRef.current = null
    }

    let active = true

    const setupModel = (originalRoot: THREE.Group, isFirstLoad: boolean) => {
        if (!active) return
        // Clone the model so we can have independent instances
        const root = originalRoot.clone()
        
        // Deep clone materials to allow independent color/opacity
        root.traverse((child: any) => {
            if (child.isMesh) {
                // Re-ensure name inheritance if lost during clone (paranoid check)
                if (!child.name && child.parent?.name) child.name = child.parent.name
                
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material = child.material.map((m: any) => m.clone())
                    } else {
                        child.material = child.material.clone()
                    }
                }
            }
        })

        root.name = 'ModelRoot'
        scene.add(root)
        rootRef.current = root
        
        syncStructures()
        // Apply clipping immediately to the new model
        updateClippingPlanes()
        applyClippingToMaterials()
        
        // Only fit camera on first load of this model (not on re-renders)
        if (isFirstLoad && !fittedModels.has(objUrl)) {
            fitToObject(root)
            fittedModels.add(objUrl)
        }
        setIsLoading(false)
    }

    // 1. Check Cache
    if (modelCache[objUrl]) {
        setupModel(modelCache[objUrl], false)
        return
    }

    // 2. Check In-Progress
    if (Object.prototype.hasOwnProperty.call(modelPromises, objUrl)) {
        setIsLoading(true)
        modelPromises[objUrl]
            .then((group) => {
                if (active) setupModel(group, true)
            })
            .catch(err => {
                console.warn('[3d] Cached promise failed', err)
                if (active) setIsLoading(false)
            })
        return
    }

    // 3. Start New Load
    setIsLoading(true) 
    
    const promise = new Promise<THREE.Group>((resolve, reject) => {
        const mtlLoader = new MTLLoader()
        mtlLoader.crossOrigin = 'anonymous'
        mtlLoader.load(artifacts.mtl, (materials: any) => {
            materials.preload()
            const objLoader = new OBJLoader()
            objLoader.setMaterials(materials)
            objLoader.load(artifacts.obj, (obj: any) => {
                const root = new THREE.Group()
                
                // Fix Orientation: Rotate -90 deg on X to make patient stand up (Y-up)
                root.rotation.x = -Math.PI / 2
                
                // Center the model geometry at origin
                const box = new THREE.Box3().setFromObject(obj)
                const size = box.getSize(new THREE.Vector3())
                const center = box.getCenter(new THREE.Vector3())
                
                console.log('[3d] Raw Model Bounds:', { size, center })

                // Auto-scale if too large (e.g. > 2000 units)
                const maxDim = Math.max(size.x, size.y, size.z)
                if (maxDim > 2000) {
                    const scaleFactor = 1000 / maxDim
                    console.log(`[3d] Model too large (${maxDim}), scaling by ${scaleFactor}`)
                    obj.scale.set(scaleFactor, scaleFactor, scaleFactor)
                    obj.updateMatrix()
                    
                    // Recompute center after scaling (scaling happens around 0,0,0, so center moves)
                    // center * scaleFactor should be the new center if we only scaled
                    center.multiplyScalar(scaleFactor)
                }

                // Center the object by offsetting its position
                // We move the object so its center aligns with the parent's origin (0,0,0)
                obj.position.copy(center).negate()
                
                console.log('[3d] Adjusted Model Position:', obj.position)

                // Optimize and fix meshes
                obj.traverse((child: any) => {
                    if (child.isMesh) {
                        if (!child.name && child.parent?.name) child.name = child.parent.name
                        
                        // Ensure normals are present
                        child.geometry.computeVertexNormals()
                        
                        if (child.material) {
                            const oldMat = child.material
                            const newMat = new THREE.MeshStandardMaterial({
                                color: oldMat.color,
                                roughness: 0.8,
                                metalness: 0.0,
                                flatShading: false,
                                side: THREE.DoubleSide
                            })
                            child.material = newMat
                            if (oldMat.dispose) oldMat.dispose()
                        }
                    }
                })
                root.add(obj)
                
                // Save to cache
                modelCache[objUrl] = root
                resolve(root)
            }, undefined, (err) => reject(err))
        }, undefined, (err) => reject(err))
    })

    modelPromises[objUrl] = promise

    promise
        .then((group) => {
            if (active) {
                // Force refit on fresh load
                fittedModels.delete(objUrl)
                setupModel(group, true)
            }
        })
        .catch((err) => {
            console.warn('[3d] Load error:', err)
            if (active) setIsLoading(false)
            // Remove failed promise so we can retry
            delete modelPromises[objUrl]
        })

    return () => {
        active = false
    }
  }, [stableObjUrl, stableMtlUrl])  // Use stable URL paths to avoid re-trigger on presigned URL refresh

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
    const hit = intersects.find((i: any) => {
        const obj = i.object as THREE.Mesh
        if (!obj.isMesh || !obj.visible || obj === volumeMeshRef.current) return false
        
        // Check clipping manually since Raycaster ignores it for custom clipping logic
        // If clipEnabled is true, we check if point is "inside" the kept region
        if (clipEnabled && clipPlanes.current && clipPlanes.current.length > 0) {
            // Three.js clipping planes: normal points OUT of the volume to KEEP.
            // A point is kept if plane.distanceToPoint(p) > 0
            for(const plane of clipPlanes.current) {
                if (plane.constant === Infinity) continue;
                if (plane.distanceToPoint(i.point) < 0) {
                    return false // Point is clipped
                }
            }
        }
        return true
    })

    // Restore previous selection
    if (selectedMeshRef.current) {
        const prevMat = selectedMeshRef.current.material as THREE.MeshStandardMaterial
        if (prevMat.emissive) prevMat.emissive.setHex(0x000000)
        selectedMeshRef.current = null
    }

    if (hit) {
        const mesh = hit.object as THREE.Mesh
        const mat = mesh.material as THREE.MeshStandardMaterial
        
        // Find structure to get consistent ID
        const label = mesh.name || ''
        let struct = structures.find(s => s.id === label)
        if (!struct) struct = structures.find(s => s.name === label)
        if (!struct) struct = structures.find(s => s.id.toLowerCase() === label.toLowerCase())
        if (!struct) struct = structures.find(s => s.name.toLowerCase() === label.toLowerCase())
        
        const structId = struct ? struct.id : label

        // Highlight yellow
        if (mat.emissive) mat.emissive.setHex(0x333300)
        selectedMeshRef.current = mesh
        
        // Show tooltip
        let displayName = struct ? struct.name : label
        if (displayName.includes('__')) {
            displayName = displayName.split('__')[1]
        }
        displayName = displayName.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase())

        // Store full ID (structId) to look up in store
        setSelected({
            id: structId, 
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
        
        {/* Tools Controls */}
        {currentImage && (
            <div className="absolute top-4 right-4 z-30 flex flex-col items-end gap-2 max-h-[calc(100%-2rem)] overflow-y-auto overflow-x-hidden pr-1">
                <div className="flex gap-2 shrink-0">
                    <button
                        onClick={() => setShowVolume(!showVolume)}
                        className={`p-2 rounded-md transition-colors border border-white/10 shadow-lg ${
                            showVolume ? 'bg-blue-600 text-white' : 'bg-black/60 text-gray-300 hover:bg-black/80 hover:text-white'
                        }`}
                        title="Toggle Volume Rendering"
                    >
                        <Box className="w-5 h-5" />
                    </button>

                    <button
                        onClick={() => setClipEnabled(!clipEnabled)}
                        className={`p-2 rounded-md transition-colors border border-white/10 shadow-lg ${
                            clipEnabled ? 'bg-blue-600 text-white' : 'bg-black/60 text-gray-300 hover:bg-black/80 hover:text-white'
                        }`}
                        title="Toggle Clipping"
                    >
                        <Scissors className="w-5 h-5" />
                    </button>
                </div>
                
                {showVolume && (
                    <div className="p-3 bg-black/90 rounded-md border border-white/20 shadow-xl backdrop-blur-sm text-white w-48 space-y-3">
                        <div className="border-b border-white/10 pb-1 mb-2">
                             <span className="text-xs font-bold text-gray-300">Volume Settings</span>
                        </div>
                        
                        <div className="space-y-1">
                            <div className="text-xs text-gray-400 mb-1">Preset</div>
                            <select 
                                value={presetName}
                                onChange={(e) => setPresetName(e.target.value)}
                                className="w-full bg-black/50 border border-white/20 rounded px-2 py-1 text-xs text-white focus:outline-none focus:border-blue-500"
                            >
                                {VIEWPORT_PRESETS.map(p => (
                                    <option key={p.name} value={p.name}>{p.name}</option>
                                ))}
                            </select>
                        </div>

                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-gray-400">
                                <span>Threshold</span>
                                <span>{volThreshold.toFixed(2)}</span>
                            </div>
                            <Slider 
                                value={[volThreshold]} 
                                min={0} 
                                max={1} 
                                step={0.01}
                                onValueChange={(v) => setVolThreshold(v[0])}
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between text-xs text-gray-400">
                                <span>Opacity</span>
                                <span>{volOpacity.toFixed(1)}</span>
                            </div>
                            <Slider 
                                value={[volOpacity]} 
                                min={0} 
                                max={5} 
                                step={0.1}
                                onValueChange={(v) => setVolOpacity(v[0])}
                            />
                        </div>
                    </div>
                )}

                {clipEnabled && (
                    <div className="p-3 bg-black/90 rounded-md border border-white/20 shadow-xl backdrop-blur-sm text-white w-48 space-y-3">
                        <div className="border-b border-white/10 pb-1 mb-2">
                             <span className="text-xs font-bold text-gray-300">Clipping Planes</span>
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs text-gray-400">X Plane</span>
                            <Slider value={[clipX]} min={0} max={1} step={0.01} onValueChange={(v) => setClipX(v[0])} />
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs text-gray-400">Y Plane</span>
                            <Slider value={[clipY]} min={0} max={1} step={0.01} onValueChange={(v) => setClipY(v[0])} />
                        </div>
                        <div className="space-y-1">
                            <span className="text-xs text-gray-400">Z Plane</span>
                            <Slider value={[clipZ]} min={0} max={1} step={0.01} onValueChange={(v) => setClipZ(v[0])} />
                        </div>
                    </div>
                )}
            </div>
        )}
        
        {selected && canvasRef.current && (
            <div 
                className="absolute z-20 p-3 bg-black/90 rounded-md border border-white/20 shadow-xl backdrop-blur-sm text-white w-64 max-h-[60vh] overflow-y-auto overflow-x-hidden"
                style={(() => {
                    const rect = canvasRef.current!.getBoundingClientRect()
                    const x = selected.x - rect.left
                    const y = selected.y - rect.top
                    const isBottom = y > rect.height / 2
                    const isRight = x > rect.width / 2
                    
                    return { 
                        left: isRight ? 'auto' : Math.min(x + 15, rect.width - 270), 
                        right: isRight ? Math.min(rect.width - x + 15, rect.width - 270) : 'auto',
                        top: isBottom ? 'auto' : y + 10,
                        bottom: isBottom ? (rect.height - y + 10) : 'auto'
                    }
                })()}
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
                                if (selectedMeshRef.current) {
                                    (selectedMeshRef.current.material as any).emissive.setHex(0x000000)
                                    selectedMeshRef.current = null
                                }
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
