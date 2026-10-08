import type { Model } from './model'
import { buildSceneModelAt, colorizeModel, makePrim, type MeshScene, type Vec3 } from './scene'
import type { CurveType, FlatType, Geom, ParticleType, SolidType, TerrainType } from './world'

// Point-cloud generators for world geometry, in object-local space (~1 unit across). `h` is the
// target sample spacing in local units. Dynamic geometry (particles, moving terrain) rewrites its
// arrays in `update(t)`. Text and image geometry need the DOM and are built by the component.

export interface GeomModel {
  model: Model
  /** Rewrites positions / normals / brightness for time `t` (dynamic geometry only). */
  update?: (t: number) => void
}

const TAU = Math.PI * 2

// ---------- noise ----------

function ihash(x: number, y: number, z: number, seed: number): number {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(z | 0, 2147483647) ^ Math.imul(seed | 0, 1274126177)
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  h ^= h >>> 16
  return (h >>> 0) / 4294967296
}

const fade = (t: number) => t * t * (3 - 2 * t)

/** Smooth value noise in [0, 1]. */
export function noise3(x: number, y: number, z: number, seed = 0): number {
  const xi = Math.floor(x)
  const yi = Math.floor(y)
  const zi = Math.floor(z)
  const u = fade(x - xi)
  const v = fade(y - yi)
  const w = fade(z - zi)
  const l = (a: number, b: number, t: number) => a + (b - a) * t
  const c = (dx: number, dy: number, dz: number) => ihash(xi + dx, yi + dy, zi + dz, seed)
  return l(
    l(l(c(0, 0, 0), c(1, 0, 0), u), l(c(0, 1, 0), c(1, 1, 0), u), v),
    l(l(c(0, 0, 1), c(1, 0, 1), u), l(c(0, 1, 1), c(1, 1, 1), u), v),
    w,
  )
}

/** Fractal value noise in [0, 1]. */
export function fbm3(x: number, y: number, z: number, octaves = 4, seed = 0): number {
  let sum = 0
  let amp = 0.5
  let norm = 0
  let f = 1
  for (let o = 0; o < octaves; o++) {
    sum += amp * noise3(x * f, y * f, z * f, seed + o * 17)
    norm += amp
    amp *= 0.5
    f *= 2.03
  }
  return sum / norm
}

/** Deterministic PRNG (mulberry32). */
export function rng(seed: number): () => number {
  let a = (Math.floor(seed * 9973) ^ 0x9e3779b9) >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// ---------- buffers ----------

class Buf {
  pos: number[] = []
  nrm: number[] = []
  lum: number[] = []
  push(x: number, y: number, z: number, nx: number, ny: number, nz: number, l = 1) {
    this.pos.push(x, y, z)
    this.nrm.push(nx, ny, nz)
    this.lum.push(l)
  }
  model(): Model {
    return finish(Float32Array.from(this.pos), Float32Array.from(this.nrm), Float32Array.from(this.lum))
  }
}

function finish(pos: Float32Array, nrm: Float32Array, lum: Float32Array): Model {
  const count = lum.length
  let r2 = 0
  for (let i = 0; i < count * 3; i += 3) r2 = Math.max(r2, pos[i] ** 2 + pos[i + 1] ** 2 + pos[i + 2] ** 2)
  return { count, pos, nrm, lum, col: new Uint8Array(count * 3).fill(255), radius: Math.max(0.05, Math.sqrt(r2)) }
}

function alloc(count: number): Model {
  return { count, pos: new Float32Array(count * 3), nrm: new Float32Array(count * 3), lum: new Float32Array(count).fill(1), col: new Uint8Array(count * 3).fill(255), radius: 0.87 }
}

// ---------- 2D shapes ----------

const len = Math.hypot
const fmod = (a: number, b: number) => ((a % b) + b) % b

function sdBox(x: number, y: number, bx: number, by: number, r = 0): number {
  const qx = Math.abs(x) - bx + r
  const qy = Math.abs(y) - by + r
  return len(Math.max(qx, 0), Math.max(qy, 0)) + Math.min(Math.max(qx, qy), 0) - r
}

function sdPolygon(x: number, y: number, r: number, n: number): number {
  const an = Math.PI / n
  const bn = fmod(Math.atan2(x, y), 2 * an) - an
  const l = len(x, y)
  let px = l * Math.cos(bn) - r * Math.cos(an)
  let py = l * Math.abs(Math.sin(bn)) - r * Math.sin(an)
  py += Math.min(Math.max(-py, 0), r * Math.sin(an))
  return len(px, py) * Math.sign(px)
}

function sdStar(x: number, y: number, r: number, n: number, m: number): number {
  const an = Math.PI / n
  const en = Math.PI / m
  const acx = Math.cos(an)
  const acy = Math.sin(an)
  const ecx = Math.cos(en)
  const ecy = Math.sin(en)
  const bn = fmod(Math.atan2(x, y), 2 * an) - an
  const l = len(x, y)
  let px = l * Math.cos(bn) - r * acx
  let py = l * Math.abs(Math.sin(bn)) - r * acy
  const k = Math.min(Math.max(-(px * ecx + py * ecy), 0), (r * acy) / ecy)
  px += ecx * k
  py += ecy * k
  return len(px, py) * Math.sign(px)
}

function sdHeart(x: number, y: number): number {
  x = Math.abs(x)
  if (y + x > 1) return len(x - 0.25, y - 0.75) - Math.SQRT2 / 4
  const a = (x - 0) ** 2 + (y - 1) ** 2
  const m = 0.5 * Math.max(x + y, 0)
  const b = (x - m) ** 2 + (y - m) ** 2
  return Math.sqrt(Math.min(a, b)) * Math.sign(x - y)
}

function sdVesica(x: number, y: number, w: number): number {
  // Vertical petal 1 unit tall, `w` wide.
  const b = 0.5
  const hw = Math.max(0.02, w / 2)
  const r = (hw + (b * b) / hw) / 2
  const d = r - hw
  x = Math.abs(x)
  y = Math.abs(y)
  return (y - b) * d > x * b ? len(x, y - b) : len(x + d, y) - r
}

function sdTriangle(x: number, y: number, r: number): number {
  const k = Math.sqrt(3)
  let px = Math.abs(x) - r
  let py = y + r / k
  if (px + k * py > 0) {
    const nx = (px - k * py) / 2
    const ny = (-k * px - py) / 2
    px = nx
    py = ny
  }
  px -= Math.min(Math.max(px, -2 * r), 0)
  return -len(px, py) * Math.sign(py)
}

/** Signed distance of a unit 2D shape (≈1 across, centred). */
export function flatSdf(type: FlatType, sides: number, inner: number, round: number): (x: number, y: number) => number {
  switch (type) {
    case 'circle':
      return (x, y) => len(x, y) - 0.5
    case 'ring': {
      const mid = (0.5 + inner * 0.5) / 2
      const hw = (0.5 - inner * 0.5) / 2
      return (x, y) => Math.abs(len(x, y) - mid) - hw
    }
    case 'rect':
      return (x, y) => sdBox(x, y, 0.5, 0.5, Math.min(0.5, round))
    case 'polygon':
      return (x, y) => sdPolygon(x, y, 0.5 - round, Math.max(3, sides)) - round
    case 'star': {
      const n = Math.max(3, sides)
      const m = 2 + Math.min(0.999, Math.max(0, inner)) * (n - 2)
      return (x, y) => sdStar(x, y, 0.5, n, m) - round
    }
    case 'heart':
      return (x, y) => sdHeart(x * 1.25, y * 1.25 + 0.6) / 1.25
    case 'moon': {
      const o = 0.1 + 0.55 * inner
      return (x, y) => Math.max(len(x, y) - 0.5, -(len(x - o, y - o * 0.25) - 0.46))
    }
    case 'petal':
      return (x, y) => sdVesica(x, y, Math.max(0.05, inner))
    case 'cross': {
      const t = 0.08 + 0.22 * inner
      return (x, y) => Math.min(sdBox(x, y, 0.5, t, round), sdBox(x, y, t, 0.5, round))
    }
    case 'triangle':
      return (x, y) => sdTriangle(x, y + 0.08, 0.5) - round
  }
}

function buildFlat(g: Extract<Geom, { kind: 'flat' }>, hv: Vec3): Model {
  const sdf = flatSdf(g.type, g.sides, g.inner, g.round)
  const out = new Buf()
  const ext = 0.62
  const nx = Math.min(700, Math.ceil((2 * ext) / hv[0]))
  const ny = Math.min(700, Math.ceil((2 * ext) / hv[1]))
  const sx = (2 * ext) / nx
  const sy = (2 * ext) / ny
  const step = Math.min(sx, sy)
  const e = step * 0.5
  const halfD = g.depth / 2
  const tiltMax = 1.25
  for (let j = 0; j < ny; j++) {
    const y = -ext + (j + 0.5) * sy
    for (let i = 0; i < nx; i++) {
      const x = -ext + (i + 0.5) * sx
      const d = sdf(x, y)
      if (d > 0) continue
      let gx = sdf(x + e, y) - sdf(x - e, y)
      let gy = sdf(x, y + e) - sdf(x, y - e)
      const gl = len(gx, gy) || 1
      gx /= gl
      gy /= gl
      let nx = 0
      let ny = 0
      let nz = 1
      if (g.bevel > 0 && d > -g.bevel) {
        const a = (1 + d / g.bevel) * tiltMax
        const s = Math.sin(a)
        nx = gx * s
        ny = gy * s
        nz = Math.cos(a)
      }
      out.push(x, y, halfD, nx, ny, nz)
      if (g.depth > 0) {
        out.push(x, y, -halfD, nx, ny, -nz)
        if (d > -Math.max(sx, sy) * 1.2) {
          const steps = Math.max(1, Math.min(200, Math.ceil(g.depth / hv[2])))
          for (let s = 1; s < steps; s++) out.push(x, y, -halfD + (g.depth * s) / steps, gx, gy, 0)
        }
      }
    }
  }
  return out.model()
}

// ---------- solids / sculpt ----------

const sculptCache = new WeakMap<object, Map<number, Model>>()

function buildSculpt(scene: MeshScene, h: number): Model {
  let byH = sculptCache.get(scene)
  if (!byH) sculptCache.set(scene, (byH = new Map()))
  const hit = byH.get(h)
  if (hit) return hit
  const m = colorizeModel(buildSceneModelAt(scene, h), scene.paint)
  byH.set(h, m)
  return m
}

/**
 * A unit solid (same shapes as the modeller: sphere r 0.5, box 1, cylinder / cone r 0.5 h 1 along
 * Y, torus R 0.35 r 0.15 in XZ) sampled straight from its parametric surface with per-axis spacing
 * `hv`, so stretched shapes (logs, towers, slabs) get no more points than they need.
 */
export function buildSolid(type: SolidType, hv: Vec3): Model {
  const out = new Buf()
  const [qx, qy, qz] = [1 / hv[0], 1 / hv[1], 1 / hv[2]]
  const qxz = Math.max(qx, qz)
  const cnt = (n: number) => Math.max(3, Math.min(2000, Math.ceil(n * 1.05) + 1))
  const disc = (y: number, ny: number, r: number) => {
    const nx = cnt(2 * r * qx)
    const nz = cnt(2 * r * qz)
    for (let i = 0; i < nx; i++) {
      const x = -r + ((i + 0.5) * 2 * r) / nx
      for (let j = 0; j < nz; j++) {
        const z = -r + ((j + 0.5) * 2 * r) / nz
        if (x * x + z * z <= r * r) out.push(x, y, z, 0, ny, 0)
      }
    }
  }
  switch (type) {
    case 'sphere': {
      const rings = cnt(Math.PI * 0.5 * Math.max(qy, qxz))
      for (let i = 0; i < rings; i++) {
        const th = (Math.PI * (i + 0.5)) / rings
        const st = Math.sin(th)
        const ct = Math.cos(th)
        const around = cnt(2 * Math.PI * 0.5 * st * qxz)
        for (let k = 0; k < around; k++) {
          const ph = (TAU * (k + (i % 2) * 0.5)) / around
          const nx = st * Math.cos(ph)
          const nz = st * Math.sin(ph)
          out.push(0.5 * nx, 0.5 * ct, 0.5 * nz, nx, ct, nz)
        }
      }
      break
    }
    case 'box': {
      const face = (axis: number, sign: number) => {
        const [u, v] = axis === 0 ? [1, 2] : axis === 1 ? [0, 2] : [0, 1]
        const q = [qx, qy, qz]
        const nu = cnt(q[u])
        const nv = cnt(q[v])
        for (let i = 0; i < nu; i++) {
          for (let j = 0; j < nv; j++) {
            const p = [0, 0, 0]
            const n = [0, 0, 0]
            p[axis] = 0.5 * sign
            n[axis] = sign
            p[u] = -0.5 + (i + 0.5) / nu
            p[v] = -0.5 + (j + 0.5) / nv
            out.push(p[0], p[1], p[2], n[0], n[1], n[2])
          }
        }
      }
      for (let a = 0; a < 3; a++) {
        face(a, 1)
        face(a, -1)
      }
      break
    }
    case 'cylinder':
    case 'cone': {
      const cone = type === 'cone'
      const rows = cnt(qy * (cone ? 1.12 : 1))
      const sl = Math.hypot(0.5, 1)
      for (let i = 0; i < rows; i++) {
        const y = -0.5 + (i + 0.5) / rows
        const r = cone ? 0.5 * (0.5 - y) : 0.5
        const around = cnt(TAU * r * qxz)
        for (let k = 0; k < around; k++) {
          const ph = (TAU * (k + (i % 2) * 0.5)) / around
          const c = Math.cos(ph)
          const sn = Math.sin(ph)
          if (cone) out.push(r * c, y, r * sn, c / sl * 1, 0.5 / sl, sn / sl)
          else out.push(r * c, y, r * sn, c, 0, sn)
        }
      }
      disc(-0.5, -1, 0.5)
      if (!cone) disc(0.5, 1, 0.5)
      break
    }
    case 'torus': {
      const R = 0.35
      const r = 0.15
      const nu = cnt(TAU * (R + r) * qxz)
      const nv = cnt(TAU * r * Math.max(qxz, qy))
      for (let i = 0; i < nu; i++) {
        const u = (TAU * i) / nu
        for (let j = 0; j < nv; j++) {
          const v = (TAU * (j + (i % 2) * 0.5)) / nv
          const nx = Math.cos(v) * Math.cos(u)
          const ny = Math.sin(v)
          const nz = Math.cos(v) * Math.sin(u)
          out.push((R + r * Math.cos(v)) * Math.cos(u), r * ny, (R + r * Math.cos(v)) * Math.sin(u), nx, ny, nz)
        }
      }
      break
    }
  }
  const m = out.model()
  return m
}

// ---------- curves ----------

export function curvePoint(type: CurveType, turns: number, p: number, q: number, u: number, strand = 0, strands = 1): [number, number, number] {
  switch (type) {
    case 'helix': {
      const a = TAU * turns * u + (TAU * strand) / strands
      return [0.32 * Math.cos(a), u - 0.5, 0.32 * Math.sin(a)]
    }
    case 'knot': {
      const a = TAU * u
      const r = 0.28 + 0.13 * Math.cos(q * a)
      return [r * Math.cos(p * a), 0.13 * Math.sin(q * a), r * Math.sin(p * a)]
    }
    case 'lissajous': {
      const a = TAU * u
      return [0.45 * Math.sin(p * a + Math.PI / 2), 0.45 * Math.sin(q * a), 0.3 * Math.sin((p + q) * a * 0.5)]
    }
    case 'spiral': {
      const a = TAU * turns * u
      const r = 0.04 + 0.46 * u
      return [r * Math.cos(a), r * Math.sin(a), 0]
    }
    case 'circle': {
      const a = TAU * u
      return [0.45 * Math.cos(a), 0, 0.45 * Math.sin(a)]
    }
  }
}

function buildCurve(g: Extract<Geom, { kind: 'curve' }>, h: number): Model {
  const strands = g.type === 'helix' ? Math.max(1, Math.min(6, g.p)) : 1
  const closed = g.type === 'knot' || g.type === 'lissajous' || g.type === 'circle'
  const out = new Buf()
  for (let s = 0; s < strands; s++) {
    const at = (u: number) => curvePoint(g.type, g.turns, g.p, g.q, u, s, strands)
    let length = 0
    let prev = at(0)
    for (let i = 1; i <= 400; i++) {
      const c = at(i / 400)
      length += len(c[0] - prev[0], c[1] - prev[1], c[2] - prev[2])
      prev = c
    }
    const along = Math.min(20000, Math.max(8, Math.ceil(length / h)))
    const around = g.tube < h * 0.6 ? 1 : Math.min(64, Math.max(4, Math.ceil((TAU * g.tube) / h)))
    for (let i = 0; i < along; i++) {
      const u = closed ? i / along : i / (along - 1)
      const c = at(u)
      const d = 1e-3
      const a = at(Math.max(0, u - d))
      const b = at(Math.min(1, u + d))
      let tx = b[0] - a[0]
      let ty = b[1] - a[1]
      let tz = b[2] - a[2]
      const tl = len(tx, ty, tz) || 1
      tx /= tl
      ty /= tl
      tz /= tl
      // Frame: N ⟂ T from a reference axis that is not parallel to T.
      let rx = 0
      let ry = 1
      let rz = 0
      if (Math.abs(ty) > 0.9) {
        rx = 1
        ry = 0
      }
      let nx = ty * rz - tz * ry
      let ny = tz * rx - tx * rz
      let nz = tx * ry - ty * rx
      const nl = len(nx, ny, nz) || 1
      nx /= nl
      ny /= nl
      nz /= nl
      const bx = ty * nz - tz * ny
      const by = tz * nx - tx * nz
      const bz = tx * ny - ty * nx
      if (around === 1) {
        out.push(c[0], c[1], c[2], bx, by, bz)
        continue
      }
      for (let k = 0; k < around; k++) {
        const th = (TAU * k) / around
        const cs = Math.cos(th)
        const sn = Math.sin(th)
        const ox = nx * cs + bx * sn
        const oy = ny * cs + by * sn
        const oz = nz * cs + bz * sn
        out.push(c[0] + ox * g.tube, c[1] + oy * g.tube, c[2] + oz * g.tube, ox, oy, oz)
      }
    }
  }
  return out.model()
}

// ---------- terrain ----------

const OCEAN_WAVES = [
  // dir x, dir z, wavelength factor, amplitude, speed, phase
  [1, 0.2, 1, 0.5, 1, 0],
  [0.8, -0.6, 1.7, 0.25, 1.3, 1.3],
  [0.6, 0.8, 2.6, 0.14, 1.7, 2.1],
  [-0.3, 1, 3.7, 0.08, 2.1, 0.4],
  [0.95, 0.3, 5.3, 0.05, 2.9, 4.2],
]

export function terrainHeight(type: TerrainType, amp: number, freq: number, seed: number, x: number, z: number, t: number): number {
  switch (type) {
    case 'hills': {
      const n = fbm3(x * freq + t, z * freq, seed * 7.31, 5, seed)
      return amp * (Math.pow(n, 1.6) * 2.4 - 0.6)
    }
    case 'mountains': {
      // Ridged fractal: sharp crests, soft valleys.
      let sum = 0
      let a = 0.5
      let f = 1
      let norm = 0
      for (let o = 0; o < 5; o++) {
        const n = 1 - Math.abs(2 * noise3((x * freq + t) * f, z * freq * f, seed * 3.7 + o, seed + o * 13) - 1)
        sum += a * n * n
        norm += a
        a *= 0.5
        f *= 2.1
      }
      return amp * ((sum / norm) * 2 - 0.55)
    }
    case 'dunes': {
      const s = x * freq + 0.9 * noise3(x * 1.7 + t, z * 1.7, seed, seed) + z * 0.35
      return amp * Math.pow(0.5 + 0.5 * Math.sin(TAU * s), 2.2)
    }
    case 'ocean': {
      let y = 0
      for (const [dx, dz, wl, a, sp, ph] of OCEAN_WAVES) y += a * Math.sin(TAU * (dx * x + dz * z) * freq * wl * 0.5 - t * sp * 2.2 + ph + seed)
      return amp * y
    }
  }
}

/** Ocean height and slope in one pass (analytic derivatives: cheap enough to redo every frame). */
function oceanAt(amp: number, freq: number, seed: number, x: number, z: number, t: number, out: Float64Array) {
  let y = 0
  let dx = 0
  let dz = 0
  for (const [wx, wz, wl, a, sp, ph] of OCEAN_WAVES) {
    const k = TAU * freq * wl * 0.5
    const th = k * (wx * x + wz * z) - t * sp * 2.2 + ph + seed
    y += a * Math.sin(th)
    const c = a * Math.cos(th) * k
    dx += c * wx
    dz += c * wz
  }
  out[0] = amp * y
  out[1] = amp * dx
  out[2] = amp * dz
}

function buildTerrain(g: Extract<Geom, { kind: 'terrain' }>, hx: number, hz: number): GeomModel {
  const moving = g.speed !== 0
  // Moving terrain is recomputed every frame, so it gets a smaller budget.
  const cap = moving ? 260 : 420
  let nx = Math.max(8, Math.min(cap, Math.ceil(1 / hx)))
  let nz = Math.max(8, Math.min(cap, Math.ceil(1 / hz)))
  const budget = moving ? 52_000 : 140_000
  if (nx * nz > budget) {
    const k = Math.sqrt(budget / (nx * nz))
    nx = Math.max(8, Math.floor(nx * k))
    nz = Math.max(8, Math.floor(nz * k))
  }
  const model = alloc(nx * nz)
  const sx = 1 / nx
  const sz = 1 / nz
  const tmp = new Float64Array(3)
  const write = (t: number) => {
    const { pos, nrm, lum } = model
    const tt = g.type === 'ocean' ? t * g.speed : t * g.speed * 0.15
    const e = Math.min(sx, sz)
    let k = 0
    let lo = Infinity
    let hi = -Infinity
    for (let j = 0; j < nz; j++) {
      const z = -0.5 + (j + 0.5) * sz
      for (let i = 0; i < nx; i++) {
        const x = -0.5 + (i + 0.5) * sx
        let y: number
        let dx: number
        let dz: number
        if (g.type === 'ocean') {
          oceanAt(g.amp, g.freq, g.seed, x, z, tt, tmp)
          y = tmp[0]
          dx = tmp[1]
          dz = tmp[2]
        } else {
          y = terrainHeight(g.type, g.amp, g.freq, g.seed, x, z, tt)
          dx = (terrainHeight(g.type, g.amp, g.freq, g.seed, x + e, z, tt) - y) / e
          dz = (terrainHeight(g.type, g.amp, g.freq, g.seed, x, z + e, tt) - y) / e
        }
        const nl = len(dx, 1, dz)
        const o = k * 3
        pos[o] = x
        pos[o + 1] = y
        pos[o + 2] = z
        nrm[o] = -dx / nl
        nrm[o + 1] = 1 / nl
        nrm[o + 2] = -dz / nl
        lum[k] = y
        if (y < lo) lo = y
        if (y > hi) hi = y
        k++
      }
    }
    // Brightness = normalised height (used when the material is self-lit).
    const span = hi - lo || 1
    for (let i = 0; i < k; i++) lum[i] = 0.25 + (0.75 * (lum[i] - lo)) / span
  }
  write(0)
  model.radius = 0.75
  return { model, update: moving ? write : undefined }
}

// ---------- particles ----------

const wrap = (v: number) => fmod(v + 0.5, 1) - 0.5

function buildParticles(g: Extract<Geom, { kind: 'particles' }>): GeomModel {
  const count = g.count
  const per = g.type === 'rain' ? 4 : 1
  const model = alloc(count * per)
  const r = rng(g.seed)
  const seeds = new Float32Array(count * 5)
  for (let i = 0; i < seeds.length; i++) seeds[i] = r()
  const type: ParticleType = g.type
  const sp = g.speed
  const write = (t: number) => {
    const { pos, nrm, lum } = model
    for (let i = 0; i < count; i++) {
      const s0 = seeds[i * 5]
      const s1 = seeds[i * 5 + 1]
      const s2 = seeds[i * 5 + 2]
      const s3 = seeds[i * 5 + 3]
      const s4 = seeds[i * 5 + 4]
      let x = s0 - 0.5
      let y = s1 - 0.5
      let z = s2 - 0.5
      let l = 1
      switch (type) {
        case 'stars': {
          // On a shell, brightness skewed so few stars are bright.
          const th = TAU * s0
          const ph = Math.acos(2 * s1 - 1)
          const rr = 0.5 * (0.85 + 0.15 * s4)
          x = rr * Math.sin(ph) * Math.cos(th)
          y = rr * Math.cos(ph)
          z = rr * Math.sin(ph) * Math.sin(th)
          l = (0.25 + 0.75 * Math.pow(s3, 3)) * (0.65 + 0.35 * Math.sin(TAU * (t * sp * (0.3 + s4) + s3)))
          break
        }
        case 'snow':
          y = wrap(s1 - t * sp * 0.08 * (0.5 + s3))
          x = s0 - 0.5 + 0.03 * Math.sin(TAU * (t * sp * 0.25 * (0.5 + s4) + s3))
          l = 0.45 + 0.55 * s4
          break
        case 'rain':
          y = wrap(s1 - t * sp * 0.9 * (0.75 + 0.5 * s3))
          l = 0.4 + 0.6 * s4
          break
        case 'fireflies': {
          const w = t * sp * 0.15
          x = s0 - 0.5 + 0.07 * Math.sin(TAU * (w * (0.6 + s3) + s4))
          y = s1 - 0.5 + 0.05 * Math.sin(TAU * (w * (0.8 + s4) + s3 * 2))
          z = s2 - 0.5 + 0.07 * Math.cos(TAU * (w * (0.7 + s3) + s4))
          l = Math.pow(0.5 + 0.5 * Math.sin(TAU * (t * sp * 0.3 * (0.5 + s3) + s4)), 4)
          break
        }
        case 'embers': {
          const rise = fmod(s1 + t * sp * 0.12 * (0.5 + s3), 1)
          y = rise - 0.5
          x = (s0 - 0.5) * (1 - rise * 0.6) + 0.05 * Math.sin(TAU * (rise * 2 + s4))
          z = (s2 - 0.5) * (1 - rise * 0.6)
          l = (1 - rise) * (0.6 + 0.4 * Math.sin(TAU * (t * 3 + s4)))
          break
        }
        case 'galaxy': {
          const arms = 3
          const rad = 0.5 * Math.pow(s0, 0.7)
          const arm = Math.floor(s1 * arms)
          const scatter = (s2 - 0.5) * 0.5 * (0.3 + rad)
          const a = (TAU * arm) / arms + rad * 9 + scatter + t * sp * 0.25 * (0.4 + 0.12 / (rad + 0.08))
          x = rad * Math.cos(a)
          z = rad * Math.sin(a)
          y = (s3 - 0.5) * 0.08 * (1 - rad * 1.6) * (s4 < 0.3 ? 2 : 1)
          l = Math.min(1, 0.25 + 0.85 * Math.exp(-rad * 6) + 0.25 * s4)
          break
        }
        case 'ring': {
          const rad = 0.3 + 0.2 * s0
          const a = TAU * s1 + (t * sp * 0.2) / rad
          x = rad * Math.cos(a)
          z = rad * Math.sin(a)
          y = (s2 - 0.5) * 0.01
          l = 0.35 + 0.65 * Math.pow(Math.sin(rad * 70 + s3 * 0.6), 2)
          break
        }
        case 'dust': {
          const w = t * sp * 0.03
          x = wrap(s0 + w * (s3 - 0.5))
          y = wrap(s1 + 0.04 * Math.sin(TAU * (w + s4)))
          z = wrap(s2 + w * (s4 - 0.5))
          l = 0.2 + 0.4 * s3
          break
        }
      }
      for (let k = 0; k < per; k++) {
        const o = (i * per + k) * 3
        pos[o] = x
        pos[o + 1] = y + k * 0.012
        pos[o + 2] = z
        nrm[o] = 0
        nrm[o + 1] = 0
        nrm[o + 2] = 1
        lum[i * per + k] = l * (1 - k / (per + 1))
      }
    }
  }
  write(0)
  return { model, update: sp !== 0 ? write : undefined }
}

// ---------- entry ----------

/** True when the geometry changes over time (rebuilt each frame via `update`). */
export function isDynamic(g: Geom): boolean {
  return (g.kind === 'particles' && g.speed !== 0) || (g.kind === 'terrain' && g.speed !== 0)
}

/**
 * Local-space points for a geometry at per-axis spacing `hv` (a number = same on every axis).
 * Null for text / image (built in the browser).
 */
export function buildGeom(g: Geom, hv: Vec3 | number): GeomModel | null {
  const v: Vec3 = typeof hv === 'number' ? [hv, hv, hv] : hv
  const iso = Math.min(v[0], v[1], v[2])
  switch (g.kind) {
    case 'shape':
      return { model: buildSolid(g.type, v) }
    case 'sculpt':
      return { model: buildSculpt(g.scene, iso) }
    case 'flat':
      return { model: buildFlat(g, v) }
    case 'curve':
      return { model: buildCurve(g, [...v].sort((x, y) => x - y)[1]) }
    case 'terrain':
      return buildTerrain(g, v[0], v[2])
    case 'particles':
      return buildParticles(g)
    default:
      return null
  }
}
