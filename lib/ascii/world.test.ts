import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, mergeConfig } from './config'
import { fieldSampler } from './fields'
import { parsePiece, serializePiece } from './piece'
import {
  FIELD_TYPES,
  defaultField,
  evalAnim,
  makeObject,
  objectInstances,
  parseWorld,
  sampleKeys,
  serializeWorld,
  type Behaviour,
  type World,
} from './world'
import { buildGeom, flatSdf } from './world-geom'
import { parseAiReply } from './world-prompt'
import { WorldRenderer, type BuiltObject } from './world-renderer'
import { WORLD_PRESETS } from './worlds'

// A 2D context that only remembers what was drawn.
function stubCtx() {
  const drawn: string[] = []
  const ctx = new Proxy(
    { fillText: (t: string) => drawn.push(t) },
    {
      get: (target, k) => (k in target ? target[k as 'fillText'] : typeof k === 'string' && /^(fill|set|clear|draw)/.test(k) ? () => {} : undefined),
      set: () => true,
    },
  ) as unknown as CanvasRenderingContext2D
  return { ctx, drawn }
}

const FRAME = { time: 1, introProgress: 1, userX: 0, userY: 0, zoomMul: 1, pointerX: 0, pointerY: 0 }
const CFG = { ...DEFAULT_CONFIG, cellSize: 8, intro: 0, shimmer: 0, gridDots: false }

function build(world: World, h = 0.02): (BuiltObject | null)[] {
  return world.objects.map((o) => buildGeom(o.geom, o.scale.map((s) => h / Math.abs(s)) as [number, number, number]))
}

function render(world: World, cfg = CFG) {
  const r = new WorldRenderer()
  const { ctx, drawn } = stubCtx()
  const stats = r.render(ctx, 480, 320, 1, cfg, world, build(world), FRAME)
  return { r, stats, drawn }
}

describe('parseWorld / serializeWorld', () => {
  it('round-trips a gallery world', () => {
    const w = WORLD_PRESETS[0].world()
    const again = parseWorld(JSON.parse(JSON.stringify(serializeWorld(w))))!
    expect(again.objects.map((o) => o.geom)).toEqual(w.objects.map((o) => o.geom))
    expect(again.camera).toEqual(w.camera)
    expect(again.fields.length).toBe(w.fields.length)
  })

  it('drops malformed entries, clamps numbers and fills defaults', () => {
    const w = parseWorld({
      duration: 9999,
      objects: [
        { geom: { kind: 'nope' } },
        { geom: { kind: 'particles', type: 'snow', count: 1e9 }, scale: 2, anim: [{ type: 'spin', speed: 10 }, { type: 'bogus' }] },
        { geom: { kind: 'flat', type: 'star' }, color: 'red' },
      ],
      fields: [{ type: 'plasma', colors: ['#fff'] }, { type: 'unknown' }],
    })!
    expect(w.duration).toBe(120)
    expect(w.objects).toHaveLength(2)
    const [p, star] = w.objects
    expect(p.geom).toMatchObject({ kind: 'particles', count: 20_000 })
    expect(p.scale).toEqual([2, 2, 2])
    expect(p.anim).toEqual([{ type: 'spin', axis: 'y', speed: 10 }])
    expect(star.color).toBe('#e4e4e4')
    expect(w.fields).toHaveLength(1)
    expect(w.fields[0].colors).toHaveLength(2)
    expect(parseWorld('nope')).toBeNull()
  })

  it('lite serialisation drops local images', () => {
    const w: World = { ...parseWorld({})!, objects: [makeObject('image', { geom: { kind: 'image', url: 'blob:x', depth: 0.1, relief: false } })] }
    expect(serializeWorld(w, true).objects).toHaveLength(0)
    expect(serializeWorld(w).objects).toHaveLength(1)
  })

  it('travels inside a piece', () => {
    const world = WORLD_PRESETS[1].world()
    const text = serializePiece({ source: { kind: 'world', world }, config: mergeConfig({ bg: '#000000' }) })
    const parsed = parsePiece(text)
    expect('piece' in parsed && parsed.piece.source.kind === 'world' && parsed.piece.source.world.objects.length).toBe(world.objects.length)
  })
})

describe('animation', () => {
  it('periodic behaviours repeat and add up', () => {
    const anim = [
      { type: 'bob', axis: 'y', amp: 0.5, speed: 0.5, phase: 0 },
      { type: 'orbit', radius: 1, speed: 90, tilt: 0, phase: 0, plane: 'xz' },
      { type: 'spin', axis: 'z', speed: 45 },
    ] as const
    const a = evalAnim([...anim], 0.5)
    expect(a.pos[1]).toBeCloseTo(0.5 * Math.sin(Math.PI / 2))
    expect(a.pos[0]).toBeCloseTo(Math.cos(Math.PI / 4))
    expect(a.rot[2]).toBeCloseTo(22.5)
    expect(evalAnim([...anim], 2.5).pos[1]).toBeCloseTo(a.pos[1])
  })

  it('drift wraps inside its range', () => {
    const anim: Behaviour[] = [{ type: 'drift', vel: [1, 0, 0], wrap: 1 }]
    for (const t of [0, 0.7, 3.3, 10]) {
      const x = 0.2 + evalAnim(anim, t, [0.2, 0, 0]).pos[0]
      expect(x).toBeGreaterThanOrEqual(-1)
      expect(x).toBeLessThanOrEqual(1)
    }
  })

  it('keyframes interpolate and loop', () => {
    const b = { type: 'keys', loop: 4, ease: 'linear', keys: [{ t: 0, pos: [0, 0, 0] }, { t: 2, pos: [0, 1, 0], scale: 2 }, { t: 4, pos: [0, 0, 0] }] } as const
    const mid = sampleKeys({ ...b, keys: b.keys.map((k) => ({ ...k })) as never }, 1)
    expect(mid.pos[1]).toBeCloseTo(0.5)
    expect(sampleKeys(b as never, 5).pos[1]).toBeCloseTo(0.5)
    expect(sampleKeys(b as never, 2).scale).toBeCloseTo(2)
  })

  it('arrays place copies on a ring and stagger their time', () => {
    const o = makeObject('shape', { scale: [1, 1, 1], array: { count: 4, offset: [1, 0, 0], step: [0, 0, 0], rot: [0, 90, 0], grow: 1, spin: 0, phase: 0.5 } })
    const inst = objectInstances(o, 2)
    expect(inst).toHaveLength(4)
    expect(inst.map((i) => i.t)).toEqual([2, 1.5, 1, 0.5])
    for (const i of inst) expect(Math.hypot(i.center[0], i.center[2])).toBeCloseTo(1)
    expect(inst[1].center[2]).toBeCloseTo(-1)
  })
})

describe('geometry', () => {
  it('flat shapes stay inside their unit box and bevel tilts edge normals', () => {
    const m = buildGeom({ kind: 'flat', type: 'star', sides: 5, inner: 0.4, round: 0, bevel: 0.1, depth: 0 }, 0.02)!.model
    expect(m.count).toBeGreaterThan(100)
    let tilted = 0
    for (let i = 0; i < m.count; i++) {
      expect(Math.abs(m.pos[i * 3])).toBeLessThanOrEqual(0.52)
      if (m.nrm[i * 3 + 2] < 0.99) tilted++
    }
    expect(tilted).toBeGreaterThan(0)
    expect(flatSdf('circle', 0, 0, 0)(0, 0)).toBeLessThan(0)
    expect(flatSdf('ring', 0, 0.5, 0)(0, 0)).toBeGreaterThan(0)
  })

  it('solids sample per axis: a long thin log costs about as much as its surface', () => {
    const thin = buildGeom({ kind: 'shape', type: 'cylinder' }, [0.2, 0.01, 0.2])!.model
    const fat = buildGeom({ kind: 'shape', type: 'cylinder' }, 0.01)!.model
    expect(thin.count).toBeLessThan(fat.count / 10)
    for (let i = 0; i < thin.count * 3; i += 3) expect(Math.hypot(thin.nrm[i], thin.nrm[i + 1], thin.nrm[i + 2])).toBeCloseTo(1)
  })

  it('particles move with time and stay in their cube', () => {
    const g = buildGeom({ kind: 'particles', type: 'snow', count: 200, speed: 1, seed: 3 }, 0.02)!
    const before = g.model.pos.slice()
    g.update!(3)
    expect(g.model.pos).not.toEqual(before)
    for (const v of g.model.pos) expect(Math.abs(v)).toBeLessThanOrEqual(0.55)
  })

  it('ocean terrain animates; still hills do not', () => {
    expect(buildGeom({ kind: 'terrain', type: 'ocean', amp: 0.1, freq: 3, speed: 1, seed: 1 }, 0.05)!.update).toBeTypeOf('function')
    expect(buildGeom({ kind: 'terrain', type: 'mountains', amp: 0.1, freq: 3, speed: 0, seed: 1 }, 0.05)!.update).toBeUndefined()
  })
})

describe('fields', () => {
  it('every field stays in [0, 1] (or -1 for empty) and changes over time', () => {
    for (const type of FIELD_TYPES) {
      const f = defaultField(type)
      const a = fieldSampler(f, 0.3, 60)
      const b = fieldSampler(f, 2.1, 60)
      let differs = false
      for (let i = 0; i < 400; i++) {
        const x = (i % 20) / 10 - 1
        const y = Math.floor(i / 20) / 10 - 1
        const va = a(x, y, i % 20, Math.floor(i / 20))
        expect(va === -1 || (va >= 0 && va <= 1)).toBe(true)
        if (va !== b(x, y, i % 20, Math.floor(i / 20))) differs = true
      }
      expect(differs || type === 'gradient', type).toBe(true)
    }
  })
})

describe('WorldRenderer', () => {
  it('objects occlude back fields; front fields draw over objects', () => {
    const sphere = makeObject('shape', { scale: [1.4, 1.4, 1.4], charset: '#' })
    const back = { ...defaultField('gradient'), charset: 'b', colors: ['#ffffff', '#ffffff'] }
    const world: World = { ...parseWorld({})!, objects: [sphere], fields: [back] }
    const text = render(world).r.toText()
    expect(text).toContain('#')
    expect(text).toContain('b')
    // Centre row: sphere in the middle, field at the edges.
    const rows = text.split('\n')
    const mid = rows[Math.floor(rows.length / 2)]
    expect(mid[Math.floor(mid.length / 2)]).toBe('#')
    const front = { ...back, id: 'f', layer: 'front' as const, charset: 'F' }
    const covered = render({ ...world, fields: [back, front] }).r.toText()
    expect(covered).not.toContain('#')
  })

  it('picks the object under a pixel', () => {
    const a = makeObject('shape', { pos: [-0.7, 0, 0], scale: [0.5, 0.5, 0.5] })
    const b = makeObject('shape', { pos: [0.7, 0, 0], scale: [0.5, 0.5, 0.5] })
    const world: World = { ...parseWorld({ camera: { rot: [0, 0, 0], fov: 0 } })!, objects: [a, b] }
    const { r } = render(world)
    const pa = r.project(-0.7, 0, 0)
    const pb = r.project(0.7, 0, 0)
    expect(r.pickObject(pa.x, pa.y)).toBe(0)
    expect(r.pickObject(pb.x, pb.y)).toBe(1)
    expect(r.pickObject(240, 10)).toBe(-1)
  })

  it('every gallery world parses, renders glyphs and stays within a point budget', () => {
    for (const p of WORLD_PRESETS) {
      const world = parseWorld(serializeWorld(p.world()))!
      expect(world.objects.length, p.key).toBeGreaterThan(0)
      const { stats } = render(world, { ...mergeConfig(p.config), cellSize: 8, intro: 0 })
      expect(stats.glyphs, p.key).toBeGreaterThan(200)
      expect(stats.points, p.key).toBeLessThan(900_000)
    }
  })
})

describe('AI replies', () => {
  it('reads prose + fenced world JSON and keeps only allowed config keys', () => {
    const reply = parseAiReply(
      'A small moon over the sea.\n\n```json\n{"world":{"name":"Moon","objects":[{"geom":{"kind":"shape","type":"sphere"}}],"fields":[]},"config":{"bg":"#000000","charset":" .#","zoom":4,"cellSize":"big"}}\n```',
    )
    expect(reply.text).toBe('A small moon over the sea.')
    expect(reply.world?.name).toBe('Moon')
    expect(reply.world?.objects).toHaveLength(1)
    expect(reply.config).toEqual({ bg: '#000000', charset: ' .#' })
  })

  it('survives a bare object, a missing fence end and garbage', () => {
    expect(parseAiReply('{"objects":[{"geom":{"kind":"flat","type":"heart"}}]}').world?.objects).toHaveLength(1)
    expect(parseAiReply('ok\n```json\n{"world":{"objects":[{"geom":{"kind":"shape","type":"box"}}]}}').world).not.toBeNull()
    expect(parseAiReply('no scene here').world).toBeNull()
    expect(parseAiReply('```json\n{"world": {"objects": [}\n```').world).toBeNull()
  })
})
