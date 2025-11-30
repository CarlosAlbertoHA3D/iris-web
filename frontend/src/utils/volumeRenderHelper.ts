import * as THREE from 'three'

interface Preset {
    name: string
    scalarOpacity: string
    colorTransfer: string
    gradientOpacity?: string
    specularPower?: string
    specular?: string
    diffuse?: string
    ambient?: string
    shade?: string
}

export function createColormapTexture(preset: Preset, dataMin: number, dataMax: number, width = 1024) {
    const data = new Uint8Array(width * 4)
    
    // Parse Opacity Control Points
    const opacityPoints = parseControlPoints(preset.scalarOpacity, 2) // [x, opacity]
    const colorPoints = parseControlPoints(preset.colorTransfer, 4) // [x, r, g, b]

    // Helper to interpolate value at a given x
    const getOpacity = (x: number) => {
        if (preset.name === 'Natural') {
            // Linear ramp from min to max
            if (x <= dataMin) return 0
            if (x >= dataMax) return 1
            return (x - dataMin) / (dataMax - dataMin)
        }
        return interpolate(x, opacityPoints, 1)
    }
    const getColor = (x: number) => {
        if (preset.name === 'Natural') {
            // Linear grayscale
            const t = (x - dataMin) / (dataMax - dataMin)
            const c = Math.max(0, Math.min(1, t))
            return [c, c, c]
        }
        return [
            interpolate(x, colorPoints, 1), // R
            interpolate(x, colorPoints, 2), // G
            interpolate(x, colorPoints, 3)  // B
        ]
    }

    for (let i = 0; i < width; i++) {
        // Normalized position 0..1
        const t = i / (width - 1)
        
        // Map normalized t back to data range (e.g. HU)
        const val = dataMin + t * (dataMax - dataMin)
        
        const opacity = getOpacity(val)
        const [r, g, b] = getColor(val)
        
        data[i * 4 + 0] = Math.floor(r * 255)
        data[i * 4 + 1] = Math.floor(g * 255)
        data[i * 4 + 2] = Math.floor(b * 255)
        data[i * 4 + 3] = Math.floor(opacity * 255)
    }

    const texture = new THREE.DataTexture(data, width, 1, THREE.RGBAFormat)
    texture.needsUpdate = true
    return texture
}

function parseControlPoints(str: string, stride: number) {
    const parts = str.trim().split(/\s+/).map(parseFloat)
    // First value is count? Or is it just a flat list?
    // The format observed: "10 -2048 0 -451 0 -450 1 1050 1 3661 1"
    // 10 is total numbers (5 points * 2 values).
    // So yes, first value is length of the rest of the array.
    
    const count = parts[0]
    const values = parts.slice(1)
    
    const points: number[][] = []
    for (let i = 0; i < values.length; i += stride) {
        points.push(values.slice(i, i + stride))
    }
    
    // Sort by X just in case
    points.sort((a, b) => a[0] - b[0])
    
    return points
}

function interpolate(x: number, points: number[][], valueIndex: number) {
    if (points.length === 0) return 0
    if (x <= points[0][0]) return points[0][valueIndex]
    if (x >= points[points.length - 1][0]) return points[points.length - 1][valueIndex]
    
    // Linear search (points are few, so this is fast enough)
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i]
        const p2 = points[i+1]
        
        if (x >= p1[0] && x <= p2[0]) {
            const t = (x - p1[0]) / (p2[0] - p1[0])
            return p1[valueIndex] + t * (p2[valueIndex] - p1[valueIndex])
        }
    }
    return 0
}
