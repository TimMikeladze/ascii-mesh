import { resolveFontFamily, type AsciiConfig } from './config'
import { fieldSampler, type FieldSampler } from './fields'
import type { Model } from './model'
import type { FrameStats } from './renderer'
import { deformers, evalCamera, objectInstances, type Field, type World } from './world'

// Renders a World: every instance of every object shares one z-buffer; lighting runs only for the
// winning point of each cell; back fields fill empty cells, front fields overlay. Colours are
// quantised to 12 bits and drawn bucket by bucket. See docs/worlds.md.

export interface BuiltObject {
  model: Model
  update?: (t: number) => void
}

export interface WorldFrame {
  time: number
  introProgress: number
  /** User orbit added to the camera, degrees. */
  userX: number
  userY: number
  zoomMul: number
  pointerX: number
  pointerY: number
}

function hash(n: number): number {
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

/** Colour ramp sampler over 2+ stops, returns 12-bit bucket for v ∈ [0, 1]. */
function rampBuckets(colors: string[]): Uint16Array {
  const stops = colors.map(parseHex)
  const out = new Uint16Array(64)
  for (let i = 0; i < 64; i++) {
    const v = (i / 63) * (stops.length - 1)
    const k = Math.min(stops.length - 2, Math.floor(v))
    const f = v - k
    const a = stops[k]
    const b = stops[k + 1]
    const r = Math.round(a[0] + (b[0] - a[0]) * f)
    const g = Math.round(a[1] + (b[1] - a[1]) * f)
    const bl = Math.round(a[2] + (b[2] - a[2]) * f)
    out[i] = ((r >> 4) << 8) | ((g >> 4) << 4) | (bl >> 4)
  }
  return out
}

interface Slot {
  obj: number
  n: Float64Array
  model: Model
}

interface ObjStyle {
  off: number
  len: number
  /** Non-blank glyph offsets for random-glyph fields. */
  cr: number[]
  lit: [number, number, number]
  dark: [number, number, number]
  emissive: number
  source: boolean
  height: boolean
}

export class WorldRenderer {
  private zbuf = new Float32Array(0)
  private ibuf = new Int32Array(0)
  private sbuf = new Int32Array(0)
  private visCell = new Int32Array(0)
  private visChar = new Int32Array(0)
  private visBucket = new Uint16Array(0)
  private order = new Int32Array(0)
  private counts = new Int32Array(4097)
  private palette: (string | undefined)[] = new Array(4096)
  private glyphs: string[] = []
  private glyphKey = ''
  private glyphIndex = new Map<string, { off: number; len: number; cr: number[] }>()
  private gridCache: HTMLCanvasElement | null = null
  private gridKey = ''
  private slots: Slot[] = []
  private last = { cols: 0, rows: 0, vis: 0 }
  private view = { cw: 1, ch: 1, padX: 0, padY: 0, cols: 0, rows: 0, cx: 0, cy: 0, scale: 1, fov: 0, fit: 1, m: new Float64Array(9), panX: 0, panY: 0 }

  invalidate() {
    this.gridKey = ''
  }

  /** World index of the object drawn at canvas pixel (x, y) in the last frame (±1 cell), or -1. */
  pickObject(x: number, y: number): number {
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
        const s = this.sbuf[rr * cols + cc]
        if (s < 0) continue
        const d = dc * dc + dr * dr
        if (d < bestD) {
          bestD = d
          best = this.slots[s]?.obj ?? -1
        }
      }
    }
    return best
  }

  /** World point -> canvas pixel and pixels-per-unit at that depth (last frame's camera). */
  project(x: number, y: number, z: number): { x: number; y: number; scale: number } {
    const { m, cx, cy, scale, fov, fit, panX, panY } = this.view
    const rx = m[0] * x + m[1] * y + m[2] * z - panX
    const ry = m[3] * x + m[4] * y + m[5] * z - panY
    const rz = m[6] * x + m[7] * y + m[8] * z
    const s = fov > 0 ? 1 / Math.max(0.2, 1 - (fov * rz) / fit) : 1
    return { x: cx + rx * s * scale, y: cy - ry * s * scale, scale: s * scale }
  }

  /** The last rendered frame as plain text, trimmed to its bounding box. */
  toText(): string {
    const { cols, rows, vis } = this.last
    if (!vis) return ''
    const grid = Array.from({ length: rows }, () => new Array<string>(cols).fill(' '))
    for (let i = 0; i < vis; i++) {
      const id = this.visCell[i]
      grid[(id / cols) | 0][id % cols] = this.glyphs[this.visChar[i]] ?? ' '
    }
    const lines = grid.map((r) => r.join('').replace(/\s+$/, ''))
    while (lines.length && !lines[0].trim()) lines.shift()
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.length - l.trimStart().length))
    return lines.map((l) => l.slice(indent)).join('\n')
  }

  private charset(set: string) {
    return this.glyphIndex.get(set)!
  }

  private prepareGlyphs(cfg: AsciiConfig, world: World) {
    const sets = [cfg.charset || ' ', ...world.objects.map((o) => o.charset ?? ''), ...world.fields.map((f) => f.charset)].filter(Boolean)
    const key = sets.join('\u0000')
    if (key === this.glyphKey) return
    this.glyphKey = key
    this.glyphs = []
    this.glyphIndex.clear()
    for (const s of sets) {
      if (this.glyphIndex.has(s)) continue
      const chars = Array.from(s)
      const off = this.glyphs.length
      this.glyphs.push(...chars)
      const cr: number[] = []
      chars.forEach((c, i) => c !== ' ' && cr.push(off + i))
      this.glyphIndex.set(s, { off, len: chars.length, cr })
    }
  }

  render(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dpr: number,
    cfg: AsciiConfig,
    world: World,
    built: (BuiltObject | null)[],
    frame: WorldFrame,
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
      this.sbuf = new Int32Array(cells)
      this.visCell = new Int32Array(cells)
      this.visChar = new Int32Array(cells)
      this.visBucket = new Uint16Array(cells)
      this.order = new Int32Array(cells)
    }
    this.zbuf.fill(-Infinity)
    this.sbuf.fill(-1)
    this.prepareGlyphs(cfg, world)
    const glyphs = this.glyphs

    const family = resolveFontFamily(cfg.fontKey)
    const fontSize = Math.max(4, ch * cfg.glyphScale)
    const font = `${cfg.fontWeight} ${fontSize}px ${family}`

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    if (cfg.transparentBg) ctx.clearRect(0, 0, width, height)
    else {
      ctx.fillStyle = cfg.bg
      ctx.fillRect(0, 0, width, height)
    }
    if (cfg.gridDots && cfg.gridOpacity > 0) this.drawGrid(ctx, width, height, dpr, cw, ch, cols, rows, padX, padY, font, cfg)

    // ---- camera ----
    const t = frame.time
    const cam = evalCamera(world.camera, t)
    const d2r = Math.PI / 180
    // Camera tilt: negative looks down onto the scene (the camera pitches forward).
    const rotX = -cam.rot[0] + frame.userX
    const rotY = cam.rot[1] + frame.userY
    const rotZ = cam.rot[2]
    const cyw = Math.cos(rotY * d2r)
    const syw = Math.sin(rotY * d2r)
    const cxp = Math.cos(rotX * d2r)
    const sxp = Math.sin(rotX * d2r)
    const czr = Math.cos(rotZ * d2r)
    const szr = Math.sin(rotZ * d2r)
    const a10 = sxp * syw
    const a12 = -sxp * cyw
    const C = Float64Array.of(
      czr * cyw - szr * a10, -szr * cxp, czr * syw - szr * a12,
      szr * cyw + czr * a10, czr * cxp, szr * syw + czr * a12,
      -cxp * syw, sxp, cxp * cyw,
    )
    const fit = world.fit
    const scale = (Math.min(width, height) * 0.5 * cfg.zoom * cam.zoom * frame.zoomMul) / fit
    const cx = width / 2 + cfg.offsetX * width
    const cy = height / 2 + cfg.offsetY * height
    const fov = world.camera.fov
    const panX = cam.pan[0]
    const panY = cam.pan[1]
    const v = this.view
    Object.assign(v, { cw, ch, padX, padY, cols, rows, cx, cy, scale, fov, fit, panX, panY })
    v.m.set(C)

    // ---- objects: project every point of every instance into the shared z-buffer ----
    const slots: Slot[] = []
    const styles: ObjStyle[] = []
    const bg = parseHex(cfg.bg)
    let points = 0
    const zbuf = this.zbuf
    const ibuf = this.ibuf
    const sbuf = this.sbuf
    for (let oi = 0; oi < world.objects.length; oi++) {
      const o = world.objects[oi]
      const b = built[oi]
      const lit = parseHex(o.color)
      const dark: [number, number, number] = o.shadow ? parseHex(o.shadow) : [lit[0] * 0.15 + bg[0] * 0.85, lit[1] * 0.15 + bg[1] * 0.85, lit[2] * 0.15 + bg[2] * 0.85]
      const cs = this.charset(o.charset || cfg.charset || ' ')
      styles.push({ off: cs.off, len: cs.len, cr: cs.cr, lit, dark, emissive: o.emissive, source: !!o.source, height: o.tint === 'height' })
      if (o.hidden || !b || !b.model.count) continue
      if (b.update) b.update(t)
      const model = b.model
      const { pos, count } = model
      for (const inst of objectInstances(o, t)) {
        const M = inst.m
        // A = C·M (3×3), translation C·T − pan.
        const a00 = C[0] * M[0] + C[1] * M[4] + C[2] * M[8]
        const a01 = C[0] * M[1] + C[1] * M[5] + C[2] * M[9]
        const a02 = C[0] * M[2] + C[1] * M[6] + C[2] * M[10]
        const a10_ = C[3] * M[0] + C[4] * M[4] + C[5] * M[8]
        const a11 = C[3] * M[1] + C[4] * M[5] + C[5] * M[9]
        const a12_ = C[3] * M[2] + C[4] * M[6] + C[5] * M[10]
        const a20 = C[6] * M[0] + C[7] * M[4] + C[8] * M[8]
        const a21 = C[6] * M[1] + C[7] * M[5] + C[8] * M[9]
        const a22 = C[6] * M[2] + C[7] * M[6] + C[8] * M[10]
        const tx = C[0] * M[3] + C[1] * M[7] + C[2] * M[11] - panX
        const ty = C[3] * M[3] + C[4] * M[7] + C[5] * M[11] - panY
        const tz = C[6] * M[3] + C[7] * M[7] + C[8] * M[11]
        const N = inst.n
        const n = new Float64Array(9)
        for (let r = 0; r < 3; r++)
          for (let c = 0; c < 3; c++) n[r * 3 + c] = C[r * 3] * N[c] + C[r * 3 + 1] * N[3 + c] + C[r * 3 + 2] * N[6 + c]
        // Cull copies entirely off-screen or behind the camera.
        const ccx = tx
        const ccy = ty
        const ccz = tz
        const rad = model.radius * inst.scale
        if (fov > 0 && ccz - rad > fit / fov) continue
        const sc0 = fov > 0 ? 1 / Math.max(0.2, 1 - (fov * (ccz + rad)) / fit) : 1
        if (Math.abs(ccx * scale) - rad * sc0 * scale > width * 0.5 + Math.abs(cfg.offsetX * width) + cw * 4 && fov === 0) continue
        const slot = slots.length
        slots.push({ obj: oi, n, model })
        const defs = deformers(o.anim, inst.t)
        const hasDef = defs.length > 0
        points += count
        for (let i = 0; i < count; i++) {
          const p = i * 3
          let x = pos[p]
          let y = pos[p + 1]
          let z = pos[p + 2]
          if (hasDef) {
            for (const d of defs) {
              if (d.kind === 0) {
                const ax = d.axis
                const u = ax === 0 ? y + z * 0.5 : ax === 1 ? x + z * 0.5 : x + y * 0.5
                const w = d.amp * Math.sin(d.freq * u - d.phase)
                if (ax === 0) x += w
                else if (ax === 1) y += w
                else z += w
              } else {
                const ang = d.amp * y
                const c = Math.cos(ang)
                const s = Math.sin(ang)
                const nx = x * c - z * s
                z = x * s + z * c
                x = nx
              }
            }
          }
          const rx = a00 * x + a01 * y + a02 * z + tx
          const ry = a10_ * x + a11 * y + a12_ * z + ty
          const rz = a20 * x + a21 * y + a22 * z + tz
          let s = 1
          if (fov > 0) {
            const den = 1 - (fov * rz) / fit
            if (den < 0.2) continue
            s = 1 / den
          }
          const sx = cx + rx * s * scale - padX
          const sy = cy - ry * s * scale - padY
          if (sx < 0 || sy < 0) continue
          const c = (sx / cw) | 0
          const r = (sy / ch) | 0
          if (c >= cols || r >= rows) continue
          const id = r * cols + c
          if (rz > zbuf[id]) {
            zbuf[id] = rz
            ibuf[id] = i
            sbuf[id] = slot
          }
        }
      }
    }
    this.slots = slots

    // ---- light ----
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

    // ---- fields ----
    const half = Math.min(width, height) / 2
    const back: { f: Field; s: FieldSampler; ramp: Uint16Array; cs: { off: number; len: number; cr: number[] } }[] = []
    const front: typeof back = []
    for (const f of world.fields) {
      if (f.hidden) continue
      const entry = { f, s: fieldSampler(f, t, rows, cw / half), ramp: rampBuckets(f.colors.length >= 2 ? f.colors : [f.colors[0] ?? '#000000', f.colors[0] ?? '#ffffff']), cs: this.charset(f.charset) }
      ;(f.layer === 'front' ? front : back).push(entry)
    }
    const timeBucket = Math.floor(t * 9)
    const fieldTimeBucket = Math.floor(t * 12)
    const sampleField = (list: typeof back, id: number, c: number, r: number, out: { ch: number; bucket: number }): boolean => {
      const x = (padX + c * cw + cw / 2 - width / 2) / half
      const y = -(padY + r * ch + ch / 2 - height / 2) / half
      for (let k = list.length - 1; k >= 0; k--) {
        const e = list[k]
        let fv = e.s(x, y, c, r)
        if (fv < 0) continue
        fv *= e.f.intensity
        if (fv > 1) fv = 1
        let gi: number
        if (e.f.random) {
          if (fv < 0.04 || !e.cs.cr.length) continue
          gi = e.cs.cr[(hash(id * 131 + fieldTimeBucket * 7 + ((fv * 3) | 0)) * e.cs.cr.length) | 0]
        } else {
          const ci = Math.round(fv * (e.cs.len - 1))
          gi = e.cs.off + ci
          if (glyphs[gi] === ' ') continue
        }
        out.ch = gi
        out.bucket = e.ramp[Math.round(fv * 63)]
        return true
      }
      return false
    }

    // ---- shade winners + compose ----
    const introOn = cfg.intro > 0 && frame.introProgress < 1
    const scanOn = cfg.scanStrength > 0
    const scanPhase = (t * cfg.scanSpeed) % 1
    const invFit = 1 / (2 * fit)
    const fieldOut = { ch: 0, bucket: 0 }
    let vis = 0
    for (let id = 0; id < cells; id++) {
      if (introOn && hash(id * 7919 + 13) > frame.introProgress) continue
      const r = (id / cols) | 0
      const c = id - r * cols
      const slotIndex = sbuf[id]
      let gi = -1
      let bucket = 0
      if (slotIndex >= 0) {
        const slot = slots[slotIndex]
        const st = styles[slot.obj]
        const pi = ibuf[id]
        const o = pi * 3
        const m = slot.model
        const n = slot.n
        const mx = m.nrm[o]
        const my = m.nrm[o + 1]
        const mz = m.nrm[o + 2]
        let nx = n[0] * mx + n[1] * my + n[2] * mz
        let ny = n[3] * mx + n[4] * my + n[5] * mz
        let nz = n[6] * mx + n[7] * my + n[8] * mz
        const nl = Math.hypot(nx, ny, nz) || 1
        nx /= nl
        ny /= nl
        nz /= nl
        if (nz < 0) {
          nx = -nx
          ny = -ny
          nz = -nz
        }
        const lambert = Math.max(0, nx * lx + ny * ly + nz * lz)
        const litV = cfg.ambient + (1 - cfg.ambient) * lambert
        let val = st.emissive > 0 ? litV * (1 - st.emissive) + m.lum[pi] * st.emissive : litV
        const depthN = Math.min(1, Math.max(0, (zbuf[id] + fit) * invFit))
        if (cfg.depthFade > 0) val *= 1 - cfg.depthFade * (1 - depthN)
        val = (val - 0.5) * cfg.contrast + 0.5 + cfg.brightness
        if (scanOn) {
          const dist = r / rows - scanPhase
          val += cfg.scanStrength * Math.exp(-(dist * dist) * 220)
        }
        val = val < 0 ? 0 : val > 1 ? 1 : val
        if (cfg.gamma !== 1) val = Math.pow(val, cfg.gamma)
        if (cfg.invert) val = 1 - val
        let ci = Math.round(val * (st.len - 1))
        if (cfg.shimmer > 0 && hash(id * 31 + timeBucket * 977) < cfg.shimmer) {
          ci += hash(id + timeBucket * 13) > 0.5 ? 1 : -1
          ci = ci < 0 ? 0 : ci >= st.len ? st.len - 1 : ci
        }
        gi = st.off + ci
        let cr: number
        let cg: number
        let cb: number
        if (st.source) {
          const k = 0.35 + 0.65 * val
          cr = m.col[o] * k
          cg = m.col[o + 1] * k
          cb = m.col[o + 2] * k
        } else if (st.height) {
          let hy = m.pos[o + 1] + 0.5
          hy = hy < 0 ? 0 : hy > 1 ? 1 : hy
          cr = st.dark[0] + (st.lit[0] - st.dark[0]) * hy
          cg = st.dark[1] + (st.lit[1] - st.dark[1]) * hy
          cb = st.dark[2] + (st.lit[2] - st.dark[2]) * hy
        } else {
          cr = st.dark[0] + (st.lit[0] - st.dark[0]) * val
          cg = st.dark[1] + (st.lit[1] - st.dark[1]) * val
          cb = st.dark[2] + (st.lit[2] - st.dark[2]) * val
        }
        bucket = ((cr >> 4) << 8) | ((cg >> 4) << 4) | (cb >> 4)
        if (glyphs[gi] === ' ') gi = -1
      } else if (back.length && sampleField(back, id, c, r, fieldOut)) {
        gi = fieldOut.ch
        bucket = fieldOut.bucket
      }
      if (front.length && sampleField(front, id, c, r, fieldOut)) {
        gi = fieldOut.ch
        bucket = fieldOut.bucket
      }
      if (gi < 0) continue
      this.visCell[vis] = id
      this.visChar[vis] = gi
      this.visBucket[vis] = bucket
      vis++
    }

    // Counting sort by colour so fillStyle changes stay minimal.
    const counts = this.counts
    counts.fill(0)
    for (let i = 0; i < vis; i++) counts[this.visBucket[i] + 1]++
    for (let b = 0; b < 4096; b++) counts[b + 1] += counts[b]
    for (let i = 0; i < vis; i++) this.order[counts[this.visBucket[i]]++] = i

    ctx.font = font
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    let lastBucket = -1
    for (let j = 0; j < vis; j++) {
      const i = this.order[j]
      const b = this.visBucket[i]
      if (b !== lastBucket) {
        lastBucket = b
        let s = this.palette[b]
        if (!s) {
          s = `rgb(${((b >> 8) & 15) * 17},${((b >> 4) & 15) * 17},${(b & 15) * 17})`
          this.palette[b] = s
        }
        ctx.fillStyle = s
      }
      const id = this.visCell[i]
      const c = id % cols
      const r = (id / cols) | 0
      ctx.fillText(glyphs[this.visChar[i]], padX + c * cw + cw / 2, padY + r * ch + ch / 2)
    }

    this.last = { cols, rows, vis }
    return { cols, rows, points, glyphs: vis }
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    dpr: number,
    cw: number,
    ch: number,
    cols: number,
    rows: number,
    padX: number,
    padY: number,
    font: string,
    cfg: AsciiConfig,
  ) {
    const key = [width, height, dpr, cw, ch, font, cfg.gridChar, cfg.gridColor, cfg.gridOpacity].join('|')
    if (key !== this.gridKey || !this.gridCache) {
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
      for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) gctx.fillText(gc, padX + c * cw + cw / 2, padY + r * ch + ch / 2)
      this.gridCache = g
      this.gridKey = key
    }
    ctx.drawImage(this.gridCache, 0, 0, width, height)
  }
}
