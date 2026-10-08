import { FONT_OPTIONS, type FontKey } from './config'
import { newId, parseScene, rotationMatrix, serializeScene, type MeshScene, type SerializedScene, type Vec3 } from './scene'

// A world is a whole scene: many objects (each with geometry, material, transform and procedural
// animation) over generative 2D fields, seen through an animated camera. Plain JSON; everything
// here is pure so it runs in tests and on the server. See docs/worlds.md.

export type SolidType = 'sphere' | 'box' | 'cylinder' | 'torus' | 'cone'
export type FlatType = 'circle' | 'ring' | 'rect' | 'star' | 'polygon' | 'heart' | 'moon' | 'petal' | 'cross' | 'triangle'
export type CurveType = 'helix' | 'knot' | 'lissajous' | 'spiral' | 'circle'
export type TerrainType = 'hills' | 'mountains' | 'dunes' | 'ocean'
export type ParticleType = 'stars' | 'snow' | 'rain' | 'fireflies' | 'embers' | 'galaxy' | 'ring' | 'dust'
export type FieldType =
  | 'gradient'
  | 'plasma'
  | 'noise'
  | 'waves'
  | 'ripples'
  | 'rain'
  | 'fire'
  | 'aurora'
  | 'tunnel'
  | 'vortex'
  | 'stars'
  | 'metaballs'
  | 'rings'
  | 'grid'
export type Axis = 'x' | 'y' | 'z'

export type Geom =
  | { kind: 'shape'; type: SolidType }
  /** A whole modeller scene (prims, sculpt dabs, paint) used as one object. */
  | { kind: 'sculpt'; scene: MeshScene }
  /**
   * 2D shape in the XY plane facing +Z, ~1 unit across. `sides` (polygon / star points), `inner`
   * (ring / star / moon ratio), `round` corner radius, `bevel` pillow width (0 = flat), `depth`
   * extrusion (0 = a sheet).
   */
  | { kind: 'flat'; type: FlatType; sides: number; inner: number; round: number; bevel: number; depth: number }
  | { kind: 'text'; text: string; fontKey: FontKey; weight: number; depth: number }
  | { kind: 'image'; url: string; depth: number; relief: boolean }
  /** Tube along a curve. `turns` (helix / spiral), `p` `q` (knot / lissajous; helix: strands). */
  | { kind: 'curve'; type: CurveType; turns: number; p: number; q: number; tube: number }
  /** Height field on the XZ plane, 1×1 unit. Ocean (and terrain with `speed`) moves each frame. */
  | { kind: 'terrain'; type: TerrainType; amp: number; freq: number; speed: number; seed: number }
  /** Points in a 1-unit cube, moved each frame. Self-lit by default. */
  | { kind: 'particles'; type: ParticleType; count: number; speed: number; seed: number }

export type GeomKind = Geom['kind']

/** Procedural motion. Periodic speeds are cycles/second unless noted. */
export type Behaviour =
  | { type: 'spin'; axis: Axis; speed: number /* deg/s */ }
  | { type: 'orbit'; radius: number; speed: number /* deg/s */; tilt: number; phase: number /* deg */; plane: 'xz' | 'xy' }
  | { type: 'bob'; axis: Axis; amp: number; speed: number; phase: number /* cycles */ }
  | { type: 'pulse'; amp: number; speed: number; phase: number }
  | { type: 'sway'; axis: Axis; amp: number /* deg */; speed: number; phase: number }
  | { type: 'drift'; vel: Vec3; wrap: number }
  /** Keyframed offsets (pos / rot added, scale multiplied), looped over `loop` seconds. */
  | { type: 'keys'; loop: number; ease: 'linear' | 'smooth'; keys: Keyframe[] }
  /** Deformers, applied per point in object space. */
  | { type: 'wave'; axis: Axis; amp: number; freq: number; speed: number }
  | { type: 'twist'; amount: number /* deg per unit */; speed: number }

export type BehaviourType = Behaviour['type']

export interface Keyframe {
  t: number
  pos?: Vec3
  rot?: Vec3
  scale?: number
}

/** Instancing: copy i is placed by T(pos+anim)·R(i·rot + t·spin)·T(offset + i·step)·R(rot)·S(scale·grow^i). */
export interface ArraySpec {
  count: number
  offset: Vec3
  step: Vec3
  rot: Vec3
  grow: number
  /** deg/s the whole array turns (about its rot step axes). */
  spin: number
  /** Seconds of time offset per copy — staggered animation. */
  phase: number
  /** 0–1: random per-copy height (Y scale, grown from the base) — skylines, grass, crystals. */
  jitter?: number
}

export interface WObject {
  id: string
  name?: string
  geom: Geom
  pos: Vec3
  rot: Vec3
  scale: Vec3
  /** Lit colour. */
  color: string
  /** Unlit colour (end of the shade ramp). Default: `color` faded toward the background. */
  shadow?: string
  /** Glyph ramp, dark → light. Default: the config charset. */
  charset?: string
  /** 0 = lit by the scene light, 1 = self-lit (uses point brightness). */
  emissive: number
  /** Use the geometry's own colours (paint, image pixels) instead of the ramp. */
  source?: boolean
  /** Colour ramp by local height (bottom = shadow, top = color) instead of by shade — sunsets, flames. */
  tint?: 'height'
  anim: Behaviour[]
  array?: ArraySpec
  hidden?: boolean
}

export interface Field {
  id: string
  type: FieldType
  /** `back`: fills cells no object covers. `front`: drawn over everything. */
  layer: 'back' | 'front'
  charset: string
  /** Colour ramp, low → high. */
  colors: string[]
  scale: number
  speed: number
  /** Brightness multiplier, 0–1.5. */
  intensity: number
  /** Direction (gradient, waves, rain), degrees. */
  angle: number
  seed: number
  /** Pick a random non-blank glyph per cell (matrix rain, stars) instead of the ramp. */
  random?: boolean
  hidden?: boolean
}

export interface Camera {
  /** Tilt (x), yaw (y), roll (z), degrees. */
  rot: Vec3
  zoom: number
  /** Perspective strength; 0 = orthographic (2D scenes). */
  fov: number
  pan: [number, number]
  anim: Behaviour[]
}

export interface World {
  name?: string
  /** Loop length in seconds (video export, keyframes default). */
  duration: number
  /** World half-extent that fills the shorter side of the view. */
  fit: number
  camera: Camera
  fields: Field[]
  objects: WObject[]
}

export const SOLID_TYPES: SolidType[] = ['sphere', 'box', 'cylinder', 'torus', 'cone']
export const FLAT_TYPES: FlatType[] = ['circle', 'ring', 'rect', 'star', 'polygon', 'heart', 'moon', 'petal', 'cross', 'triangle']
export const CURVE_TYPES: CurveType[] = ['helix', 'knot', 'lissajous', 'spiral', 'circle']
export const TERRAIN_TYPES: TerrainType[] = ['hills', 'mountains', 'dunes', 'ocean']
export const PARTICLE_TYPES: ParticleType[] = ['stars', 'snow', 'rain', 'fireflies', 'embers', 'galaxy', 'ring', 'dust']
export const FIELD_TYPES: FieldType[] = ['gradient', 'plasma', 'noise', 'waves', 'ripples', 'rain', 'fire', 'aurora', 'tunnel', 'vortex', 'stars', 'metaballs', 'rings', 'grid']
export const BEHAVIOUR_TYPES: BehaviourType[] = ['spin', 'orbit', 'bob', 'pulse', 'sway', 'drift', 'keys', 'wave', 'twist']
export const GEOM_KINDS: GeomKind[] = ['shape', 'flat', 'text', 'curve', 'terrain', 'particles', 'sculpt', 'image']

export const MAX_ARRAY = 240
export const MAX_PARTICLES = 20_000

// ---------- defaults ----------

export function defaultGeom(kind: GeomKind): Geom {
  switch (kind) {
    case 'shape':
      return { kind, type: 'sphere' }
    case 'sculpt':
      return { kind, scene: { prims: [], dabs: [], paint: {}, blend: 0.08, meshes: {} } }
    case 'flat':
      return { kind, type: 'circle', sides: 5, inner: 0.5, round: 0, bevel: 0.12, depth: 0 }
    case 'text':
      return { kind, text: 'HELLO', fontKey: 'geist-mono', weight: 700, depth: 0.15 }
    case 'image':
      return { kind, url: '', depth: 0.1, relief: false }
    case 'curve':
      return { kind, type: 'helix', turns: 3, p: 2, q: 3, tube: 0.05 }
    case 'terrain':
      return { kind, type: 'hills', amp: 0.18, freq: 3, speed: 0, seed: 1 }
    case 'particles':
      return { kind, type: 'stars', count: 600, speed: 1, seed: 1 }
  }
}

export function defaultBehaviour(type: BehaviourType): Behaviour {
  switch (type) {
    case 'spin':
      return { type, axis: 'y', speed: 30 }
    case 'orbit':
      return { type, radius: 0.6, speed: 30, tilt: 0, phase: 0, plane: 'xz' }
    case 'bob':
      return { type, axis: 'y', amp: 0.08, speed: 0.25, phase: 0 }
    case 'pulse':
      return { type, amp: 0.08, speed: 0.5, phase: 0 }
    case 'sway':
      return { type, axis: 'z', amp: 10, speed: 0.25, phase: 0 }
    case 'drift':
      return { type, vel: [0.1, 0, 0], wrap: 1.5 }
    case 'keys':
      return { type, loop: 4, ease: 'smooth', keys: [{ t: 0, pos: [0, 0, 0] }, { t: 2, pos: [0, 0.3, 0] }, { t: 4, pos: [0, 0, 0] }] }
    case 'wave':
      return { type, axis: 'y', amp: 0.05, freq: 6, speed: 0.5 }
    case 'twist':
      return { type, amount: 60, speed: 0.25 }
  }
}

export function defaultField(type: FieldType): Field {
  const base: Field = {
    id: newId(),
    type,
    layer: 'back',
    charset: ' .·:-=+*',
    colors: ['#1a1a2e', '#7f8cff'],
    scale: 1,
    speed: 1,
    intensity: 1,
    angle: 90,
    seed: 1,
  }
  if (type === 'rain') return { ...base, charset: ' ｱｲｳｴｵｶｷｸ01', colors: ['#03250f', '#5dff8a', '#e6ffe9'], random: true }
  if (type === 'stars') return { ...base, charset: ' .·+*', colors: ['#3a4060', '#ffffff'], intensity: 1 }
  if (type === 'fire') return { ...base, charset: ' .:-=+*#%@', colors: ['#2a0500', '#ff5a1f', '#ffe08a'] }
  return base
}

export function makeObject(kind: GeomKind, patch: Partial<WObject> = {}): WObject {
  const geom = defaultGeom(kind)
  return {
    id: newId(),
    geom,
    pos: [0, 0, 0],
    rot: [0, 0, 0],
    scale: kind === 'terrain' ? [2.4, 1, 2.4] : kind === 'particles' ? [3, 3, 3] : [0.8, 0.8, 0.8],
    color: '#e4e4e4',
    emissive: kind === 'particles' ? 1 : 0,
    anim: [],
    ...patch,
  }
}

export function defaultCamera(): Camera {
  return { rot: [-18, 0, 0], zoom: 1, fov: 0.25, pan: [0, 0], anim: [] }
}

export function emptyWorld(): World {
  return { duration: 12, fit: 1.4, camera: defaultCamera(), fields: [], objects: [] }
}

// ---------- maths ----------

/** Row-major 3×4 affine (rotation·scale | translation). */
export type Mat34 = Float64Array

function axisIndex(a: Axis): number {
  return a === 'x' ? 0 : a === 'y' ? 1 : 2
}

const TAU = Math.PI * 2

function wrapRange(v: number, w: number): number {
  const span = 2 * w
  return ((((v + w) % span) + span) % span) - w
}

function smooth01(x: number) {
  return x * x * (3 - 2 * x)
}

export interface AnimState {
  pos: Vec3
  rot: Vec3
  scale: number
}

/** Rigid-body offsets from a behaviour list at time `t` (deformers ignored). `base` is used by drift's wrap. */
export function evalAnim(anim: Behaviour[], t: number, base: Vec3 = [0, 0, 0]): AnimState {
  const pos: Vec3 = [0, 0, 0]
  const rot: Vec3 = [0, 0, 0]
  let scale = 1
  for (const b of anim) {
    switch (b.type) {
      case 'spin':
        rot[axisIndex(b.axis)] += b.speed * t
        break
      case 'orbit': {
        const a = ((b.phase + b.speed * t) * Math.PI) / 180
        const u = b.radius * Math.cos(a)
        const v = b.radius * Math.sin(a)
        const tl = (b.tilt * Math.PI) / 180
        if (b.plane === 'xy') {
          pos[0] += u
          pos[1] += v * Math.cos(tl)
          pos[2] += v * Math.sin(tl)
        } else {
          pos[0] += u
          pos[1] += -v * Math.sin(tl)
          pos[2] += v * Math.cos(tl)
        }
        break
      }
      case 'bob':
        pos[axisIndex(b.axis)] += b.amp * Math.sin(TAU * (b.speed * t + b.phase))
        break
      case 'pulse':
        scale *= 1 + b.amp * Math.sin(TAU * (b.speed * t + b.phase))
        break
      case 'sway':
        rot[axisIndex(b.axis)] += b.amp * Math.sin(TAU * (b.speed * t + b.phase))
        break
      case 'drift':
        for (let a = 0; a < 3; a++) {
          if (!b.vel[a] || b.wrap <= 0) continue
          const at = base[a] + pos[a]
          pos[a] += wrapRange(at + b.vel[a] * t, b.wrap) - at
        }
        break
      case 'keys': {
        const k = sampleKeys(b, t)
        for (let a = 0; a < 3; a++) {
          pos[a] += k.pos[a]
          rot[a] += k.rot[a]
        }
        scale *= k.scale
        break
      }
    }
  }
  return { pos, rot, scale }
}

/** Interpolated keyframe offsets at `t` (looped). Missing channels hold their neighbours' value. */
export function sampleKeys(b: Extract<Behaviour, { type: 'keys' }>, t: number): AnimState {
  const keys = b.keys
  if (!keys.length) return { pos: [0, 0, 0], rot: [0, 0, 0], scale: 1 }
  const loop = b.loop > 0 ? b.loop : Math.max(...keys.map((k) => k.t)) || 1
  const tt = ((t % loop) + loop) % loop
  const chan = <T,>(get: (k: Keyframe) => T | undefined, fallback: T, lerp: (a: T, b: T, f: number) => T): T => {
    const have = keys.filter((k) => get(k) !== undefined)
    if (!have.length) return fallback
    if (tt <= have[0].t) return get(have[0])!
    for (let i = 0; i < have.length - 1; i++) {
      const a = have[i]
      const c = have[i + 1]
      if (tt <= c.t) {
        const span = c.t - a.t
        let f = span > 0 ? (tt - a.t) / span : 1
        if (b.ease === 'smooth') f = smooth01(f)
        return lerp(get(a)!, get(c)!, f)
      }
    }
    return get(have[have.length - 1])!
  }
  const lv = (a: Vec3, c: Vec3, f: number): Vec3 => [a[0] + (c[0] - a[0]) * f, a[1] + (c[1] - a[1]) * f, a[2] + (c[2] - a[2]) * f]
  return {
    pos: chan((k) => k.pos, [0, 0, 0] as Vec3, lv),
    rot: chan((k) => k.rot, [0, 0, 0] as Vec3, lv),
    scale: chan((k) => k.scale, 1, (a, c, f) => a + (c - a) * f),
  }
}

function mul33(a: Float64Array, b: Float64Array): Float64Array {
  const o = new Float64Array(9)
  for (let r = 0; r < 3; r++)
    for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]
  return o
}

function apply33(m: Float64Array, v: Vec3): Vec3 {
  return [m[0] * v[0] + m[1] * v[1] + m[2] * v[2], m[3] * v[0] + m[4] * v[1] + m[5] * v[2], m[6] * v[0] + m[7] * v[1] + m[8] * v[2]]
}

function jitterHash(i: number): number {
  let h = Math.imul(i + 1, 0x9e3779b1)
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b)
  h ^= h >>> 13
  return (h >>> 0) / 4294967296
}

export interface Instance {
  /** Local → world. */
  m: Mat34
  /** Local normal → world normal (unnormalised). */
  n: Float64Array
  /** Animation time of this copy (array phase applied). */
  t: number
  /** World position of the copy's origin. */
  center: Vec3
  /** Largest absolute scale factor. */
  scale: number
}

/** Every placed copy of an object at time `t`. */
export function objectInstances(o: WObject, t: number): Instance[] {
  const arr = o.array
  const count = arr ? Math.max(1, Math.min(MAX_ARRAY, Math.round(arr.count))) : 1
  const out: Instance[] = []
  for (let i = 0; i < count; i++) {
    const ti = arr ? t - i * arr.phase : t
    const a = evalAnim(o.anim, ti, o.pos)
    const r = rotationMatrix([o.rot[0] + a.rot[0], o.rot[1] + a.rot[1], o.rot[2] + a.rot[2]])
    const g = arr ? Math.pow(arr.grow || 1, i) : 1
    const s: Vec3 = [o.scale[0] * a.scale * g, o.scale[1] * a.scale * g, o.scale[2] * a.scale * g]
    // Jittered copies keep their base: grow from local y = -0.5.
    let lift = 0
    if (arr?.jitter) {
      const k = 1 + arr.jitter * (2 * jitterHash(i) - 1)
      lift = 0.5 * s[1] * (k - 1)
      s[1] *= k
    }
    let rm = r
    let off: Vec3 = [0, 0, 0]
    if (arr) {
      const spin = arr.spin * t
      const stepRot = rotationMatrix([
        arr.rot[0] * i + (arr.rot[0] ? spin : 0),
        arr.rot[1] * i + (arr.rot[1] ? spin : 0),
        arr.rot[2] * i + (arr.rot[2] ? spin : 0),
      ])
      off = apply33(stepRot, [arr.offset[0] + arr.step[0] * i, arr.offset[1] + arr.step[1] * i, arr.offset[2] + arr.step[2] * i])
      rm = mul33(stepRot, r)
    }
    const tx = o.pos[0] + a.pos[0] + off[0] + rm[1] * lift
    const ty = o.pos[1] + a.pos[1] + off[1] + rm[4] * lift
    const tz = o.pos[2] + a.pos[2] + off[2] + rm[7] * lift
    const sx = Math.abs(s[0]) > 1e-6 ? s[0] : 1e-6
    const sy = Math.abs(s[1]) > 1e-6 ? s[1] : 1e-6
    const sz = Math.abs(s[2]) > 1e-6 ? s[2] : 1e-6
    const m = Float64Array.of(
      rm[0] * sx, rm[1] * sy, rm[2] * sz, tx,
      rm[3] * sx, rm[4] * sy, rm[5] * sz, ty,
      rm[6] * sx, rm[7] * sy, rm[8] * sz, tz,
    )
    const n = Float64Array.of(rm[0] / sx, rm[1] / sy, rm[2] / sz, rm[3] / sx, rm[4] / sy, rm[5] / sz, rm[6] / sx, rm[7] / sy, rm[8] / sz)
    out.push({ m, n, t: ti, center: [tx, ty, tz], scale: Math.max(Math.abs(sx), Math.abs(sy), Math.abs(sz)) })
  }
  return out
}

/** Camera view at time `t` plus user orbit: rotation (deg), zoom multiplier and pan. */
export function evalCamera(cam: Camera, t: number): { rot: Vec3; zoom: number; pan: [number, number] } {
  const a = evalAnim(cam.anim, t)
  return {
    rot: [cam.rot[0] + a.rot[0], cam.rot[1] + a.rot[1], cam.rot[2] + a.rot[2]],
    zoom: cam.zoom * a.scale,
    pan: [cam.pan[0] + a.pos[0], cam.pan[1] + a.pos[1]],
  }
}

export interface Deformer {
  kind: 0 | 1 // 0 wave, 1 twist
  axis: number
  amp: number
  freq: number
  phase: number
}

/** Per-point deformers for time `t`. */
export function deformers(anim: Behaviour[], t: number): Deformer[] {
  const out: Deformer[] = []
  for (const b of anim) {
    if (b.type === 'wave') out.push({ kind: 0, axis: axisIndex(b.axis), amp: b.amp, freq: b.freq, phase: TAU * b.speed * t })
    else if (b.type === 'twist')
      out.push({ kind: 1, axis: 1, amp: ((b.amount * Math.PI) / 180) * (b.speed ? Math.sin(TAU * b.speed * t) : 1), freq: 0, phase: 0 })
  }
  return out
}

// ---------- parsing ----------

const num = (v: unknown, d: number, lo = -Infinity, hi = Infinity) =>
  typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d
const str = (v: unknown, d: string) => (typeof v === 'string' ? v : d)
const color = (v: unknown, d: string) => (typeof v === 'string' && /^#[0-9a-f]{3}([0-9a-f]{3})?$/i.test(v) ? v : d)
const vec = (v: unknown, d: Vec3): Vec3 => {
  if (typeof v === 'number' && Number.isFinite(v)) return [v, v, v]
  return Array.isArray(v) && v.length === 3 && v.every((n) => typeof n === 'number' && Number.isFinite(n)) ? [v[0], v[1], v[2]] : d
}
const pick = <T extends string>(v: unknown, opts: readonly T[], d: T): T => (opts.includes(v as T) ? (v as T) : d)
const AXES: Axis[] = ['x', 'y', 'z']
const FONT_KEYS = FONT_OPTIONS.map((f) => f.key)

function parseGeom(data: unknown): Geom | null {
  if (!data || typeof data !== 'object') return null
  const g = data as Record<string, unknown>
  const kind = g.kind as GeomKind
  if (!GEOM_KINDS.includes(kind)) return null
  const d = defaultGeom(kind) as Record<string, unknown>
  switch (kind) {
    case 'shape':
      return { kind, type: pick(g.type, SOLID_TYPES, 'sphere') }
    case 'sculpt': {
      const scene = parseScene(g.scene)
      return scene ? { kind, scene } : null
    }
    case 'flat':
      return {
        kind,
        type: pick(g.type, FLAT_TYPES, 'circle'),
        sides: Math.round(num(g.sides, d.sides as number, 3, 24)),
        inner: num(g.inner, d.inner as number, 0.05, 0.95),
        round: num(g.round, 0, 0, 0.4),
        bevel: num(g.bevel, d.bevel as number, 0, 0.5),
        depth: num(g.depth, 0, 0, 1),
      }
    case 'text':
      return {
        kind,
        text: str(g.text, 'HELLO').slice(0, 200),
        fontKey: pick(g.fontKey, FONT_KEYS, 'geist-mono'),
        weight: num(g.weight, 700, 100, 900),
        depth: num(g.depth, 0.15, 0, 1),
      }
    case 'image':
      return typeof g.url === 'string' && g.url ? { kind, url: g.url, depth: num(g.depth, 0.1, 0, 1), relief: g.relief === true } : null
    case 'curve':
      return {
        kind,
        type: pick(g.type, CURVE_TYPES, 'helix'),
        turns: num(g.turns, 3, 0.25, 20),
        p: Math.round(num(g.p, 2, 1, 12)),
        q: Math.round(num(g.q, 3, 1, 12)),
        tube: num(g.tube, 0.05, 0.002, 0.4),
      }
    case 'terrain':
      return {
        kind,
        type: pick(g.type, TERRAIN_TYPES, 'hills'),
        amp: num(g.amp, 0.18, 0, 1),
        freq: num(g.freq, 3, 0.2, 20),
        speed: num(g.speed, 0, -5, 5),
        seed: num(g.seed, 1),
      }
    case 'particles':
      return {
        kind,
        type: pick(g.type, PARTICLE_TYPES, 'stars'),
        count: Math.round(num(g.count, 600, 1, MAX_PARTICLES)),
        speed: num(g.speed, 1, -10, 10),
        seed: num(g.seed, 1),
      }
  }
}

function parseKey(data: unknown): Keyframe | null {
  if (!data || typeof data !== 'object') return null
  const k = data as Record<string, unknown>
  if (typeof k.t !== 'number' || !Number.isFinite(k.t)) return null
  return {
    t: Math.max(0, k.t),
    ...(k.pos !== undefined ? { pos: vec(k.pos, [0, 0, 0]) } : {}),
    ...(k.rot !== undefined ? { rot: vec(k.rot, [0, 0, 0]) } : {}),
    ...(typeof k.scale === 'number' && Number.isFinite(k.scale) ? { scale: k.scale } : {}),
  }
}

export function parseBehaviour(data: unknown): Behaviour | null {
  if (!data || typeof data !== 'object') return null
  const b = data as Record<string, unknown>
  const type = b.type as BehaviourType
  if (!BEHAVIOUR_TYPES.includes(type)) return null
  const d = defaultBehaviour(type) as Record<string, unknown>
  const n = (k: string, lo?: number, hi?: number) => num(b[k], d[k] as number, lo, hi)
  switch (type) {
    case 'spin':
      return { type, axis: pick(b.axis, AXES, 'y'), speed: n('speed') }
    case 'orbit':
      return { type, radius: n('radius'), speed: n('speed'), tilt: n('tilt'), phase: n('phase'), plane: b.plane === 'xy' ? 'xy' : 'xz' }
    case 'bob':
      return { type, axis: pick(b.axis, AXES, 'y'), amp: n('amp'), speed: n('speed'), phase: n('phase') }
    case 'pulse':
      return { type, amp: n('amp', -0.95, 5), speed: n('speed'), phase: n('phase') }
    case 'sway':
      return { type, axis: pick(b.axis, AXES, 'z'), amp: n('amp'), speed: n('speed'), phase: n('phase') }
    case 'drift':
      return { type, vel: vec(b.vel, [0.1, 0, 0]), wrap: n('wrap', 0) }
    case 'keys': {
      const keys = (Array.isArray(b.keys) ? b.keys : []).map(parseKey).filter((k): k is Keyframe => !!k).sort((a, c) => a.t - c.t)
      return { type, loop: n('loop', 0), ease: b.ease === 'linear' ? 'linear' : 'smooth', keys }
    }
    case 'wave':
      return { type, axis: pick(b.axis, AXES, 'y'), amp: n('amp'), freq: n('freq'), speed: n('speed') }
    case 'twist':
      return { type, amount: n('amount'), speed: n('speed') }
  }
}

const parseAnim = (v: unknown): Behaviour[] => (Array.isArray(v) ? v.map(parseBehaviour).filter((b): b is Behaviour => !!b) : [])

function parseArray(data: unknown): ArraySpec | undefined {
  if (!data || typeof data !== 'object') return undefined
  const a = data as Record<string, unknown>
  return {
    count: Math.round(num(a.count, 6, 1, MAX_ARRAY)),
    offset: vec(a.offset, [0, 0, 0]),
    step: vec(a.step, [0, 0, 0]),
    rot: vec(a.rot, [0, 0, 0]),
    grow: num(a.grow, 1, 0.2, 5),
    spin: num(a.spin, 0),
    phase: num(a.phase, 0),
    ...(typeof a.jitter === 'number' && a.jitter > 0 ? { jitter: Math.min(1, a.jitter) } : {}),
  }
}

export function parseObject(data: unknown): WObject | null {
  if (!data || typeof data !== 'object') return null
  const o = data as Record<string, unknown>
  const geom = parseGeom(o.geom)
  if (!geom) return null
  const base = makeObject(geom.kind)
  const array = parseArray(o.array)
  return {
    id: typeof o.id === 'string' && o.id ? o.id : newId(),
    ...(typeof o.name === 'string' && o.name ? { name: o.name } : {}),
    geom,
    pos: vec(o.pos, base.pos),
    rot: vec(o.rot, base.rot),
    scale: vec(o.scale, base.scale),
    color: color(o.color, base.color),
    ...(typeof o.shadow === 'string' && color(o.shadow, '') ? { shadow: o.shadow } : {}),
    ...(typeof o.charset === 'string' && o.charset ? { charset: o.charset } : {}),
    emissive: num(o.emissive, base.emissive, 0, 1),
    ...(o.source === true ? { source: true } : {}),
    ...(o.tint === 'height' ? { tint: 'height' as const } : {}),
    anim: parseAnim(o.anim),
    ...(array ? { array } : {}),
    ...(o.hidden === true ? { hidden: true } : {}),
  }
}

export function parseField(data: unknown): Field | null {
  if (!data || typeof data !== 'object') return null
  const f = data as Record<string, unknown>
  const type = f.type as FieldType
  if (!FIELD_TYPES.includes(type)) return null
  const d = defaultField(type)
  const colors = Array.isArray(f.colors) ? f.colors.map((c) => color(c, '')).filter(Boolean).slice(0, 6) : []
  return {
    id: typeof f.id === 'string' && f.id ? f.id : d.id,
    type,
    layer: f.layer === 'front' ? 'front' : 'back',
    charset: typeof f.charset === 'string' && f.charset ? f.charset : d.charset,
    colors: colors.length >= 2 ? colors : colors.length === 1 ? [d.colors[0], colors[0]] : d.colors,
    scale: num(f.scale, 1, 0.05, 20),
    speed: num(f.speed, 1, -20, 20),
    intensity: num(f.intensity, 1, 0, 1.5),
    angle: num(f.angle, 90),
    seed: num(f.seed, 1),
    ...(f.random === true || (f.random === undefined && d.random) ? { random: true } : {}),
    ...(f.hidden === true ? { hidden: true } : {}),
  }
}

/** Validates and revives a world. Malformed entries are dropped; returns null only for non-objects. */
export function parseWorld(data: unknown): World | null {
  if (!data || typeof data !== 'object') return null
  const w = data as Record<string, unknown>
  const c = (w.camera && typeof w.camera === 'object' ? w.camera : {}) as Record<string, unknown>
  const dc = defaultCamera()
  const pan = Array.isArray(c.pan) && c.pan.length === 2 && c.pan.every((n) => typeof n === 'number' && Number.isFinite(n)) ? ([c.pan[0], c.pan[1]] as [number, number]) : dc.pan
  return {
    ...(typeof w.name === 'string' && w.name ? { name: w.name } : {}),
    duration: num(w.duration, 12, 1, 120),
    fit: num(w.fit, 1.4, 0.1, 50),
    camera: {
      rot: vec(c.rot, dc.rot),
      zoom: num(c.zoom, 1, 0.05, 20),
      fov: num(c.fov, dc.fov, 0, 0.95),
      pan,
      anim: parseAnim(c.anim),
    },
    fields: (Array.isArray(w.fields) ? w.fields : []).map(parseField).filter((f): f is Field => !!f),
    objects: (Array.isArray(w.objects) ? w.objects : []).map(parseObject).filter((o): o is WObject => !!o),
  }
}

// ---------- serialisation ----------

export type SerializedGeom = Exclude<Geom, { kind: 'sculpt' }> | { kind: 'sculpt'; scene: SerializedScene }

export interface SerializedWorld extends Omit<World, 'objects'> {
  v: 1
  objects: (Omit<WObject, 'geom'> & { geom: SerializedGeom })[]
}

const r4 = (v: number) => Math.round(v * 1e4) / 1e4
const rv = (v: Vec3): Vec3 => [r4(v[0]), r4(v[1]), r4(v[2])]

/** JSON-safe form. `lite` drops local images (blob / data URLs) — used for share links. */
export function serializeWorld(world: World, lite = false): SerializedWorld {
  return {
    v: 1,
    ...(world.name ? { name: world.name } : {}),
    duration: world.duration,
    fit: world.fit,
    camera: { ...world.camera, rot: rv(world.camera.rot) },
    fields: world.fields,
    objects: world.objects
      .filter((o) => !(lite && o.geom.kind === 'image' && /^(blob|data):/.test(o.geom.url)))
      .map((o) => ({
        ...o,
        pos: rv(o.pos),
        rot: rv(o.rot),
        scale: rv(o.scale),
        geom: o.geom.kind === 'sculpt' ? { kind: 'sculpt' as const, scene: serializeScene(o.geom.scene, lite) } : o.geom,
      })),
  }
}

export function objectLabel(o: WObject, i: number): string {
  if (o.name) return o.name
  const g = o.geom
  const kind = 'type' in g ? g.type : g.kind === 'text' ? `“${g.text.slice(0, 12)}”` : g.kind
  return `${kind[0].toUpperCase()}${kind.slice(1)} ${i + 1}`
}
