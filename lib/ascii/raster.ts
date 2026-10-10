import type { AsciiConfig } from './config'

// Low-level pieces shared by AsciiRenderer and WorldRenderer (docs/renderer-shared.md): the hash,
// colour parsing, light vector, tone pipeline, text snapshot, grid-dots cache and the bucketed
// glyph draw. The two render() loops stay separate — their projection and camera semantics differ.

/** Deterministic float in [0, 1) from an integer seed (intro reveal, shimmer, random glyphs). */
export function hash(n: number): number {
  n = (n ^ 61) ^ (n >>> 16)
  n = n + (n << 3)
  n = n ^ (n >>> 4)
  n = Math.imul(n, 0x27d4eb2d)
  n = n ^ (n >>> 15)
  return (n >>> 0) / 4294967296
}

export function parseHex(hex: string): [number, number, number] {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  const v = parseInt(h.padEnd(6, '0').slice(0, 6), 16) || 0
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255]
}

export function mixRGB(a: [number, number, number], b: [number, number, number], t: number): string {
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`
}

/** Normalised light direction in view space: pointer-driven, or azimuth/elevation. */
export function lightVector(cfg: AsciiConfig, pointerX: number, pointerY: number): [number, number, number] {
  let lx: number
  let ly: number
  let lz: number
  if (cfg.pointerLight) {
    lx = pointerX * 0.95
    ly = -pointerY * 0.95
    lz = 0.55
  } else {
    const az = cfg.lightAzimuth * (Math.PI / 180)
    const el = cfg.lightElevation * (Math.PI / 180)
    lx = Math.cos(el) * Math.sin(az)
    ly = Math.sin(el)
    lz = Math.cos(el) * Math.cos(az)
  }
  const ll = Math.hypot(lx, ly, lz) || 1
  return [lx / ll, ly / ll, lz / ll]
}

/**
 * Tone pipeline shared by both renderers: contrast/brightness → scanline → clamp → gamma → invert.
 * `row`/`rows` place the scanline, `t` drives it. The toned value also feeds colour bucketing.
 */
export function applyTone(v: number, row: number, rows: number, t: number, cfg: AsciiConfig): number {
  v = (v - 0.5) * cfg.contrast + 0.5 + cfg.brightness
  if (cfg.scanStrength > 0) {
    const scanPhase = (t * cfg.scanSpeed) % 1
    const dist = row / rows - scanPhase
    v += cfg.scanStrength * Math.exp(-(dist * dist) * 220)
  }
  v = v < 0 ? 0 : v > 1 ? 1 : v
  if (cfg.gamma !== 1) v = Math.pow(v, cfg.gamma)
  if (cfg.invert) v = 1 - v
  return v
}

/** Toned value → charset index, with the deterministic per-cell shimmer jitter. */
export function toneIndex(v: number, id: number, t: number, cfg: AsciiConfig, nChars: number): number {
  let ci = Math.round(v * (nChars - 1))
  if (cfg.shimmer > 0) {
    const timeBucket = Math.floor(t * 9)
    if (hash(id * 31 + timeBucket * 977) < cfg.shimmer) {
      ci += hash(id + timeBucket * 13) > 0.5 ? 1 : -1
      ci = ci < 0 ? 0 : ci >= nChars ? nChars - 1 : ci
    }
  }
  return ci
}

/** The visible cells as plain text, trimmed to the glyphs' bounding box. */
export function visibleText(visCell: Int32Array, visChar: ArrayLike<number>, glyphs: readonly string[], cols: number, rows: number, vis: number): string {
  if (!vis) return ''
  const grid = Array.from({ length: rows }, () => new Array<string>(cols).fill(' '))
  for (let i = 0; i < vis; i++) {
    const id = visCell[i]
    grid[(id / cols) | 0][id % cols] = glyphs[visChar[i]] ?? ' '
  }
  const lines = grid.map((r) => r.join('').replace(/\s+$/, ''))
  while (lines.length && !lines[0].trim()) lines.shift()
  while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length))
  return lines.map((l) => l.slice(indent)).join('\n')
}

export interface GridLayerOpts {
  width: number
  height: number
  dpr: number
  cw: number
  ch: number
  cols: number
  rows: number
  padX: number
  padY: number
  font: string
  cfg: AsciiConfig
}

/** Grid dots drawn once to an offscreen canvas and blitted every frame. */
export class GridLayer {
  private cache: HTMLCanvasElement | null = null
  private key = ''

  invalidate() {
    this.key = ''
  }

  draw(ctx: CanvasRenderingContext2D, o: GridLayerOpts) {
    if (!(o.cfg.gridDots && o.cfg.gridOpacity > 0)) return
    const key = [o.width, o.height, o.dpr, o.cw, o.ch, o.font, o.cfg.gridChar, o.cfg.gridColor, o.cfg.gridOpacity].join('|')
    if (key !== this.key || !this.cache) {
      const g = this.cache ?? document.createElement('canvas')
      g.width = Math.round(o.width * o.dpr)
      g.height = Math.round(o.height * o.dpr)
      const gctx = g.getContext('2d')!
      gctx.setTransform(o.dpr, 0, 0, o.dpr, 0, 0)
      gctx.clearRect(0, 0, o.width, o.height)
      gctx.font = o.font
      gctx.fillStyle = o.cfg.gridColor
      gctx.globalAlpha = o.cfg.gridOpacity
      gctx.textAlign = 'center'
      gctx.textBaseline = 'middle'
      const gc = Array.from(o.cfg.gridChar)[0] ?? '.'
      for (let r = 0; r < o.rows; r++) for (let c = 0; c < o.cols; c++) gctx.fillText(gc, o.padX + c * o.cw + o.cw / 2, o.padY + r * o.ch + o.ch / 2)
      this.cache = g
      this.key = key
    }
    ctx.drawImage(this.cache, 0, 0, o.width, o.height)
  }
}

export interface GlyphPlotterOpts {
  font: string
  cols: number
  rows: number
  cw: number
  ch: number
  padX: number
  padY: number
  /** Highest bucket value + 1 (mono: 1, ramps: 24, 12-bit colour: 4096). */
  bucketCount: number
  vis: number
  visCell: Int32Array
  visChar: ArrayLike<number>
  visBucket: Uint16Array
  glyphs: readonly string[]
  /** Resolves a bucket to a fill style; called once per bucket change. */
  styleFor: (bucket: number) => string
}

/** Counting-sorts the visible cells by colour bucket so fillStyle changes stay minimal, then draws. */
export class GlyphPlotter {
  private order = new Int32Array(0)
  private counts = new Int32Array(4097)

  draw(ctx: CanvasRenderingContext2D, o: GlyphPlotterOpts) {
    const vis = o.vis
    if (this.order.length < vis) this.order = new Int32Array(vis)
    const counts = this.counts
    counts.fill(0, 0, o.bucketCount + 1)
    for (let i = 0; i < vis; i++) counts[o.visBucket[i] + 1]++
    for (let b = 0; b < o.bucketCount; b++) counts[b + 1] += counts[b]
    for (let i = 0; i < vis; i++) this.order[counts[o.visBucket[i]]++] = i

    ctx.font = o.font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let lastBucket = -1
    for (let j = 0; j < vis; j++) {
      const i = this.order[j]
      const bucket = o.visBucket[i]
      if (bucket !== lastBucket) {
        lastBucket = bucket
        ctx.fillStyle = o.styleFor(bucket)
      }
      const id = o.visCell[i]
      const c = id % o.cols
      const r = (id / o.cols) | 0
      ctx.fillText(o.glyphs[o.visChar[i]], o.padX + c * o.cw + o.cw / 2, o.padY + r * o.ch + o.ch / 2)
    }
  }
}
