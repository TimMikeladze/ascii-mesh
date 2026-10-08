import { DEFAULT_CONFIG, type AsciiConfig } from './config'
import {
  BEHAVIOUR_TYPES,
  CURVE_TYPES,
  FIELD_TYPES,
  FLAT_TYPES,
  PARTICLE_TYPES,
  SOLID_TYPES,
  TERRAIN_TYPES,
  parseWorld,
  serializeWorld,
  type World,
} from './world'
import { getWorldPreset } from './worlds'

// Instructions and reply parsing for the AI scene generator (app/api/generate). The model answers
// with one short line of prose, then a ```json block holding { world, config }. Everything it
// writes goes through parseWorld, so a sloppy answer degrades instead of breaking the studio.

/** Config keys the model may set (look + light; everything else stays the studio's). */
export const AI_CONFIG_KEYS = [
  'bg',
  'charset',
  'cellSize',
  'lightAzimuth',
  'lightElevation',
  'ambient',
  'contrast',
  'brightness',
  'depthFade',
  'shimmer',
  'scanStrength',
  'intro',
  'gridDots',
  'fontKey',
] as const satisfies readonly (keyof AsciiConfig)[]

const list = (xs: readonly string[]) => xs.join(' | ')

function example(key: string): string {
  const p = getWorldPreset(key)!
  const config = Object.fromEntries(Object.entries(p.config).filter(([k]) => (AI_CONFIG_KEYS as readonly string[]).includes(k)))
  // Ids are noise for the model; parseWorld fills them in.
  const world = JSON.parse(JSON.stringify(serializeWorld(p.world()), (k, v) => (k === 'id' ? undefined : v)))
  return JSON.stringify({ world, config })
}

export function buildInstructions(): string {
  return `You are an ASCII art director. You compose animated scenes ("worlds") that a renderer draws
entirely with text glyphs on a grid. Every reply is: ONE short sentence describing what you made or
changed, then a single \`\`\`json code block containing {"world": World, "config": Config}. Nothing after it.

# World (JSON)
World = { name, duration (loop seconds, 4–30), fit (world half-height visible, ~1–1.6), camera, fields: Field[], objects: Obj[] }
camera = { rot: [tilt, turn, roll] degrees (tilt NEGATIVE looks down onto the scene, e.g. -20), zoom: 1, fov: 0..0.9 (0 = flat 2D, 0.25–0.4 typical 3D), pan: [x, y], anim: Behaviour[] }
Coordinates: Y up, X right, +Z toward the viewer. Unit shapes are ~1 unit across before scale.

Obj = { name, geom, pos: [x,y,z], rot: [x,y,z] deg, scale: [x,y,z], color: "#rrggbb" (lit), shadow?: "#rrggbb" (unlit end of the ramp),
        charset?: glyph ramp dark→light (e.g. " .:-=+*#%@"), emissive: 0..1 (1 = self-lit, ignores light), tint?: "height" (ramp bottom→top instead of by shade),
        source?: true (use painted/sculpt colours), anim: Behaviour[], array?: Array }
geom (pick one):
  { kind: "shape", type: ${list(SOLID_TYPES)} }        // solids; cylinder/cone along Y, torus ring in XZ
  { kind: "flat", type: ${list(FLAT_TYPES)}, sides, inner (0.05–0.95), round, bevel (0–0.5 pillow shading), depth (0 = sheet) }   // 2D in the XY plane facing +Z
  { kind: "text", text, weight: 100–900, depth }
  { kind: "curve", type: ${list(CURVE_TYPES)}, turns, p, q, tube }   // tube along a curve; helix p = strands
  { kind: "terrain", type: ${list(TERRAIN_TYPES)}, amp, freq, speed (0 = still; ocean needs speed), seed }   // 1×1 on XZ, scale x/z to widen
  { kind: "particles", type: ${list(PARTICLE_TYPES)}, count (≤ 12000), speed, seed }   // fill a 1-unit cube, scale to spread; self-lit
  { kind: "sculpt", scene: { prims: [{ type: sphere|box|cylinder|torus|cone, op: add|subtract, pos, rot, scale, color }], dabs: [], blend: 0.04–0.12 } }   // smooth-blended CSG creature/object; use with source: true
Behaviour (anim; summed):
  { type: "spin", axis: x|y|z, speed: deg/s } | { type: "orbit", radius, speed: deg/s, tilt, phase: deg, plane: "xz"|"xy" }
  { type: "bob", axis, amp, speed: Hz, phase: 0..1 } | { type: "pulse", amp, speed: Hz } | { type: "sway", axis, amp: deg, speed: Hz, phase }
  { type: "drift", vel: [x,y,z], wrap } | { type: "keys", loop: s, ease: smooth|linear, keys: [{ t, pos?, rot?, scale? }] (offsets) }
  { type: "wave", axis, amp, freq, speed } | { type: "twist", amount: deg/unit, speed }   // per-point deformers
  (types: ${list(BEHAVIOUR_TYPES)})
Array = { count (≤ 240), offset: [x,y,z], step: [x,y,z], rot: [x,y,z] deg per copy, grow: scale per copy, spin: deg/s whole ring, phase: seconds of delay per copy, jitter: 0..1 random heights }
  Copy i = T(pos) · R(i·rot + t·spin) · T(offset + i·step) · R(rot) · S(scale·growⁱ). Rings: offset [r,0,0] + rot [0,360/count,0]. 2D rings: offset [0,r,0] + rot [0,0,360/count].
Field = { type: ${list(FIELD_TYPES)}, layer: "back"|"front", charset, colors: ["#..", "#..", ...] (2–4, low→high), scale, speed, intensity: 0..1.5, angle (gradient/waves direction deg; grid = horizon height deg), seed, random?: true (random glyphs: rain/stars) }
  back fields fill empty cells behind objects (skies, water, nebulae); front fields overlay (rain, haze). Stack 1–3.

# Config (look of the whole render)
${AI_CONFIG_KEYS.map((k) => `${k}: ${JSON.stringify(DEFAULT_CONFIG[k])}`).join(', ')}
cellSize 5–9 (smaller = finer). lightAzimuth/lightElevation are in view space (0, 0 = light from the camera).

# Craft
- Compose like a painter: a focal subject, a background field, depth (near/far layers), 2–4 harmonious colours on a dark bg.
- Every scene must move and loop: orbit/spin/bob/pulse/sway/drift, staggered arrays (phase), animated fields.
- Give every object a charset that suits its material (water " .-~=≈", stone " .:-=+*#%@", stars " .·*").
- Keep the total cheap: ≤ 14 objects, arrays ≤ 60 copies of big solids, particles ≤ 12000.
- When asked to change an existing world, return the FULL updated world, keeping what wasn't mentioned.

# Examples
${example('sunset')}
${example('koi')}
`
}

export interface AiReply {
  /** The prose part of the answer. */
  text: string
  world: World | null
  config: Partial<AsciiConfig>
}

/** Prose before the code block (what to show while the JSON streams). */
export function replyProse(text: string): string {
  const i = text.indexOf('```')
  return (i >= 0 ? text.slice(0, i) : text).trim()
}

/** Pulls { world, config } out of a model answer. Tolerates a missing fence or trailing prose. */
export function parseAiReply(text: string): AiReply {
  const prose = replyProse(text)
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)(```|$)/)
  let raw = fenced ? fenced[1] : text
  const start = raw.indexOf('{')
  const end = raw.lastIndexOf('}')
  if (start < 0 || end <= start) return { text: prose, world: null, config: {} }
  raw = raw.slice(start, end + 1)
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { text: prose, world: null, config: {} }
  }
  const d = data as { world?: unknown; config?: unknown; objects?: unknown }
  const worldData = d.world ?? (Array.isArray(d.objects) ? d : null)
  const world = worldData ? parseWorld(worldData) : null
  const config: Partial<AsciiConfig> = {}
  if (d.config && typeof d.config === 'object') {
    for (const k of AI_CONFIG_KEYS) {
      const v = (d.config as Record<string, unknown>)[k]
      if (v !== undefined && typeof v === typeof DEFAULT_CONFIG[k] && (typeof v !== 'number' || Number.isFinite(v))) (config as Record<string, unknown>)[k] = v
    }
  }
  return { text: prose, world: world && world.objects.length + world.fields.length > 0 ? world : null, config }
}
