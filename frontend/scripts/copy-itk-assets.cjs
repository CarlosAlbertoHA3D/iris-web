// Copy itk-wasm web worker and pipeline assets into /public/itk/
// so they can be served by Vite in dev and prod.

/* eslint-disable no-console */
const fs = require('fs')
const path = require('path')

const root = process.cwd()
const srcWorkers = path.join(root, 'node_modules', 'itk-wasm', 'dist', 'web-workers')
const srcPipelines = path.join(root, 'node_modules', 'itk-wasm', 'dist', 'pipeline')
const srcImageIO = path.join(root, 'node_modules', 'itk-wasm', 'dist', 'image-io')
const srcMeshIO = path.join(root, 'node_modules', 'itk-wasm', 'dist', 'mesh-io')
const srcEmbedded = path.join(root, 'node_modules', 'itk-wasm', 'dist', 'index-worker-embedded.min.js')
const srcEmbeddedMap = path.join(root, 'node_modules', 'itk-wasm', 'dist', 'index-worker-embedded.min.js.map')
const dest = path.join(root, 'public', 'itk')

function copyDir(src, dst) {
  if (!fs.existsSync(src)) return
  if (!fs.existsSync(dst)) fs.mkdirSync(dst, { recursive: true })
  const entries = fs.readdirSync(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const dstPath = path.join(dst, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, dstPath)
    } else {
      fs.copyFileSync(srcPath, dstPath)
    }
  }
}

try {
  copyDir(srcWorkers, path.join(dest, 'web-workers'))
  copyDir(srcPipelines, path.join(dest, 'pipeline'))
  copyDir(srcImageIO, path.join(dest, 'image-io'))
  copyDir(srcMeshIO, path.join(dest, 'mesh-io'))
  if (fs.existsSync(srcEmbedded)) {
    fs.copyFileSync(srcEmbedded, path.join(dest, 'index-worker-embedded.min.js'))
  }
  if (fs.existsSync(srcEmbeddedMap)) {
    fs.copyFileSync(srcEmbeddedMap, path.join(dest, 'index-worker-embedded.min.js.map'))
  }
  console.log('itk-wasm assets copied to public/itk')
} catch (e) {
  console.warn('Failed to copy itk-wasm assets:', e?.message)
}
