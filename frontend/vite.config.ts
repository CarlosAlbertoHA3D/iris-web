import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // Important for itk-wasm dynamic imports to work in dev
    exclude: ['itk-wasm', 'itk-vtk-viewer', '@itk-wasm/image-io', 'nifti-reader-js'],
  },
  build: {
    // Some dependencies ship mixed module types
    commonjsOptions: { transformMixedEsModules: true },
  },
  assetsInclude: [
    '**/*.nii',
    '**/*.nii.gz',
    '**/*.dcm',
    '**/*.obj',
    '**/*.mtl',
    '**/*.glb',
    '**/*.zip',
  ],
})
