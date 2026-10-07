import { resolveFontFamily, type AsciiConfig } from './config'
import type { Model } from './model'

export interface FrameState {
  rotX: number
  rotY: number
  rotZ: number
  time: number
  introProgress: number
  pointerX: number
  pointerY: number
  zoomMul: number
}

export interface FrameStats {
  cols: number
  rows: number
  points: number
  glyphs: number
}

function hash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16)
  n = n + (n << 3)
  n = n ^ (n >>> 4)
  n = Math.imul(n, 0x27d4eb2d)
  n = n ^ (n >>> 15)
  return (n >>> 0) / 4294967296
}

function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const v = parseInt(h.padEnd(6, '0').slice(0, 6), 16)
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

function mix(a: [number, number, number], b: [number, number, number], t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`
}

const GRADIENT_STEPS = 24

export class AsciiRenderer {
  private zbuf = new Float32Array(0)
  private ibuf = new Int32Array(0)
  private visCell = new Int32Array(0)
  private visChar = new Int16Array(0)
  private visBucket = new Uint16Array(0)
  private order = new Int32Array(0)
  private counts = new Int32Array(4097)
  private gridCache: HTMLCanvasElement | null = null
  private gridKey = ''
  private palette: string[] = []
  private paletteKey = ''
  private sourcePalette: (string | undefined)[] = new Array(4096)
  private charsKey = ''
  private chars: string[] = []

  private last = { cols: 0, rows: 0, vis: 0 }
  private view = { cw: 1, ch: 1, padX: 0, padY: 0, cols: 0, rows: 0, cx: 0, cy: 0, scale: 1, persp: 0, m: new Float64Array(9) }

  /** Copy of the last frame's cell -> point buffer, for picking against a frozen surface. */
  snapshotPick(): Int32Array {
    return this.ibuf.slice()
  }

  /**
   * Index of the front-most model point drawn under canvas pixel (x, y), or -1. Searches ±1 cell.
   * `buf` lets callers pick from a `snapshotPick()` taken earlier with the same view.
   */
  pick(x: number, y: number, buf: Int32Array = this.ibuf): number {
    const { cw, ch, padX, padY, cols, rows } = this.view
    const c = Math.floor((x - padX) / cw)
    const r = Math.floor((y - padY) / ch)
    let best = -1
    let bestD = Infinity
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const cc = c + dc
        const rr = r + dr
        if (cc < 0 || rr < 0 || cc >= cols || rr >= rows) continue
        const pi = buf[rr * cols + cc]
        if (pi < 0) continue
        const d = dc * dc + dr * dr
        if (d < bestD) {
          bestD = d
          best = pi
        }
      }
    }
    return best
  }

  /** Model-space point -> canvas pixel and the pixels-per-unit scale at that depth. */
  project(x: number, y: number, z: number): { x: number; y: number; scale: number } {
    const { m, cx, cy, scale, persp } = this.view
    const rx = m[0] * x + m[1] * y + m[2] * z
    const ry = m[3] * x + m[4] * y + m[5] * z
    const rz = m[6] * x + m[7] * y + m[8] * z
    const s = persp > 0 ? 1 / Math.max(0.25, 1 - persp * rz) : 1
    return { x: cx + rx * s * scale, y: cy - ry * s * scale, scale: s * scale }
  }

  invalidate() {
    this.gridKey = ''
  }

  /** The last rendered frame as plain text, trimmed to the glyphs' bounding box. */
  toText(): string {
    const { cols, rows, vis } = this.last
    if (!vis) return ''
    const grid = Array.from({ length: rows }, () => new Array<string>(cols).fill(' '))
    for (let i = 0; i < vis; i++) {
      const id = this.visCell[i]
      grid[(id / cols) | 0][id % cols] = this.chars[this.visChar[i]] ?? ' '
    }
    const lines = grid.map((r) => r.join('').replace(/\s+$/, ''))
    while (lines.length && !lines[0].trim()) lines.shift()
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length))
    return lines.map((l) => l.slice(indent)).join('\n')
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dpr: number,
    cfg: AsciiConfig,
    model: Model,
    frame: FrameState,
  ): FrameStats {
    const cw = Math.max(3, cfg.cellSize)
    const ch = Math.max(3, cfg.cellSize * cfg.cellAspect)
    const cols = Math.max(1, Math.floor(width / cw))
    const rows = Math.max(1, Math.floor(height / ch))
    const cells = cols * rows
    const padX = (width - cols * cw) / 2
    const padY = (height - rows * ch) / 2

    if (this.zbuf.length !== cells) {
      this.zbuf = new Float32Array(cells)
      this.ibuf = new Int32Array(cells)
      this.visCell = new Int32Array(cells)
      this.visChar = new Int16Array(cells)
      this.visBucket = new Uint16Array(cells)
      this.order = new Int32Array(cells)
    }
    this.zbuf.fill(-Infinity)
    this.ibuf.fill(-1)

    if (cfg.charset !== this.charsKey) {
      this.charsKey = cfg.charset
      this.chars = Array.from(cfg.charset)
      if (this.chars.length === 0) this.chars = [' ']
    }
    const chars = this.chars
    const nChars = chars.length

    const family = resolveFontFamily(cfg.fontKey)
    const fontSize = Math.max(4, ch * cfg.glyphScale)
    const font = `${cfg.fontWeight} ${fontSize}px ${family}`

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (cfg.transparentBg) ctx.clearRect(0, 0, width, height)
    else {
      ctx.fillStyle = cfg.bg
      ctx.fillRect(0, 0, width, height)
    }

    if (cfg.gridDots && cfg.gridOpacity > 0) {
      const gridKey = [width, height, dpr, cw, ch, font, cfg.gridChar, cfg.gridColor, cfg.gridOpacity].join('|')
      if (gridKey !== this.gridKey || !this.gridCache) {
        const g = this.gridCache ?? document.createElement('canvas')
        g.width = Math.round(width * dpr)
        g.height = Math.round(height * dpr)
        const gctx = g.getContext('2d')!
        gctx.setTransform(dpr, 0, 0, dpr, 0, 0)
        gctx.clearRect(0, 0, width, height)
        gctx.font = font
        gctx.fillStyle = cfg.gridColor
        gctx.globalAlpha = cfg.gridOpacity
        gctx.textAlign = 'center'
        gctx.textBaseline = 'middle'
        const gc = Array.from(cfg.gridChar)[0] ?? '.'
        for (let r = 0; r < rows; r++) {
          for (let c = 0; c < cols; c++) {
            gctx.fillText(gc, padX + c * cw + cw / 2, padY + r * ch + ch / 2)
          }
        }
        this.gridCache = g
        this.gridKey = gridKey
      }
      ctx.drawImage(this.gridCache, 0, 0, width, height)
    }

    if (model.count === 0) {
      this.view.cols = 0
      return { cols, rows, points: 0, glyphs: 0 }
    }

    // Rotation: R = Rz * Rx * Ry (spin about object Y, tilt about X, roll about Z)
    const d2r = Math.PI / 180
    const cyw = Math.cos(frame.rotY * d2r)
    const syw = Math.sin(frame.rotY * d2r)
    const cxp = Math.cos(frame.rotX * d2r)
    const sxp = Math.sin(frame.rotX * d2r)
    const czr = Math.cos(frame.rotZ * d2r)
    const szr = Math.sin(frame.rotZ * d2r)
    // Rx * Ry
    const a00 = cyw
    const a01 = 0
    const a02 = syw
    const a10 = sxp * syw
    const a11 = cxp
    const a12 = -sxp * cyw
    const a20 = -cxp * syw
    const a21 = sxp
    const a22 = cxp * cyw
    // Rz * (Rx * Ry)
    const m00 = czr * a00 - szr * a10
    const m01 = czr * a01 - szr * a11
    const m02 = czr * a02 - szr * a12
    const m10 = szr * a00 + czr * a10
    const m11 = szr * a01 + czr * a11
    const m12 = szr * a02 + czr * a12
    const m20 = a20
    const m21 = a21
    const m22 = a22

    const rad = model.radius
    const scale = (Math.min(width, height) * 0.46 * cfg.zoom * frame.zoomMul) / rad
    const cx = width / 2 + cfg.offsetX * width
    const cy = height / 2 + cfg.offsetY * height
    const persp = cfg.perspective
    const { pos, count } = model
    const v = this.view
    v.cw = cw
    v.ch = ch
    v.padX = padX
    v.padY = padY
    v.cols = cols
    v.rows = rows
    v.cx = cx
    v.cy = cy
    v.scale = scale
    v.persp = persp
    v.m.set([m00, m01, m02, m10, m11, m12, m20, m21, m22])
    const waveOn = cfg.waveAmp > 0
    const t = frame.time

    for (let i = 0; i < count; i++) {
      const o = i * 3
      const x = pos[o]
      const y = pos[o + 1]
      let z = pos[o + 2]
      if (waveOn) z += cfg.waveAmp * Math.sin((x + y * 0.6) * cfg.waveFreq + t * cfg.waveSpeed)
      const rx = m00 * x + m01 * y + m02 * z
      const ry = m10 * x + m11 * y + m12 * z
      const rz = m20 * x + m21 * y + m22 * z
      let s = 1
      if (persp > 0) s = 1 / Math.max(0.25, 1 - persp * rz)
      const sx = cx + rx * s * scale - padX
      const sy = cy - ry * s * scale - padY
      if (sx < 0 || sy < 0) continue
      const c = (sx / cw) | 0
      const r = (sy / ch) | 0
      if (c >= cols || r >= rows) continue
      const id = r * cols + c
      if (rz > this.zbuf[id]) {
        this.zbuf[id] = rz
        this.ibuf[id] = i
      }
    }

    // Lighting vector in view space
    let lx: number
    let ly: number
    let lz: number
    if (cfg.pointerLight) {
      lx = frame.pointerX * 0.95
      ly = -frame.pointerY * 0.95
      lz = 0.55
    } else {
      const az = cfg.lightAzimuth * d2r
      const el = cfg.lightElevation * d2r
      lx = Math.cos(el) * Math.sin(az)
      ly = Math.sin(el)
      lz = Math.cos(el) * Math.cos(az)
    }
    const ll = Math.hypot(lx, ly, lz) || 1
    lx /= ll
    ly /= ll
    lz /= ll

    const palKey = `${cfg.colorMode}|${cfg.fg}|${cfg.fg2}`
    if (palKey !== this.paletteKey) {
      this.paletteKey = palKey
      const a = parseHex(cfg.fg2)
      const b = parseHex(cfg.fg)
      this.palette = []
      if (cfg.colorMode === 'mono') this.palette.push(cfg.fg)
      else for (let s = 0; s < GRADIENT_STEPS; s++) this.palette.push(mix(a, b, s / (GRADIENT_STEPS - 1)))
    }

    const { nrm, lum, col } = model
    const sourceColor = cfg.colorMode === 'source'
    const introOn = cfg.intro > 0 && frame.introProgress < 1
    const timeBucket = Math.floor(t * 9)
    const scanOn = cfg.scanStrength > 0
    const scanPhase = (t * cfg.scanSpeed) % 1
    const invRad = 1 / (2 * rad)
    const bucketCount = sourceColor ? 4096 : cfg.colorMode === 'mono' ? 1 : GRADIENT_STEPS

    let vis = 0
    for (let id = 0; id < cells; id++) {
      const pi = this.ibuf[id]
      if (pi < 0) continue

      if (introOn && hash(id * 7919 + 13) > frame.introProgress) continue

      const o = pi * 3
      let nx = m00 * nrm[o] + m01 * nrm[o + 1] + m02 * nrm[o + 2]
      let ny = m10 * nrm[o] + m11 * nrm[o + 1] + m12 * nrm[o + 2]
      let nz = m20 * nrm[o] + m21 * nrm[o + 1] + m22 * nrm[o + 2]
      if (nz < 0) {
        nx = -nx
        ny = -ny
        nz = -nz
      }
      const lambert = Math.max(0, nx * lx + ny * ly + nz * lz)
      const lit = cfg.ambient + (1 - cfg.ambient) * lambert
      let v: number
      if (cfg.shade === 'light') v = lit
      else if (cfg.shade === 'image') v = lum[pi]
      else v = lum[pi] * lit

      const depthN = Math.min(1, Math.max(0, (this.zbuf[id] + rad) * invRad))
      if (cfg.depthFade > 0) v *= 1 - cfg.depthFade * (1 - depthN)

      v = (v - 0.5) * cfg.contrast + 0.5 + cfg.brightness
      if (scanOn) {
        const row = (id / cols) | 0
        const dist = row / rows - scanPhase
        v += cfg.scanStrength * Math.exp(-(dist * dist) * 220)
      }
      v = v < 0 ? 0 : v > 1 ? 1 : v
      if (cfg.gamma !== 1) v = Math.pow(v, cfg.gamma)
      if (cfg.invert) v = 1 - v

      let ci = Math.round(v * (nChars - 1))
      if (cfg.shimmer > 0 && hash(id * 31 + timeBucket * 977) < cfg.shimmer) {
        ci += hash(id + timeBucket * 13) > 0.5 ? 1 : -1
        ci = ci < 0 ? 0 : ci >= nChars ? nChars - 1 : ci
      }
      if (chars[ci] === ' ') continue

      let bucket = 0
      if (sourceColor) {
        const k = 0.4 + 0.6 * v
        const r4 = (col[o] * k) >> 4
        const g4 = (col[o + 1] * k) >> 4
        const b4 = (col[o + 2] * k) >> 4
        bucket = (r4 << 8) | (g4 << 4) | b4
      } else if (cfg.colorMode === 'gradient') {
        bucket = Math.round(v * (GRADIENT_STEPS - 1))
      } else if (cfg.colorMode === 'depth') {
        bucket = Math.round(depthN * (GRADIENT_STEPS - 1))
      }

      this.visCell[vis] = id
      this.visChar[vis] = ci
      this.visBucket[vis] = bucket
      vis++
    }

    // Counting sort by color bucket so fillStyle changes stay minimal.
    const counts = this.counts
    counts.fill(0, 0, bucketCount + 1)
    for (let i = 0; i < vis; i++) counts[this.visBucket[i] + 1]++
    for (let b = 0; b < bucketCount; b++) counts[b + 1] += counts[b]
    for (let i = 0; i < vis; i++) this.order[counts[this.visBucket[i]]++] = i

    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let lastBucket = -1
    for (let j = 0; j < vis; j++) {
      const i = this.order[j]
      const bucket = this.visBucket[i]
      if (bucket !== lastBucket) {
        lastBucket = bucket
        if (sourceColor) {
          let s = this.sourcePalette[bucket]
          if (!s) {
            s = `rgb(${((bucket >> 8) & 15) * 17},${((bucket >> 4) & 15) * 17},${(bucket & 15) * 17})`
            this.sourcePalette[bucket] = s
          }
          ctx.fillStyle = s
        } else {
          ctx.fillStyle = this.palette[bucket]
        }
      }
      const id = this.visCell[i]
      const c = id % cols
      const r = (id / cols) | 0
      ctx.fillText(chars[this.visChar[i]], padX + c * cw + cw / 2, padY + r * ch + ch / 2)
    }

    this.last = { cols, rows, vis }
    return { cols, rows, points: count, glyphs: vis }
  }
}
