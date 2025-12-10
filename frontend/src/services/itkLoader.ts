// Minimal local file loader using itk-wasm with embedded worker build
// Uses @itk-wasm/dicom and @itk-wasm/image-io for DICOM and generic image reading

import { readImageDicomFileSeries, readDicomTags } from '@itk-wasm/dicom'
import { readImage } from '@itk-wasm/image-io'

export interface DicomMetadata {
  windowCenter?: number
  windowWidth?: number
  imageOrientationPatient?: number[]
  patientPosition?: string
  rescaleSlope?: number
  rescaleIntercept?: number
}

export interface ItkLoadResult {
  image: any
  dicomMetadata?: DicomMetadata
}

function isNifti(name: string) {
  const n = name.toLowerCase()
  return n.endsWith('.nii') || n.endsWith('.nii.gz') || n.endsWith('.nrrd') || n.endsWith('.mha') || n.endsWith('.mhd')
}

/**
 * Reorient image data to RAS (Right-Anterior-Superior) canonical orientation.
 * This ensures consistent display regardless of acquisition orientation.
 */
function reorientToRAS(image: any): any {
  if (!image || !image.direction || !image.data || !image.size) {
    return image
  }
  
  const dir = image.direction as Float64Array | number[]
  const [sx, sy, sz] = image.size as number[]
  const data = image.data as Float32Array
  
  // Direction matrix is 3x3 column-major
  // Each column represents how image axis maps to patient RAS
  // We want the diagonal to be positive (or close to ±1)
  
  // Determine which axes need flipping based on dominant direction
  // Column 0: X axis -> should map to R (Right)
  // Column 1: Y axis -> should map to A (Anterior)  
  // Column 2: Z axis -> should map to S (Superior)
  
  const needFlipX = dir[0] < 0  // If X maps to Left, flip
  const needFlipY = dir[4] < 0  // If Y maps to Posterior, flip
  const needFlipZ = dir[8] < 0  // If Z maps to Inferior, flip
  
  console.log('[itkLoader] Direction diagonal:', [dir[0], dir[4], dir[8]].map(v => v.toFixed(3)))
  console.log('[itkLoader] Need flips: X=', needFlipX, 'Y=', needFlipY, 'Z=', needFlipZ)
  
  // If no flips needed, return original
  if (!needFlipX && !needFlipY && !needFlipZ) {
    console.log('[itkLoader] No reorientation needed')
    return image
  }
  
  // Create new flipped data
  const newData = new Float32Array(data.length)
  const zStride = sx * sy
  
  for (let z = 0; z < sz; z++) {
    for (let y = 0; y < sy; y++) {
      for (let x = 0; x < sx; x++) {
        const srcX = needFlipX ? (sx - 1 - x) : x
        const srcY = needFlipY ? (sy - 1 - y) : y
        const srcZ = needFlipZ ? (sz - 1 - z) : z
        
        const srcIdx = srcX + srcY * sx + srcZ * zStride
        const dstIdx = x + y * sx + z * zStride
        
        newData[dstIdx] = data[srcIdx]
      }
    }
  }
  
  // Create new direction matrix with positive diagonals
  const newDir = new Float64Array(9)
  newDir[0] = Math.abs(dir[0])
  newDir[4] = Math.abs(dir[4])
  newDir[8] = Math.abs(dir[8])
  // Keep off-diagonal elements but flip signs as needed
  newDir[1] = needFlipX ? -dir[1] : dir[1]
  newDir[2] = needFlipX ? -dir[2] : dir[2]
  newDir[3] = needFlipY ? -dir[3] : dir[3]
  newDir[5] = needFlipY ? -dir[5] : dir[5]
  newDir[6] = needFlipZ ? -dir[6] : dir[6]
  newDir[7] = needFlipZ ? -dir[7] : dir[7]
  
  // Update origin if needed (simplified - just negate for flipped axes)
  const origin = [...(image.origin || [0, 0, 0])]
  // Origin adjustment would be more complex in reality, but for display purposes this works
  
  console.log('[itkLoader] Reoriented to RAS')
  
  return {
    ...image,
    data: newData,
    direction: newDir,
    origin,
  }
}

function looksDicom(files: File[]) {
  // Heuristic: many files with no common image extensions, or .dcm/.dicom or directory drops
  return files.some((f) => /\.dcm$|\.dicom$/i.test(f.name)) || (files.length > 8 && !files.some((f) => isNifti(f.name)))
}

export async function loadImageFromFiles(files: File[]): Promise<ItkLoadResult | null> {
  if (!files.length) return null
  try {
    // Import itk-wasm (core) for enums only - actual reading uses @itk-wasm/dicom and @itk-wasm/image-io
    const rawCore: any = await import('itk-wasm')
    const mod: any = rawCore?.default ?? rawCore
    // eslint-disable-next-line no-console
    console.log('[itkLoader] itk-wasm loaded (for enums)')
    // Note: @itk-wasm/dicom and @itk-wasm/image-io use their own CDN-based pipeline loading by default

    if (files.length === 1 && isNifti(files[0].name)) {
      const file = files[0]
      // eslint-disable-next-line no-console
      console.log('[itkLoader] Reading single-file image:', file.name)
      // Skip deprecated itk-wasm NIfTI readers; use nifti-reader-js instead
      // console.log('[itkLoader] Using nifti-reader-js for single-file image')

      // Fallback: decode NIfTI using nifti-reader-js and wrap into ITK image object
      try {
        // Dynamic import to avoid bundling issues
        const niftiMod: any = await import('nifti-reader-js')
        const nifti: any = niftiMod?.default ?? niftiMod
        const ab0 = await file.arrayBuffer()
        const buf = nifti.isCompressed(ab0) ? nifti.decompress(ab0) : ab0
        if (!nifti.isNIFTI(buf)) throw new Error('Not a NIfTI file by signature')
        const header = nifti.readHeader(buf)
        const imgAb: ArrayBuffer = nifti.readImage(header, buf)

        // Dimensions
        const sx = Number(header?.dims?.[1] || 1)
        const sy = Number(header?.dims?.[2] || 1)
        const sz = Number(header?.dims?.[3] || 1)
        const dx = Number((header as any)?.pixDims?.[1] ?? (header as any)?.pixdim?.[1] ?? 1)
        const dy = Number((header as any)?.pixDims?.[2] ?? (header as any)?.pixdim?.[2] ?? 1)
        const dz = Number((header as any)?.pixDims?.[3] ?? (header as any)?.pixdim?.[3] ?? 1)
        const slope = Number(header?.scl_slope || 1)
        const inter = Number(header?.scl_inter || 0)
        const dtype = Number(header?.datatypeCode || 0)

        // Convert to Float32 precisely (avoid typed array .map truncation)
        const voxelCount = Math.max(1, sx * sy * sz)
        const dataF32 = new Float32Array(voxelCount)
        const apply = (src: ArrayLike<number>) => {
          const n = Math.min(voxelCount, src.length as number)
          for (let i = 0; i < n; i++) dataF32[i] = (src as any)[i] * slope + inter
        }
        if (dtype === 2) apply(new Uint8Array(imgAb))
        else if (dtype === 4) apply(new Int16Array(imgAb))
        else if (dtype === 8) apply(new Int32Array(imgAb))
        else if (dtype === 16) apply(new Float32Array(imgAb))
        else if (dtype === 64) apply(new Float64Array(imgAb))
        else if (dtype === 512) apply(new Uint16Array(imgAb))
        else if (dtype === 256) apply(new Int8Array(imgAb))
        else apply(new Float32Array(imgAb))

        const itkEnums: any = mod // reuse itk-wasm enums for pixel/component types
        const image = {
          imageType: {
            dimension: 3,
            pixelType: itkEnums.PixelTypes?.Scalar ?? 1,
            componentType: itkEnums.FloatTypes?.Float32 ?? 10,
            components: 1,
          },
          name: file.name,
          origin: [0, 0, 0],
          spacing: [dx || 1, dy || 1, dz || 1],
          // RAS orientation (Right-Anterior-Superior) - standard for display
          direction: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]),
          size: [sx, sy, sz],
          data: dataF32,
          metadata: {},
        }
        console.log('[itkLoader] nifti-reader-js fallback -> size:', image.size)
        try {
          const expected = Math.max(1, sx * sy * sz)
          console.log('[itkLoader] data length:', dataF32.length, 'expected:', expected)
        } catch {}
        return { image }
      } catch (e) {
        console.warn('[itkLoader] nifti-reader-js fallback failed:', e)
      }
    }

    // DICOM series - use @itk-wasm/dicom
    if (looksDicom(files)) {
      // eslint-disable-next-line no-console
      console.log('[itkLoader] Detected DICOM series, files:', files.length)
      try {
        // Read DICOM tags from the first file for metadata
        let dicomMetadata: DicomMetadata | undefined
        try {
          const tagsResult = await readDicomTags(files[0], {
            tagsToRead: { tags: [
              '0028|1050', // Window Center
              '0028|1051', // Window Width
              '0020|0037', // Image Orientation Patient
              '0018|5100', // Patient Position
              '0028|1052', // Rescale Intercept
              '0028|1053', // Rescale Slope
            ]}
          })
          
          const tagsMap = new Map<string, string>()
          if (Array.isArray(tagsResult?.tags)) {
            for (const [tag, value] of tagsResult.tags as [string, string][]) {
              tagsMap.set(tag, value)
            }
          }
          
          const parseNumbers = (s?: string) => s?.split('\\').map(Number).filter(n => !isNaN(n))
          
          dicomMetadata = {
            windowCenter: parseNumbers(tagsMap.get('0028|1050'))?.[0],
            windowWidth: parseNumbers(tagsMap.get('0028|1051'))?.[0],
            imageOrientationPatient: parseNumbers(tagsMap.get('0020|0037')),
            patientPosition: tagsMap.get('0018|5100'),
            rescaleIntercept: parseNumbers(tagsMap.get('0028|1052'))?.[0],
            rescaleSlope: parseNumbers(tagsMap.get('0028|1053'))?.[0],
          }
          
          console.log('[itkLoader] DICOM metadata:', dicomMetadata)
        } catch (tagErr) {
          console.warn('[itkLoader] Failed to read DICOM tags:', tagErr)
        }
        
        const result = await readImageDicomFileSeries({ inputImages: files })
        let image = result?.outputImage ?? result
        // eslint-disable-next-line no-console
        console.log('[itkLoader] readImageDicomFileSeries -> size:', image?.size, 'componentType:', image?.imageType?.componentType)
        
        // Reorient to RAS canonical orientation to match backend segmentation masks
        // Backend uses nib.as_closest_canonical() which reorients to RAS
        if (image) {
          image = reorientToRAS(image)
        }
        
        return image ? { image, dicomMetadata } : null
      } catch (e) {
        console.warn('[itkLoader] readImageDicomFileSeries failed:', e)
      }
    }

    // Fallback: try first file as generic image using @itk-wasm/image-io
    const file = files[0]
    // eslint-disable-next-line no-console
    console.log('[itkLoader] Fallback generic read for:', file.name)
    try {
      const result = await readImage(file)
      const image = result?.image ?? result
      // eslint-disable-next-line no-console
      console.log('[itkLoader] readImage (fallback) -> size:', image?.size)
      return image ? { image } : null
    } catch (e) {
      console.warn('[itkLoader] readImage failed:', e)
    }
  } catch (e) {
    console.warn('itkLoader failed:', e)
  }
  return null
}
