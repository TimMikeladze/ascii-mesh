import type { AsciiConfig } from './config'
import type { LoadedSource } from './source'

export interface Model {
  count: number
  pos: Float32Array
  nrm: Float32Array
  lum: Float32Array
  col: Uint8Array
  radius: number
}

export type ShapeParams = Pick<
  AsciiConfig,
  'shape' | 'maskMode' | 'invertMask' | 'threshold' | 'smooth' | 'thickness' | 'reliefDepth'
>

const SIDE_BUDGET = 260_000

function boxBlur(src: Float32Array, w: number, h: number, passes: number): Float32Array {
  let a: Float32Array = src
  for (let p = 0; p < passes; p++) {
    const out = new Float32Array(w * h)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sum = 0
        let n = 0
        for (let dy = -1; dy <= 1; dy++) {
          const yy = y + dy
          if (yy < 0 || yy >= h) continue
          for (let dx = -1; dx <= 1; dx++) {
            const xx = x + dx
            if (xx < 0 || xx >= w) continue
            sum += a[yy * w + xx]
            n++
          }
        }
        out[y * w + x] = sum / n
      }
    }
    a = out
  }
  return a
}

export function emptyModel(): Model {
  return {
    count: 0,
    pos: new Float32Array(0),
    nrm: new Float32Array(0),
    lum: new Float32Array(0),
    col: new Uint8Array(0),
    radius: 0.5,
  }
}

export function buildModel(source: LoadedSource, params: ShapeParams, res: number): Model {
  const aspect = source.width / source.height
  let w: number
  let h: number
  if (aspect >= 1) {
    w = res
    h = Math.max(8, Math.round(res / aspect))
  } else {
    h = res
    w = Math.max(8, Math.round(res * aspect))
  }

  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return emptyModel()
  ctx.clearRect(0, 0, w, h)
  ctx.drawImage(source.image, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data

  const total = w * h
  const lumRaw = new Float32Array(total)
  for (let i = 0; i < total; i++) {
    const o = i * 4
    lumRaw[i] = (0.2126 * data[o] + 0.7152 * data[o + 1] + 0.0722 * data[o + 2]) / 255
  }

  // Coverage value per pixel (how "solid" it is), later thresholded into a mask.
  let cover: Float32Array = new Float32Array(total)
  const hasAlpha = source.hasAlpha
  let mode = params.maskMode
  if (mode === 'auto') mode = hasAlpha ? 'alpha' : 'luma-invert'

  if (params.maskMode === 'auto' && !hasAlpha) {
    // Opaque image: treat whatever differs from the corner color as the subject.
    const corners = [0, w - 1, (h - 1) * w, h * w - 1]
    let br = 0
    let bg = 0
    let bb = 0
    for (const c of corners) {
      br += data[c * 4]
      bg += data[c * 4 + 1]
      bb += data[c * 4 + 2]
    }
    br /= 4
    bg /= 4
    bb /= 4
    for (let i = 0; i < total; i++) {
      const o = i * 4
      const dist = Math.max(Math.abs(data[o] - br), Math.abs(data[o + 1] - bg), Math.abs(data[o + 2] - bb)) / 255
      cover[i] = Math.min(1, dist * 2)
    }
  } else {
    for (let i = 0; i < total; i++) {
      const a = data[i * 4 + 3] / 255
      switch (mode) {
        case 'alpha':
          cover[i] = a
          break
        case 'luma':
          cover[i] = lumRaw[i] * a
          break
        case 'luma-invert':
          cover[i] = (1 - lumRaw[i]) * a
          break
        default:
          cover[i] = 1
      }
    }
  }
  if (params.invertMask) for (let i = 0; i < total; i++) cover[i] = 1 - cover[i]
  if (params.smooth > 0) cover = boxBlur(cover, w, h, Math.round(params.smooth))

  const mask = new Uint8Array(total)
  let minX = w
  let maxX = -1
  let minY = h
  let maxY = -1
  let solid = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x
      if (cover[i] > params.threshold) {
        mask[i] = 1
        solid++
        if (x < minX) minX = x
        if (x > maxX) maxX = x
        if (y < minY) minY = y
        if (y > maxY) maxY = y
      }
    }
  }
  if (solid === 0) return emptyModel()

  const bw = maxX - minX + 1
  const bh = maxY - minY + 1
  const px = 1 / Math.max(bw, bh)
  const cx0 = (minX + maxX + 1) / 2
  const cy0 = (minY + maxY + 1) / 2
  const isSolid = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && mask[y * w + x] === 1

  // Gradient of a softened mask gives smooth outward normals on curved outlines.
  const soft = boxBlur(Float32Array.from(mask), w, h, 2)
  const relief = params.shape === 'relief'
  const lumSoft = relief ? boxBlur(lumRaw, w, h, 1) : lumRaw

  const T = relief ? params.reliefDepth : params.thickness
  const dirs: [number, number][] = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ]

  let edgeCount = 0
  if (!relief) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        if (!isSolid(x, y)) continue
        for (const [dx, dy] of dirs) if (!isSolid(x + dx, y + dy)) edgeCount++
      }
    }
  }
  let wallSteps = Math.max(2, Math.ceil(T / px) + 1)
  if (edgeCount * wallSteps > SIDE_BUDGET) wallSteps = Math.max(2, Math.floor(SIDE_BUDGET / Math.max(1, edgeCount)))

  const n = relief ? solid : solid * 2 + edgeCount * wallSteps
  const pos = new Float32Array(n * 3)
  const nrm = new Float32Array(n * 3)
  const lum = new Float32Array(n)
  const col = new Uint8Array(n * 3)
  let k = 0
  let maxR2 = 0

  const put = (x: number, y: number, z: number, nx: number, ny: number, nz: number, pi: number) => {
    const o = k * 3
    pos[o] = x
    pos[o + 1] = y
    pos[o + 2] = z
    nrm[o] = nx
    nrm[o + 1] = ny
    nrm[o + 2] = nz
    lum[k] = lumRaw[pi]
    col[o] = data[pi * 4]
    col[o + 1] = data[pi * 4 + 1]
    col[o + 2] = data[pi * 4 + 2]
    const r2 = x * x + y * y + z * z
    if (r2 > maxR2) maxR2 = r2
    k++
  }

  const halfT = T / 2
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      if (!isSolid(x, y)) continue
      const pi = y * w + x
      const wx = (x + 0.5 - cx0) * px
      const wy = -(y + 0.5 - cy0) * px

      if (relief) {
        const z = (lumSoft[pi] - 0.5) * T
        const zAt = (xx: number, yy: number) => {
          const cxx = Math.min(w - 1, Math.max(0, xx))
          const cyy = Math.min(h - 1, Math.max(0, yy))
          return (lumSoft[cyy * w + cxx] - 0.5) * T
        }
        const dzdx = (zAt(x + 1, y) - zAt(x - 1, y)) / (2 * px)
        const dzdy = -(zAt(x, y + 1) - zAt(x, y - 1)) / (2 * px)
        const len = Math.hypot(dzdx, dzdy, 1)
        put(wx, wy, z, -dzdx / len, -dzdy / len, 1 / len, pi)
        continue
      }

      put(wx, wy, halfT, 0, 0, 1, pi)
      put(wx, wy, -halfT, 0, 0, -1, pi)

      for (const [dx, dy] of dirs) {
        if (isSolid(x + dx, y + dy)) continue
        const sample = (xx: number, yy: number) =>
          xx >= 0 && yy >= 0 && xx < w && yy < h ? soft[yy * w + xx] : 0
        let nx = -(sample(x + 1, y) - sample(x - 1, y))
        let ny = sample(x, y + 1) - sample(x, y - 1)
        let nl = Math.hypot(nx, ny)
        if (nl < 1e-4) {
          nx = dx
          ny = -dy
          nl = 1
        }
        nx /= nl
        ny /= nl
        const ex = wx + dx * px * 0.5
        const ey = wy - dy * px * 0.5
        for (let s = 0; s < wallSteps; s++) {
          const z = -halfT + (T * s) / (wallSteps - 1)
          put(ex, ey, z, nx, ny, 0, pi)
        }
      }
    }
  }

  return { count: k, pos, nrm, lum, col, radius: Math.max(0.2, Math.sqrt(maxR2)) }
}
