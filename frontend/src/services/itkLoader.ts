// Minimal local file loader using itk-wasm with embedded worker build
// Tries multiple API variants for compatibility across itk-wasm builds

export interface ItkLoadResult {
  image: any
}

function isNifti(name: string) {
  const n = name.toLowerCase()
  return n.endsWith('.nii') || n.endsWith('.nii.gz') || n.endsWith('.nrrd') || n.endsWith('.mha') || n.endsWith('.mhd')
}

function looksDicom(files: File[]) {
  // Heuristic: many files with no common image extensions, or .dcm/.dicom or directory drops
  return files.some((f) => /\.dcm$|\.dicom$/i.test(f.name)) || (files.length > 8 && !files.some((f) => isNifti(f.name)))
}

export async function loadImageFromFiles(files: File[]): Promise<ItkLoadResult | null> {
  if (!files.length) return null
  try {
    // Import itk-wasm (core)
    const rawCore: any = await import('itk-wasm')
    const mod: any = rawCore?.default ?? rawCore
    // eslint-disable-next-line no-console
    console.log('[itkLoader] itk-wasm loaded:', Object.keys(mod))
    // Configure base URLs for IO/pipelines if API is available
    try {
      const base = (import.meta as any).env?.BASE_URL || '/'
      const opts = {
        pipelinesUrl: `${base}itk/pipeline`,
        imageIOUrl: `${base}itk/image-io`,
        meshIOUrl: `${base}itk/mesh-io`,
        pipelineWorkerUrl: `${base}itk/web-workers/pipeline.worker.js`,
      }
      if (typeof mod.setBaseOptions === 'function') {
        mod.setBaseOptions(opts)
      } else {
        if (typeof mod.setPipelinesBaseUrl === 'function') mod.setPipelinesBaseUrl(opts.pipelinesUrl)
        if (typeof mod.setImageIOBaseUrl === 'function') mod.setImageIOBaseUrl(opts.imageIOUrl)
        if (typeof mod.setMeshIOBaseUrl === 'function') mod.setMeshIOBaseUrl(opts.meshIOUrl)
        if (typeof mod.setPipelineWorkerUrl === 'function') mod.setPipelineWorkerUrl(opts.pipelineWorkerUrl)
      }
      // eslint-disable-next-line no-console
      console.log('[itkLoader] Configured base URLs:', opts)
    } catch {}

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
          // Default orientation: flip Z so superior appears at top in coronal/sagittal
          direction: new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, -1]),
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

    // DICOM series
    if (looksDicom(files)) {
      // eslint-disable-next-line no-console
      console.log('[itkLoader] Detected DICOM series, files:', files.length)
      if (typeof mod.readImageDICOMFileSeries === 'function') {
        try {
          const result = await mod.readImageDICOMFileSeries(files)
          const image = result?.image ?? result?.outputImage ?? result
          // eslint-disable-next-line no-console
          console.log('[itkLoader] readImageDICOMFileSeries -> size:', image?.size, 'componentType:', image?.imageType?.componentType)
          return image ? { image } : null
        } catch (e) {
          console.warn('[itkLoader] readImageDICOMFileSeries failed:', e)
        }
      }
      if (typeof mod.readImageFileSeries === 'function') {
        try {
          const result = await mod.readImageFileSeries(files)
          const image = result?.image ?? result?.outputImage ?? result
          // eslint-disable-next-line no-console
          console.log('[itkLoader] readImageFileSeries (generic) -> size:', image?.size, 'componentType:', image?.imageType?.componentType)
          return image ? { image } : null
        } catch (e) {
          console.warn('[itkLoader] readImageFileSeries failed:', e)
        }
      }
    }

    // Fallback: try first file as generic image
    const file = files[0]
    // eslint-disable-next-line no-console
    console.log('[itkLoader] Fallback generic read for:', file.name)
    if (typeof mod.readImageFile === 'function') {
      const result = await mod.readImageFile(file)
      const image = result?.image ?? result?.outputImage ?? result
      // eslint-disable-next-line no-console
      console.log('[itkLoader] readImageFile (fallback) -> size:', image?.size)
      return image ? { image } : null
    }
    if (typeof mod.readImageArrayBuffer === 'function') {
      const ab = await file.arrayBuffer()
      const result = await mod.readImageArrayBuffer(ab, file.name)
      const image = result?.image ?? result?.outputImage ?? result
      // eslint-disable-next-line no-console
      console.log('[itkLoader] readImageArrayBuffer (fallback) -> size:', image?.size)
      return image ? { image } : null
    }
  } catch (e) {
    console.warn('itkLoader failed:', e)
  }
  return null
}
