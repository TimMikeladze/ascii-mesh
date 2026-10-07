import type { Model } from './model'

// A user-built 3D scene: SDF primitives (add / subtract with smooth blending), sculpt dabs,
// imported triangle meshes and voxel paint. `buildSceneModel` turns it into the same point
// cloud the ASCII renderer draws for images.

export type PrimType = 'sphere' | 'box' | 'cylinder' | 'torus' | 'cone' | 'mesh'
export type ShapeOp = 'add' | 'subtract'
export type Vec3 = [number, number, number]

export interface Prim {
  id: string
  type: PrimType
  op: ShapeOp
  pos: Vec3
  /** Euler degrees, applied X then Y then Z. */
  rot: Vec3
  scale: Vec3
  color: string
  /** Key into `MeshScene.meshes` when `type === 'mesh'`. */
  meshId?: string
}

/** One sculpt brush blob: a sphere smooth-added to or carved from the surface. */
export interface Dab {
  p: Vec3
  r: number
  op: ShapeOp
  color: string
}

export interface ImportedMesh {
  name: string
  /** 9 floats per triangle, normalised to a unit box around the origin. */
  tris: Float32Array
}

export interface MeshScene {
  prims: Prim[]
  dabs: Dab[]
  /** Paint voxel key (see `paintKey`) -> 0xRRGGBB. */
  paint: Record<number, number>
  /** Smooth-blend radius between shapes, world units. 0 = hard CSG. */
  blend: number
  meshes: Record<string, ImportedMesh>
}

export interface SceneModel extends Model {
  /** Index into `scene.prims` that produced each point, or -1 (sculpt dabs). */
  prim: Int32Array
  /** Unpainted colour per point. */
  base: Uint8Array
  /** Sample spacing the model was built with (reused by incremental updates). */
  h: number
  /** Resolution knob the model was built for. */
  res: number
}

export const PRIM_TYPES: { type: Exclude<PrimType, 'mesh'>; label: string }[] = [
  { type: 'sphere', label: 'Sphere' },
  { type: 'box', label: 'Box' },
  { type: 'cylinder', label: 'Cylinder' },
  { type: 'torus', label: 'Torus' },
  { type: 'cone', label: 'Cone' },
]

export const PAINT_CELL = 0.02
const POINT_BUDGET = 420_000
const GRID = 40
const BOX_ROUND = 0.03

let idCounter = 0
export function newId(): string {
  idCounter = (idCounter + 1) % 1e6
  return `${Date.now().toString(36)}${idCounter.toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function makePrim(type: Exclude<PrimType, 'mesh'>, patch: Partial<Prim> = {}): Prim {
  return { id: newId(), type, op: 'add', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: '#e4e4e4', ...patch }
}

export function starterScene(): MeshScene {
  return {
    prims: [
      makePrim('sphere', { pos: [0, 0.22, 0], scale: [0.9, 0.9, 0.9] }),
      makePrim('box', { pos: [0, -0.28, 0], scale: [1.1, 0.36, 1.1] }),
      makePrim('cylinder', { op: 'subtract', pos: [0, 0.22, 0], rot: [90, 0, 0], scale: [0.36, 1.4, 0.36], color: '#8a8a8a' }),
    ],
    dabs: [],
    paint: {},
    blend: 0.12,
    meshes: {},
  }
}

export function emptyScene(): MeshScene {
  return { prims: [], dabs: [], paint: {}, blend: 0.08, meshes: {} }
}

// ---------- colour helpers ----------

export function hexToInt(hex: string): number {
  let h = hex.replace('#', '')
  if (h.length === 3) h = h.split('').map((c) => c + c).join('')
  return parseInt(h.padEnd(6, '0').slice(0, 6), 16) || 0
}

export function intToHex(v: number): string {
  return `#${(v & 0xffffff).toString(16).padStart(6, '0')}`
}

// ---------- transforms ----------

interface Shape {
  kind: number // 0 sphere 1 box 2 cylinder 3 torus 4 cone
  op: ShapeOp
  /** world -> local rotation (transpose of local -> world). */
  m: Float64Array
  pos: Vec3
  inv: Vec3
  minScale: number
  center: Vec3
  bound: number
  color: number
  prim: number
  /** Unrotated sphere of radius `bound` (sculpt dabs) — evaluated without the matrix. */
  ball: boolean
  /** Smooth-blend radius used when this shape joins the field. */
  k: number
  /** The prim or dab this shape came from (sample cache key). */
  src: object
}

/** Bounding-sphere radius of each local unit shape. */
const LOCAL_BOUND = [0.5, 0.87, 0.71, 0.5, 0.71]

/** World-space bounding radius of a prim around its `pos`. */
export function primBound(p: Prim): number {
  const k = p.type === 'mesh' ? 0.87 : LOCAL_BOUND[KIND[p.type]]
  return k * Math.max(...p.scale.map(Math.abs))
}

const KIND: Record<Exclude<PrimType, 'mesh'>, number> = { sphere: 0, box: 1, cylinder: 2, torus: 3, cone: 4 }

/** Row-major local -> world rotation for Euler degrees (X, then Y, then Z). */
export function rotationMatrix(rot: Vec3): Float64Array {
  const d = Math.PI / 180
  const [cx, cy, cz] = rot.map((a) => Math.cos(a * d))
  const [sx, sy, sz] = rot.map((a) => Math.sin(a * d))
  // Rz * Ry * Rx
  return Float64Array.of(
    cz * cy, cz * sy * sx - sz * cx, cz * sy * cx + sz * sx,
    sz * cy, sz * sy * sx + cz * cx, sz * sy * cx - cz * sx,
    -sy, cy * sx, cy * cx,
  )
}

function toShape(p: Prim, index: number, k: number): Shape {
  const r = rotationMatrix(p.rot)
  const s = p.scale.map((v) => Math.max(1e-3, Math.abs(v))) as Vec3
  const kind = KIND[p.type as Exclude<PrimType, 'mesh'>]
  return {
    kind,
    op: p.op,
    m: Float64Array.of(r[0], r[3], r[6], r[1], r[4], r[7], r[2], r[5], r[8]),
    pos: p.pos,
    inv: [1 / s[0], 1 / s[1], 1 / s[2]],
    minScale: Math.min(s[0], s[1], s[2]),
    center: p.pos,
    bound: LOCAL_BOUND[kind] * Math.max(s[0], s[1], s[2]),
    color: hexToInt(p.color),
    prim: index,
    ball: false,
    k,
    src: p,
  }
}

// Dabs overlap heavily along a stroke; chained smooth-mins with a large k would swell the surface
// far past every dab, so a dab's blend is capped relative to its size.
function dabShape(d: Dab, k: number): Shape {
  return {
    kind: 0,
    op: d.op,
    m: Float64Array.of(1, 0, 0, 0, 1, 0, 0, 0, 1),
    pos: d.p,
    inv: [0.5 / d.r, 0.5 / d.r, 0.5 / d.r],
    minScale: 2 * d.r,
    center: d.p,
    bound: d.r,
    color: hexToInt(d.color),
    prim: -1,
    ball: true,
    k: Math.min(k, d.r * 0.6),
    src: d,
  }
}

// ---------- SDFs (local unit shapes, ~1 unit across) ----------

function sdLocal(kind: number, x: number, y: number, z: number): number {
  switch (kind) {
    case 0:
      return Math.hypot(x, y, z) - 0.5
    case 1: {
      const e = 0.5 - BOX_ROUND
      const qx = Math.abs(x) - e
      const qy = Math.abs(y) - e
      const qz = Math.abs(z) - e
      return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - BOX_ROUND
    }
    case 2: {
      const dx = Math.hypot(x, z) - 0.5
      const dy = Math.abs(y) - 0.5
      return Math.min(Math.max(dx, dy), 0) + Math.hypot(Math.max(dx, 0), Math.max(dy, 0))
    }
    case 3:
      return Math.hypot(Math.hypot(x, z) - 0.35, y) - 0.15
    default: {
      // Capped cone, base radius 0.5 at y=-0.5, apex at y=0.5 (Inigo Quilez).
      const h = 0.5
      const r1 = 0.5
      const qx = Math.hypot(x, z)
      const qy = y
      const k2x = -r1
      const k2y = 2 * h
      const cax = qx - Math.min(qx, qy < 0 ? r1 : 0)
      const cay = Math.abs(qy) - h
      const t = Math.min(1, Math.max(0, ((0 - qx) * k2x + (h - qy) * k2y) / (k2x * k2x + k2y * k2y)))
      const cbx = qx + k2x * t
      const cby = qy - h + k2y * t
      const s = cbx < 0 && cay < 0 ? -1 : 1
      return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby))
    }
  }
}

function sdShape(s: Shape, x: number, y: number, z: number): number {
  const dx = x - s.pos[0]
  const dy = y - s.pos[1]
  const dz = z - s.pos[2]
  if (s.ball) return Math.sqrt(dx * dx + dy * dy + dz * dz) - s.bound
  const m = s.m
  const lx = (m[0] * dx + m[1] * dy + m[2] * dz) * s.inv[0]
  const ly = (m[3] * dx + m[4] * dy + m[5] * dz) * s.inv[1]
  const lz = (m[6] * dx + m[7] * dy + m[8] * dz) * s.inv[2]
  return sdLocal(s.kind, lx, ly, lz) * s.minScale
}

function smin(a: number, b: number, k: number): number {
  if (k <= 0) return Math.min(a, b)
  const h = Math.max(k - Math.abs(a - b), 0) / k
  return Math.min(a, b) - h * h * k * 0.25
}

// ---------- spatial bins ----------

class ShapeField {
  shapes: Shape[]
  k: number
  min: Vec3
  cell: number
  /** CSR bins: shapes of bin b are items[start[b] .. start[b + 1]). */
  start: Int32Array
  items: Int32Array
  win = -1

  constructor(shapes: Shape[], k: number, pad: number) {
    this.shapes = shapes
    this.k = k
    let lo = [Infinity, Infinity, Infinity]
    let hi = [-Infinity, -Infinity, -Infinity]
    for (const s of shapes) {
      for (let a = 0; a < 3; a++) {
        lo[a] = Math.min(lo[a], s.center[a] - s.bound)
        hi[a] = Math.max(hi[a], s.center[a] + s.bound)
      }
    }
    if (!shapes.length) {
      lo = [-1, -1, -1]
      hi = [1, 1, 1]
    }
    const margin = k + pad
    this.min = [lo[0] - margin, lo[1] - margin, lo[2] - margin]
    const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) + margin * 2
    this.cell = span / GRID
    const cell = this.cell
    const min = this.min
    // Visit each bin whose box intersects the shape's padded bounding sphere.
    const each = (s: Shape, fn: (b: number) => void) => {
      // Per-shape blend: small sculpt dabs only need a narrow margin.
      const r = s.bound + s.k + pad
      const lo3 = [0, 1, 2].map((a) => Math.max(0, Math.floor((s.center[a] - r - min[a]) / cell)))
      const hi3 = [0, 1, 2].map((a) => Math.min(GRID - 1, Math.floor((s.center[a] + r - min[a]) / cell)))
      const gap = (a: number, b: number) => {
        const b0 = min[a] + b * cell
        const c = s.center[a]
        return c < b0 ? b0 - c : c > b0 + cell ? c - b0 - cell : 0
      }
      for (let bx = lo3[0]; bx <= hi3[0]; bx++) {
        const gx = gap(0, bx)
        for (let by = lo3[1]; by <= hi3[1]; by++) {
          const gy = gap(1, by)
          for (let bz = lo3[2]; bz <= hi3[2]; bz++) {
            const gz = gap(2, bz)
            if (gx * gx + gy * gy + gz * gz <= r * r) fn((bx * GRID + by) * GRID + bz)
          }
        }
      }
    }
    const counts = new Int32Array(GRID * GRID * GRID + 1)
    for (const s of shapes) each(s, (b) => counts[b + 1]++)
    for (let b = 0; b < GRID * GRID * GRID; b++) counts[b + 1] += counts[b]
    this.start = counts.slice()
    this.items = new Int32Array(counts[GRID * GRID * GRID])
    shapes.forEach((s, i) => each(s, (b) => (this.items[counts[b]++] = i)))
  }

  /** Bin index for a point, or -1 outside the grid. */
  bin(x: number, y: number, z: number): number {
    const bx = Math.floor((x - this.min[0]) / this.cell)
    const by = Math.floor((y - this.min[1]) / this.cell)
    const bz = Math.floor((z - this.min[2]) / this.cell)
    if (bx < 0 || by < 0 || bz < 0 || bx >= GRID || by >= GRID || bz >= GRID) return -1
    return (bx * GRID + by) * GRID + bz
  }

  /** Scene SDF; shapes applied in list order. Sets `win` to the dominant shape. */
  eval(x: number, y: number, z: number): number {
    const b = this.bin(x, y, z)
    let d = 1e9
    let best = 1e9
    this.win = -1
    if (b < 0) return d
    const end = this.start[b + 1]
    for (let j = this.start[b]; j < end; j++) {
      const i = this.items[j]
      const s = this.shapes[i]
      if (s.op === 'add' && !s.ball) {
        // Bounding-sphere lower bound: a far add shape can't change the blended min.
        const lb = Math.hypot(x - s.center[0], y - s.center[1], z - s.center[2]) - s.bound
        if (lb > d + s.k && lb > best) continue
      }
      const v = sdShape(s, x, y, z)
      if (s.op === 'add') {
        if (v < best) {
          best = v
          this.win = i
        }
        d = smin(d, v, s.k)
      } else {
        if (-v > d) this.win = i
        d = -smin(-d, v, s.k)
      }
    }
    return d
  }

  /** Is the point strictly inside any shape's solid (used to cull imported mesh samples)? */
  inside(x: number, y: number, z: number, tol: number): boolean {
    return this.eval(x, y, z) < -tol
  }

  carved(x: number, y: number, z: number): boolean {
    const b = this.bin(x, y, z)
    if (b < 0) return false
    for (let j = this.start[b]; j < this.start[b + 1]; j++) {
      const s = this.shapes[this.items[j]]
      if (s.op === 'subtract' && sdShape(s, x, y, z) < 0) return true
    }
    return false
  }
}

// ---------- surface samplers (local space, ~unit shapes) ----------

const GOLDEN = Math.PI * (3 - Math.sqrt(5))

type Emit = (x: number, y: number, z: number) => void

function sampleDisc(n: number, y: number, r: number, emit: Emit) {
  for (let i = 0; i < n; i++) {
    const rr = r * Math.sqrt((i + 0.5) / n)
    const a = i * GOLDEN
    emit(Math.cos(a) * rr, y, Math.sin(a) * rr)
  }
}

function sampleLocal(kind: number, h: number, emit: Emit) {
  switch (kind) {
    case 0: {
      const n = Math.ceil(Math.PI / (h * h))
      for (let i = 0; i < n; i++) {
        const y = 1 - (2 * (i + 0.5)) / n
        const r = Math.sqrt(1 - y * y)
        const a = i * GOLDEN
        emit(Math.cos(a) * r * 0.5, y * 0.5, Math.sin(a) * r * 0.5)
      }
      break
    }
    case 1: {
      const n = Math.ceil(1 / h)
      for (let i = 0; i < n; i++) {
        for (let j = 0; j < n; j++) {
          const u = (i + 0.5) / n - 0.5
          const v = (j + 0.5) / n - 0.5
          emit(0.5, u, v)
          emit(-0.5, u, v)
          emit(u, 0.5, v)
          emit(u, -0.5, v)
          emit(u, v, 0.5)
          emit(u, v, -0.5)
        }
      }
      break
    }
    case 2: {
      const na = Math.ceil(Math.PI / h)
      const ny = Math.ceil(1 / h)
      for (let i = 0; i < na; i++) {
        const a = (i / na) * Math.PI * 2
        for (let j = 0; j < ny; j++) emit(Math.cos(a) * 0.5, (j + 0.5) / ny - 0.5, Math.sin(a) * 0.5)
      }
      const nd = Math.ceil((Math.PI * 0.25) / (h * h))
      sampleDisc(nd, 0.5, 0.5, emit)
      sampleDisc(nd, -0.5, 0.5, emit)
      break
    }
    case 3: {
      const R = 0.35
      const r = 0.15
      const nv = Math.ceil((2 * Math.PI * r) / h)
      for (let j = 0; j < nv; j++) {
        const v = (j / nv) * Math.PI * 2
        const ring = R + r * Math.cos(v)
        const nu = Math.max(3, Math.ceil((2 * Math.PI * ring) / h))
        for (let i = 0; i < nu; i++) {
          const u = (i / nu) * Math.PI * 2
          emit(Math.cos(u) * ring, r * Math.sin(v), Math.sin(u) * ring)
        }
      }
      break
    }
    default: {
      const rows = Math.ceil(1.12 / h)
      for (let j = 0; j < rows; j++) {
        const t = (j + 0.5) / rows
        const rr = 0.5 * (1 - t)
        const n = Math.max(3, Math.ceil((2 * Math.PI * rr) / h))
        for (let i = 0; i < n; i++) {
          const a = (i / n) * Math.PI * 2
          emit(Math.cos(a) * rr, -0.5 + t, Math.sin(a) * rr)
        }
      }
      sampleDisc(Math.ceil((Math.PI * 0.25) / (h * h)), -0.5, 0.5, emit)
    }
  }
}

const LOCAL_AREA = [Math.PI, 6, Math.PI * 1.5, 4 * Math.PI * Math.PI * 0.35 * 0.15, Math.PI * 0.25 + Math.PI * 0.5 * 1.12]

// ---------- growable buffers ----------

class Buf {
  pos: number[] = []
  nrm: number[] = []
  col: number[] = []
  prim: number[] = []
  push(x: number, y: number, z: number, nx: number, ny: number, nz: number, color: number, prim: number) {
    this.pos.push(x, y, z)
    this.nrm.push(nx, ny, nz)
    this.col.push((color >> 16) & 255, (color >> 8) & 255, color & 255)
    this.prim.push(prim)
  }
}

function sceneRadius(scene: MeshScene, shapes: Shape[]): number {
  let r = 0.3
  for (const s of shapes) r = Math.max(r, Math.hypot(...s.center) + s.bound)
  for (const p of scene.prims) {
    if (p.type !== 'mesh') continue
    r = Math.max(r, Math.hypot(...p.pos) + primBound(p))
  }
  return r
}

/** Scene signed distance function (prims + dabs; imported meshes excluded). */
export function sceneSdf(scene: MeshScene): (x: number, y: number, z: number) => number {
  const shapes: Shape[] = []
  scene.prims.forEach((p, i) => p.type !== 'mesh' && shapes.push(toShape(p, i, scene.blend)))
  for (const d of scene.dabs) shapes.push(dabShape(d, scene.blend))
  const field = new ShapeField(shapes, scene.blend, 0.05)
  return (x, y, z) => field.eval(x, y, z)
}

/** Sample spacing for a scene at the studio's resolution knob (48–288), bounded by POINT_BUDGET. */
function spacing(scene: MeshScene, shapes: Shape[], res: number): number {
  const radius = sceneRadius(scene, shapes)
  // Slightly denser than the image models: hidden walls must never show through gaps.
  const h = radius / (0.8 * res)
  let area = 0
  for (const s of shapes) area += LOCAL_AREA[s.kind] * (1 / Math.min(...s.inv)) ** 2
  for (const p of scene.prims) {
    if (p.type === 'mesh' && p.meshId && scene.meshes[p.meshId]) area += 6 * Math.max(...p.scale.map(Math.abs)) ** 2
  }
  return area / (h * h) > POINT_BUDGET ? Math.sqrt(area / POINT_BUDGET) : h
}

function sceneShapes(scene: MeshScene): Shape[] {
  const shapes: Shape[] = []
  scene.prims.forEach((p, i) => {
    if (p.type !== 'mesh') shapes.push(toShape(p, i, scene.blend))
  })
  for (const d of scene.dabs) shapes.push(dabShape(d, scene.blend))
  return shapes
}

/** Union of spheres limiting where an incremental update resamples. */
class Region {
  spheres: number[] = []
  pad: number
  constructor(pad: number) {
    this.pad = pad
  }
  add(c: Vec3, r: number) {
    this.spheres.push(c[0], c[1], c[2], r)
  }
  has(x: number, y: number, z: number, extra = 0): boolean {
    const a = this.spheres
    for (let i = 0; i < a.length; i += 4) {
      const r = a[i + 3] + extra
      const dx = x - a[i]
      const dy = y - a[i + 1]
      const dz = z - a[i + 2]
      if (dx * dx + dy * dy + dz * dz <= r * r) return true
    }
    return false
  }
  touches(c: Vec3, r: number): boolean {
    return this.has(c[0], c[1], c[2], r + this.pad)
  }
}

// World-space surface samples per prim/dab object at a given spacing. Prims and dabs are immutable
// (edits create new objects), so strokes reuse every untouched shape's samples.
const sampleCache = new WeakMap<object, { h: number; pts: Float32Array }>()

function rawSamples(s: Shape, h: number): Float32Array {
  const hit = sampleCache.get(s.src)
  if (hit && hit.h === h) return hit.pts
  const out: number[] = []
  const r = s.m // world->local; local->world is its transpose
  const sx = 1 / s.inv[0]
  const sy = 1 / s.inv[1]
  const sz = 1 / s.inv[2]
  sampleLocal(s.kind, h / Math.max(sx, sy, sz), (lx, ly, lz) => {
    const ax = lx * sx
    const ay = ly * sy
    const az = lz * sz
    out.push(
      r[0] * ax + r[3] * ay + r[6] * az + s.pos[0],
      r[1] * ax + r[4] * ay + r[7] * az + s.pos[1],
      r[2] * ax + r[5] * ay + r[8] * az + s.pos[2],
    )
  })
  const pts = Float32Array.from(out)
  sampleCache.set(s.src, { h, pts })
  return pts
}

function sampleScene(scene: MeshScene, shapes: Shape[], h: number, region: Region | null): Buf {
  const meshList: { prim: Prim; index: number; mesh: ImportedMesh }[] = []
  scene.prims.forEach((p, index) => {
    const mesh = p.type === 'mesh' && p.meshId ? scene.meshes[p.meshId] : undefined
    if (mesh) meshList.push({ prim: p, index, mesh })
  })
  const field = new ShapeField(shapes, scene.blend, h * 4)
  const out = new Buf()
  const tol = h * 1.5 + scene.blend * 0.3
  const band = tol * 3
  const e = h * 0.25
  let gx = 0
  let gy = 0
  let gz = 0
  // Tetrahedral gradient; returns the averaged distance.
  const grad = (x: number, y: number, z: number) => {
    const a = field.eval(x + e, y - e, z - e)
    const b = field.eval(x - e, y - e, z + e)
    const c = field.eval(x - e, y + e, z - e)
    const d = field.eval(x + e, y + e, z + e)
    gx = a - b - c + d
    gy = -a - b + c + d
    gz = -a + b - c + d
    return (a + b + c + d) * 0.25
  }

  for (const s of shapes) {
    if (region && !region.touches(s.center, s.bound)) continue
    const pts = rawSamples(s, h)
    for (let o = 0; o < pts.length; o += 3) {
      let x = pts[o]
      let y = pts[o + 1]
      let z = pts[o + 2]
      if (region && !region.has(x, y, z, region.pad)) continue
      // Samples within a band around the surface are walked onto it (Newton, ≤3 steps); the rest
      // are buried or carved away.
      let d = field.eval(x, y, z)
      if (Math.abs(d) > band) continue
      let ok = false
      for (let it = 0; it < 3; it++) {
        d = grad(x, y, z)
        const g2 = gx * gx + gy * gy + gz * gz
        // Degenerate gradients (ridges, shape centres) would throw the point off the surface.
        if (g2 < e * e) continue
        const k = (d * 4 * e) / g2
        if (Math.abs(k) * Math.sqrt(g2) > band) continue
        x -= gx * k
        y -= gy * k
        z -= gz * k
        if (Math.abs(d) < h * 0.3) {
          ok = true
          break
        }
      }
      if (!ok && Math.abs(field.eval(x, y, z)) > h * 0.5) continue
      field.eval(x, y, z)
      const w = field.win >= 0 ? shapes[field.win] : s
      // Incremental updates keep old points outside the region, so fresh ones must land inside it.
      if (region && !region.has(x, y, z)) continue
      const gl = Math.hypot(gx, gy, gz)
      out.push(x, y, z, gx / gl, gy / gl, gz / gl, w.color, w.prim)
    }
  }

  for (const { prim, index, mesh } of meshList) {
    const rm = rotationMatrix(prim.rot)
    const color = hexToInt(prim.color)
    const t = mesh.tris
    const sc = prim.scale
    const v = new Float64Array(9)
    for (let o = 0; o + 8 < t.length; o += 9) {
      for (let k = 0; k < 3; k++) {
        const ax = t[o + k * 3] * sc[0]
        const ay = t[o + k * 3 + 1] * sc[1]
        const az = t[o + k * 3 + 2] * sc[2]
        v[k * 3] = rm[0] * ax + rm[1] * ay + rm[2] * az + prim.pos[0]
        v[k * 3 + 1] = rm[3] * ax + rm[4] * ay + rm[5] * az + prim.pos[1]
        v[k * 3 + 2] = rm[6] * ax + rm[7] * ay + rm[8] * az + prim.pos[2]
      }
      const e1x = v[3] - v[0], e1y = v[4] - v[1], e1z = v[5] - v[2]
      const e2x = v[6] - v[0], e2y = v[7] - v[1], e2z = v[8] - v[2]
      let nx = e1y * e2z - e1z * e2y
      let ny = e1z * e2x - e1x * e2z
      let nz = e1x * e2y - e1y * e2x
      const nl = Math.hypot(nx, ny, nz)
      if (nl < 1e-12) continue
      nx /= nl
      ny /= nl
      nz /= nl
      const longest = Math.max(Math.hypot(e1x, e1y, e1z), Math.hypot(e2x, e2y, e2z), Math.hypot(v[6] - v[3], v[7] - v[4], v[8] - v[5]))
      const m = Math.max(1, Math.ceil(longest / h))
      for (let i = 0; i < m; i++) {
        for (let j = 0; j < m - i; j++) {
          const a = (i + 1 / 3) / m
          const b = (j + 1 / 3) / m
          const x = v[0] + e1x * a + e2x * b
          const y = v[1] + e1y * a + e2y * b
          const z = v[2] + e1z * a + e2z * b
          if (region && !region.has(x, y, z)) continue
          if (shapes.length && (field.carved(x, y, z) || field.inside(x, y, z, h))) continue
          out.push(x, y, z, nx, ny, nz, color, index)
        }
      }
    }
  }

  return out
}

function toModel(out: Buf, h: number, res: number): SceneModel {
  const count = out.prim.length
  const pos = Float32Array.from(out.pos)
  const base = Uint8Array.from(out.col)
  return finishModel(pos, Float32Array.from(out.nrm), base, Int32Array.from(out.prim), count, h, res)
}

function finishModel(
  pos: Float32Array,
  nrm: Float32Array,
  base: Uint8Array,
  prim: Int32Array,
  count: number,
  h: number,
  res: number,
): SceneModel {
  let maxR2 = 0
  for (let i = 0; i < count * 3; i += 3) maxR2 = Math.max(maxR2, pos[i] ** 2 + pos[i + 1] ** 2 + pos[i + 2] ** 2)
  return { count, pos, nrm, col: base, lum: lumOf(base, count), prim, base, h, res, radius: Math.max(0.2, Math.sqrt(maxR2)) }
}

/** Points sampled on the scene's surface. `res` is the studio's resolution knob (48–288). */
export function buildSceneModel(scene: MeshScene, res: number): SceneModel {
  const shapes = sceneShapes(scene)
  const h = spacing(scene, shapes, res)
  return toModel(sampleScene(scene, shapes, h, null), h, res)
}

/** Dabs added or removed between two dab lists when one extends the other (a stroke or its undo), else null. */
export function dabChanges(prev: Dab[], next: Dab[]): Dab[] | null {
  const [short, long] = prev.length <= next.length ? [prev, next] : [next, prev]
  for (let i = 0; i < short.length; i++) if (short[i] !== long[i]) return null
  return long.slice(short.length)
}

/** A sphere of space whose surface may have changed between two scenes. */
export interface ChangeZone {
  c: Vec3
  r: number
}

/**
 * Where geometry differs between two scenes, as spheres, when the edit is local: dabs added or
 * removed (a stroke / its undo) and/or prims edited in place. Null when a full rebuild is needed
 * (blend, imported meshes, added/removed/reordered prims). `[]` = same geometry.
 */
export function sceneChanges(prev: MeshScene, next: MeshScene): ChangeZone[] | null {
  if (prev.blend !== next.blend || prev.meshes !== next.meshes || prev.prims.length !== next.prims.length) return null
  const zones: ChangeZone[] = []
  for (let i = 0; i < next.prims.length; i++) {
    const a = prev.prims[i]
    const b = next.prims[i]
    if (a === b) continue
    if (a.id !== b.id || a.type === 'mesh' || b.type === 'mesh') return null
    zones.push({ c: a.pos, r: primBound(a) + next.blend }, { c: b.pos, r: primBound(b) + next.blend })
  }
  const dabs = dabChanges(prev.dabs, next.dabs)
  if (!dabs) return null
  for (const d of dabs) zones.push({ c: d.p, r: d.r + Math.min(next.blend, d.r * 0.6) })
  return zones
}

/**
 * Incremental rebuild: only the surface inside `zones` (see `sceneChanges`) is resampled, so
 * strokes and shape tweaks stay interactive however big the scene is. Everything outside the
 * zones must be unchanged from the scene `prev` was built from.
 */
export function updateSceneModel(prev: SceneModel, scene: MeshScene, zones: ChangeZone[]): SceneModel {
  const shapes = sceneShapes(scene)
  // If the scene grew or shrank a lot, the old spacing no longer suits the render scale.
  const target = spacing(scene, shapes, prev.res)
  if (target < prev.h * 0.8 || target > prev.h * 1.25) return toModel(sampleScene(scene, shapes, target, null), target, prev.res)
  const h = prev.h
  // Prefilter reach: how far a sample may travel onto the surface and still land in the region.
  const region = new Region(h * 4 + Math.min(scene.blend, 0.05))
  // Outside the zones the surface cannot have moved, so old points there stay valid.
  for (const z of zones) region.add(z.c, z.r + h * 2)
  const fresh = sampleScene(scene, shapes, h, region)

  const keep: number[] = []
  for (let i = 0; i < prev.count; i++) {
    if (!region.has(prev.pos[i * 3], prev.pos[i * 3 + 1], prev.pos[i * 3 + 2])) keep.push(i)
  }
  const n = keep.length + fresh.prim.length
  const pos = new Float32Array(n * 3)
  const nrm = new Float32Array(n * 3)
  const base = new Uint8Array(n * 3)
  const prim = new Int32Array(n)
  for (let j = 0; j < keep.length; j++) {
    const i = keep[j]
    for (let a = 0; a < 3; a++) {
      pos[j * 3 + a] = prev.pos[i * 3 + a]
      nrm[j * 3 + a] = prev.nrm[i * 3 + a]
      base[j * 3 + a] = prev.base[i * 3 + a]
    }
    prim[j] = prev.prim[i]
  }
  const o = keep.length
  pos.set(fresh.pos, o * 3)
  nrm.set(fresh.nrm, o * 3)
  base.set(fresh.col, o * 3)
  prim.set(fresh.prim, o)
  return finishModel(pos, nrm, base, prim, n, h, prev.res)
}

function lumOf(col: Uint8Array, count: number): Float32Array {
  const lum = new Float32Array(count)
  for (let i = 0; i < count; i++) lum[i] = (0.2126 * col[i * 3] + 0.7152 * col[i * 3 + 1] + 0.0722 * col[i * 3 + 2]) / 255
  return lum
}

// ---------- paint ----------

export function paintKey(x: number, y: number, z: number): number {
  const ix = Math.floor(x / PAINT_CELL) + 512
  const iy = Math.floor(y / PAINT_CELL) + 512
  const iz = Math.floor(z / PAINT_CELL) + 512
  return (ix * 1024 + iy) * 1024 + iz
}

/** Writes `color` into every paint voxel within `r` of `p`. Mutates `paint`. */
export function paintDab(paint: Record<number, number>, p: Vec3, r: number, color: number) {
  const n = Math.ceil(r / PAINT_CELL)
  const c = p.map((v) => Math.floor(v / PAINT_CELL))
  for (let i = -n; i <= n; i++)
    for (let j = -n; j <= n; j++)
      for (let k = -n; k <= n; k++) {
        const x = (c[0] + i + 0.5) * PAINT_CELL
        const y = (c[1] + j + 0.5) * PAINT_CELL
        const z = (c[2] + k + 0.5) * PAINT_CELL
        if (Math.hypot(x - p[0], y - p[1], z - p[2]) <= r) paint[paintKey(x, y, z)] = color
      }
}

/** Applies paint on top of base colours. Geometry arrays are shared, not copied. */
export function colorizeModel(model: SceneModel, paint: Record<number, number>): SceneModel {
  const keys = Object.keys(paint)
  if (!keys.length) return model
  const col = new Uint8Array(model.base)
  const { pos, count } = model
  for (let i = 0; i < count; i++) {
    const o = i * 3
    const v = paint[paintKey(pos[o], pos[o + 1], pos[o + 2])]
    if (v === undefined) continue
    col[o] = (v >> 16) & 255
    col[o + 1] = (v >> 8) & 255
    col[o + 2] = v & 255
  }
  return { ...model, col, lum: lumOf(col, count) }
}

// ---------- import / export ----------

function normalizeTris(raw: number[]): Float32Array {
  let lo = [Infinity, Infinity, Infinity]
  let hi = [-Infinity, -Infinity, -Infinity]
  for (let i = 0; i < raw.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      lo[a] = Math.min(lo[a], raw[i + a])
      hi[a] = Math.max(hi[a], raw[i + a])
    }
  }
  if (!raw.length) {
    lo = [0, 0, 0]
    hi = [1, 1, 1]
  }
  const c = [0, 1, 2].map((a) => (lo[a] + hi[a]) / 2)
  const span = Math.max(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) || 1
  const out = new Float32Array(raw.length)
  for (let i = 0; i < raw.length; i++) out[i] = (raw[i] - c[i % 3]) / span
  return out
}

export const MAX_IMPORT_TRIS = 250_000

/** Parses Wavefront OBJ (v / f, polygons fan-triangulated, negative indices supported). */
export function parseObj(text: string): Float32Array {
  const verts: number[] = []
  const tris: number[] = []
  for (const line of text.split('\n')) {
    const parts = line.trim().split(/\s+/)
    if (parts[0] === 'v') verts.push(+parts[1], +parts[2], +parts[3])
    else if (parts[0] === 'f') {
      const idx = parts.slice(1).map((p) => {
        const n = parseInt(p.split('/')[0], 10)
        return n < 0 ? verts.length / 3 + n : n - 1
      })
      for (let i = 1; i + 1 < idx.length; i++) {
        for (const k of [idx[0], idx[i], idx[i + 1]]) tris.push(verts[k * 3], verts[k * 3 + 1], verts[k * 3 + 2])
      }
      if (tris.length / 9 > MAX_IMPORT_TRIS) throw new Error('Mesh has too many triangles')
    }
  }
  if (!tris.length || tris.some((v) => !Number.isFinite(v))) throw new Error('No faces found in OBJ')
  return normalizeTris(tris)
}

/** Parses binary or ASCII STL. */
export function parseStl(buffer: ArrayBuffer): Float32Array {
  const view = new DataView(buffer)
  const tris: number[] = []
  const binaryCount = buffer.byteLength >= 84 ? view.getUint32(80, true) : -1
  if (binaryCount >= 0 && 84 + binaryCount * 50 === buffer.byteLength) {
    if (binaryCount > MAX_IMPORT_TRIS) throw new Error('Mesh has too many triangles')
    for (let t = 0; t < binaryCount; t++) {
      const o = 84 + t * 50 + 12
      for (let k = 0; k < 9; k++) tris.push(view.getFloat32(o + k * 4, true))
    }
  } else {
    const text = new TextDecoder().decode(buffer)
    const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/g
    let m: RegExpExecArray | null
    while ((m = re.exec(text))) tris.push(+m[1], +m[2], +m[3])
    tris.length -= tris.length % 9
    if (tris.length / 9 > MAX_IMPORT_TRIS) throw new Error('Mesh has too many triangles')
  }
  if (!tris.length || tris.some((v) => !Number.isFinite(v))) throw new Error('No triangles found in STL')
  return normalizeTris(tris)
}

/** ASCII PLY point cloud (positions, normals, colours) for Blender / MeshLab. */
export function toPly(model: Model): string {
  const lines = [
    'ply',
    'format ascii 1.0',
    `element vertex ${model.count}`,
    'property float x',
    'property float y',
    'property float z',
    'property float nx',
    'property float ny',
    'property float nz',
    'property uchar red',
    'property uchar green',
    'property uchar blue',
    'end_header',
  ]
  const f = (v: number) => +v.toFixed(5)
  for (let i = 0; i < model.count; i++) {
    const o = i * 3
    lines.push(
      `${f(model.pos[o])} ${f(model.pos[o + 1])} ${f(model.pos[o + 2])} ${f(model.nrm[o])} ${f(model.nrm[o + 1])} ${f(model.nrm[o + 2])} ${model.col[o]} ${model.col[o + 1]} ${model.col[o + 2]}`,
    )
  }
  return lines.join('\n') + '\n'
}

// ---------- serialisation ----------

export interface SerializedScene {
  v: 1
  prims: Prim[]
  dabs: Dab[]
  paint?: Record<string, number>
  blend: number
  meshes?: Record<string, { name: string; tris: string }>
}

function f32ToBase64(a: Float32Array): string {
  const bytes = new Uint8Array(a.buffer, a.byteOffset, a.byteLength)
  let bin = ''
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

function base64ToF32(s: string): Float32Array {
  const bin = atob(s)
  const bytes = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Float32Array(bytes.buffer, 0, bytes.length >> 2)
}

const round = (v: number) => Math.round(v * 1e4) / 1e4
const roundVec = (v: Vec3): Vec3 => [round(v[0]), round(v[1]), round(v[2])]

/** JSON-safe form. `lite` drops paint and imported meshes (used for share links). */
export function serializeScene(scene: MeshScene, lite = false): SerializedScene {
  const used = new Set(scene.prims.map((p) => p.meshId).filter(Boolean))
  return {
    v: 1,
    prims: scene.prims
      .filter((p) => !lite || p.type !== 'mesh')
      .map((p) => ({ ...p, pos: roundVec(p.pos), rot: roundVec(p.rot), scale: roundVec(p.scale) })),
    dabs: scene.dabs.map((d) => ({ ...d, p: roundVec(d.p), r: round(d.r) })),
    blend: scene.blend,
    ...(lite
      ? {}
      : {
          paint: scene.paint,
          meshes: Object.fromEntries(
            Object.entries(scene.meshes)
              .filter(([id]) => used.has(id))
              .map(([id, m]) => [id, { name: m.name, tris: f32ToBase64(m.tris) }]),
          ),
        }),
  }
}

const isVec = (v: unknown): v is Vec3 => Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n))

/** Validates and revives a serialized scene. Unknown or malformed entries are dropped. */
export function parseScene(data: unknown): MeshScene | null {
  if (!data || typeof data !== 'object') return null
  const d = data as Partial<SerializedScene>
  if (!Array.isArray(d.prims)) return null
  const types = new Set<string>(['sphere', 'box', 'cylinder', 'torus', 'cone', 'mesh'])
  const meshes: Record<string, ImportedMesh> = {}
  for (const [id, m] of Object.entries(d.meshes ?? {})) {
    try {
      if (m && typeof m.tris === 'string') meshes[id] = { name: String(m.name ?? 'mesh'), tris: base64ToF32(m.tris) }
    } catch {}
  }
  const prims = d.prims.filter(
    (p): p is Prim =>
      !!p &&
      types.has(p.type) &&
      isVec(p.pos) &&
      isVec(p.rot) &&
      isVec(p.scale) &&
      (p.type !== 'mesh' || (!!p.meshId && p.meshId in meshes)),
  ).map((p) => ({ ...p, id: typeof p.id === 'string' ? p.id : newId(), op: p.op === 'subtract' ? 'subtract' : 'add', color: typeof p.color === 'string' ? p.color : '#e4e4e4' }) as Prim)
  const dabs = (Array.isArray(d.dabs) ? d.dabs : []).filter(
    (x): x is Dab => !!x && isVec(x.p) && typeof x.r === 'number' && x.r > 0,
  ).map((x) => ({ p: x.p, r: x.r, op: x.op === 'subtract' ? 'subtract' : 'add', color: typeof x.color === 'string' ? x.color : '#e4e4e4' }) as Dab)
  const paint: Record<number, number> = {}
  for (const [k, v] of Object.entries(d.paint ?? {})) if (typeof v === 'number') paint[+k] = v
  return { prims, dabs, paint, blend: typeof d.blend === 'number' ? Math.max(0, d.blend) : 0.08, meshes }
}
