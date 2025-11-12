declare module 'itk-vtk-viewer' {
  export type ItkVtkViewer = any
  export default function createViewer(container: HTMLElement, options?: any): Promise<ItkVtkViewer>
}
