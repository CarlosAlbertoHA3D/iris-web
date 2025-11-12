declare module 'three/examples/jsm/loaders/MTLLoader.js' {
  export class MTLLoader {
    constructor(manager?: any)
    crossOrigin: string
    setResourcePath(path: string): this
    setMaterialOptions(options: any): this
    load(
      url: string,
      onLoad: (materials: any) => void,
      onProgress?: (event: any) => void,
      onError?: (err: any) => void
    ): void
  }
}

declare module 'three/examples/jsm/loaders/OBJLoader.js' {
  export class OBJLoader {
    constructor(manager?: any)
    setMaterials(materials: any): this
    load(
      url: string,
      onLoad: (obj: any) => void,
      onProgress?: (event: any) => void,
      onError?: (err: any) => void
    ): void
  }
}
