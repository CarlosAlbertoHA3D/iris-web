# Iris Frontend (Vite + React + TypeScript)

Modern dark UI with Tailwind + Radix (shadcn-style), 2×2 layout: triplanar placeholders (sagittal/coronal/axial) + 3D. Zustand store, API/WebSocket/upload stubs.

## Scripts

- dev: local dev server
- build: type-check + production build
- preview: preview production build
- test: unit tests via Vitest

```bash
# In frontend/
npm install
npm run dev
```

Open http://localhost:5173.

## Env Vars

Create `.env` in `frontend/` (or use system envs):

```
VITE_API_BASE_URL=http://localhost:8787
VITE_WS_URL=ws://localhost:8787/ws
VITE_COGNITO_USER_POOL_ID=
VITE_COGNITO_CLIENT_ID=
VITE_IDENTITY_POOL_ID=
VITE_S3_UPLOAD_BUCKET=
```

## Structure

- `src/App.tsx`: Layout 2×2 and side panel
- `src/components/TriplanarViewer.tsx`: Placeholder (to be replaced by itk-vtk-viewer)
- `src/components/ThreeDViewer.tsx`: Three.js canvas w/ OrbitControls
- `src/components/UploadDropzone.tsx`: Drag & drop and file input
- `src/components/SidePanel.tsx`: Process button, progress, viewer controls
- `src/store/useAppStore.ts`: Zustand store (theme, viewer, uploads, job)
- `src/services/api.ts`: API contracts stubs
- `src/services/ws.ts`: WebSocket client
- `src/services/uploader.ts`: Multipart upload helpers

## Next steps

- Integrate itk-wasm + itk-vtk-viewer for triplanar (WW/WL, crosshair, scroll, zoom/pan)
- Hook upload flow to backend presigned multipart
- WebSocket progress wired to real API Gateway endpoint
- Structure list in 3D view with visibility/opacity/color from Result.json
- Auth (Cognito hosted UI + guest Identity Pool)

## Notes

- Assets allowed by `vite.config.ts` include NIfTI, DICOM, OBJ/MTL, GLB, ZIP.
- Keyboard: ↑/↓ to change slice (placeholder), R to reset 3D camera.
