declare module 'three' {
  const Three: any
  export = Three
}

declare module 'three/examples/jsm/controls/OrbitControls.js' {
  export class OrbitControls {
    constructor(camera: any, domElement?: HTMLElement)
    target: { x: number; y: number; z: number; set: (x: number, y: number, z: number) => void }
    update(): void
    dispose(): void
  }
}
