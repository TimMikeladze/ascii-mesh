import { describe, expect, it } from 'vitest'
import {
  buildSceneModel,
  sceneChanges,
  dabChanges,
  colorizeModel,
  emptyScene,
  makePrim,
  paintDab,
  sceneSdf,
  parseObj,
  parseScene,
  parseStl,
  serializeScene,
  starterScene,
  updateSceneModel,
  type MeshScene,
  type SceneModel,
} from './scene'


/** Share of z-buffer winners (orthographic, looking down -Z) that sit behind the true first surface. */
function leakRatio(m: SceneModel, s: MeshScene): number {
  const f = sceneSdf(s)
  const cell = 0.012
  const front = new Map<number, number>()
  for (let i = 0; i < m.count; i++) {
    const k = Math.floor(m.pos[i * 3] / cell) * 100000 + Math.floor(m.pos[i * 3 + 1] / cell)
    const cur = front.get(k)
    if (cur === undefined || m.pos[i * 3 + 2] > m.pos[cur * 3 + 2]) front.set(k, i)
  }
  let leaks = 0
  front.forEach((i) => {
    const x = m.pos[i * 3]
    const y = m.pos[i * 3 + 1]
    let z = 2
    while (z > -2 && f(x, y, z) > 0.002) z -= Math.min(0.02, Math.max(0.002, f(x, y, z) * 0.8))
    if (z - m.pos[i * 3 + 2] > 0.03) leaks++
  })
  return leaks / front.size
}

const scene = (patch: Partial<MeshScene>): MeshScene => ({ ...emptyScene(), blend: 0, ...patch })

describe('buildSceneModel', () => {
  it('samples a sphere on its surface with outward normals', () => {
    const m = buildSceneModel(scene({ prims: [makePrim('sphere')] }), 96)
    expect(m.count).toBeGreaterThan(1000)
    for (let i = 0; i < m.count; i += 97) {
      const o = i * 3
      const r = Math.hypot(m.pos[o], m.pos[o + 1], m.pos[o + 2])
      expect(r).toBeCloseTo(0.5, 2)
      const dot = (m.pos[o] * m.nrm[o] + m.pos[o + 1] * m.nrm[o + 1] + m.pos[o + 2] * m.nrm[o + 2]) / r
      expect(dot).toBeGreaterThan(0.95)
    }
    expect(m.prim.every((p) => p === 0)).toBe(true)
  })

  it('subtract carves points out and adds the cavity wall', () => {
    const box = makePrim('box')
    const hole = makePrim('sphere', { op: 'subtract', pos: [0, 0.5, 0], scale: [0.6, 0.6, 0.6], color: '#ff0000' })
    const solid = buildSceneModel(scene({ prims: [box] }), 96)
    const carved = buildSceneModel(scene({ prims: [box, hole] }), 96)
    // No point remains inside the subtracted sphere.
    for (let i = 0; i < carved.count; i++) {
      const o = i * 3
      expect(Math.hypot(carved.pos[o], carved.pos[o + 1] - 0.5, carved.pos[o + 2])).toBeGreaterThan(0.3 - 0.02)
    }
    // Cavity points carry the subtract shape's colour and index.
    const cavity = Array.from(carved.prim).filter((p) => p === 1).length
    expect(cavity).toBeGreaterThan(100)
    expect(carved.count).not.toBe(solid.count)
  })

  it('culls surfaces buried inside another shape (union)', () => {
    const big = makePrim('sphere', { scale: [2, 2, 2] })
    const small = makePrim('sphere', { scale: [0.5, 0.5, 0.5] })
    const m = buildSceneModel(scene({ prims: [big, small] }), 96)
    expect(Array.from(m.prim).filter((p) => p === 1).length).toBe(0)
  })

  it('sculpt dabs add geometry', () => {
    const base = scene({ prims: [makePrim('sphere')], blend: 0.05 })
    const before = buildSceneModel(base, 96)
    const after = buildSceneModel({ ...base, dabs: [{ p: [0.5, 0, 0], r: 0.15, op: 'add', color: '#00ff00' }] }, 96)
    let maxX = 0
    for (let i = 0; i < after.count; i++) maxX = Math.max(maxX, after.pos[i * 3])
    expect(maxX).toBeGreaterThan(0.6)
    expect(before.count).toBeGreaterThan(0)
    // Dab points take the dab's colour (green).
    expect(Array.from({ length: after.count }).some((_, i) => after.col[i * 3 + 1] === 255 && after.col[i * 3] === 0)).toBe(true)
  })

  it('builds the starter scene within budget', () => {
    const t = performance.now()
    const m = buildSceneModel(starterScene(), 288)
    expect(m.count).toBeGreaterThan(10_000)
    expect(m.count).toBeLessThanOrEqual(420_000 * 1.2)
    expect(performance.now() - t).toBeLessThan(4000)
  })

  it('returns an empty model for an empty scene', () => {
    expect(buildSceneModel(emptyScene(), 96).count).toBe(0)
  })
})

describe('paint', () => {
  it('colours points near the dab and leaves the rest', () => {
    const m = buildSceneModel(scene({ prims: [makePrim('sphere', { color: '#ffffff' })] }), 96)
    const paint: Record<number, number> = {}
    paintDab(paint, [0.5, 0, 0], 0.1, 0xff0000)
    const c = colorizeModel(m, paint)
    let red = 0
    let white = 0
    for (let i = 0; i < c.count; i++) {
      const o = i * 3
      if (c.col[o] === 255 && c.col[o + 1] === 0) {
        red++
        expect(c.pos[o]).toBeGreaterThan(0.35)
      } else if (c.col[o + 1] === 255) white++
    }
    expect(red).toBeGreaterThan(10)
    expect(white).toBeGreaterThan(red)
    // Base colours untouched.
    expect(m.col.every((v) => v === 255)).toBe(true)
  })
})

describe('mesh import', () => {
  it('parses OBJ quads into triangles normalised to a unit box', () => {
    const tris = parseObj('v 0 0 0\nv 2 0 0\nv 2 2 0\nv 0 2 0\nf 1 2 3 4\n')
    expect(tris.length).toBe(18)
    expect(Math.max(...tris)).toBeCloseTo(0.5)
    expect(Math.min(...tris)).toBeCloseTo(-0.5)
  })

  it('parses binary and ASCII STL', () => {
    const buf = new ArrayBuffer(84 + 50)
    const view = new DataView(buf)
    view.setUint32(80, 1, true)
    ;[0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((v, i) => view.setFloat32(84 + 12 + i * 4, v, true))
    expect(parseStl(buf).length).toBe(9)
    const ascii = 'solid t\nfacet normal 0 0 1\nouter loop\nvertex 0 0 0\nvertex 1 0 0\nvertex 0 1 0\nendloop\nendfacet\nendsolid t'
    expect(parseStl(new TextEncoder().encode(ascii).buffer as ArrayBuffer).length).toBe(9)
  })

  it('rejects files without faces', () => {
    expect(() => parseObj('v 0 0 0\n')).toThrow()
  })

  it('samples imported meshes into points', () => {
    const tris = parseObj('v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nf 1 2 3 4\n')
    const s = scene({ prims: [{ ...makePrim('box'), type: 'mesh', meshId: 'm' }], meshes: { m: { name: 'quad', tris } } })
    const m = buildSceneModel(s, 96)
    expect(m.count).toBeGreaterThan(100)
  })
})

describe('serialisation', () => {
  it('round-trips scenes including paint and meshes', () => {
    const tris = parseObj('v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n')
    const s = starterScene()
    s.prims.push({ ...makePrim('box'), type: 'mesh', meshId: 'm' })
    s.meshes = { m: { name: 'tri', tris } }
    s.dabs = [{ p: [0.1, 0.2, 0.3], r: 0.05, op: 'subtract', color: '#123456' }]
    paintDab(s.paint, [0, 0, 0], 0.05, 0xabcdef)
    const back = parseScene(JSON.parse(JSON.stringify(serializeScene(s))))!
    expect(back.prims.length).toBe(s.prims.length)
    expect(back.dabs).toEqual(s.dabs)
    expect(Object.keys(back.paint).length).toBe(Object.keys(s.paint).length)
    expect(Array.from(back.meshes.m.tris)).toEqual(Array.from(tris))
  })

  it('lite form drops paint and meshes', () => {
    const s = starterScene()
    s.prims.push({ ...makePrim('box'), type: 'mesh', meshId: 'm' })
    s.meshes = { m: { name: 'tri', tris: new Float32Array(9) } }
    const lite = serializeScene(s, true)
    expect(lite.paint).toBeUndefined()
    expect(lite.prims.some((p) => p.type === 'mesh')).toBe(false)
  })

  it('drops malformed entries', () => {
    const back = parseScene({ v: 1, prims: [{ type: 'blob' }, { ...makePrim('sphere'), pos: [0, 0] }, makePrim('cone')], dabs: [{ p: [0, 0, 0], r: -1 }], blend: 0.1 })
    expect(back?.prims.map((p) => p.type)).toEqual(['cone'])
    expect(back?.dabs).toEqual([])
    expect(parseScene('nope')).toBeNull()
  })
})

describe('robustness', () => {
  it('keeps every point near the shapes, even with overlapping carve dabs', () => {
    const s = starterScene()
    for (let i = 0; i < 60; i++) {
      const a = i * 0.21
      s.dabs.push({ p: [Math.cos(a) * 0.45, 0.22 + Math.sin(a) * 0.4, 0.3], r: 0.08, op: i % 2 ? 'subtract' : 'add', color: '#ffffff' })
    }
    const m = buildSceneModel(s, 160)
    expect(m.radius).toBeLessThan(1.2)
  })
})

describe('coverage', () => {
  it('leaves no holes in an overlapping sculpt stroke (front surface always sampled)', () => {
    const s = starterScene()
    for (let i = 0; i < 46; i++) {
      const a = i * 0.1
      s.dabs.push({ p: [Math.cos(a) * 0.45, 0.22 + Math.sin(a) * 0.45, 0.2], r: 0.08, op: i < 25 ? 'add' : 'subtract', color: '#fff' })
    }
    expect(leakRatio(buildSceneModel(s, 192), s)).toBeLessThan(0.01)
  })
})

describe('updateSceneModel', () => {
  it('dabChanges detects strokes and undo, rejects unrelated lists', () => {
    const a = { p: [0, 0, 0] as [number, number, number], r: 0.1, op: 'add' as const, color: '#fff' }
    const b = { ...a }
    expect(dabChanges([a], [a, b])).toEqual([b])
    expect(dabChanges([a, b], [a])).toEqual([b])
    expect(dabChanges([a], [b])).toBeNull()
  })

  const stroke = (n: number) =>
    Array.from({ length: n }, (_, i) => ({ p: [Math.cos(i * 0.1) * 0.45, 0.22 + Math.sin(i * 0.1) * 0.45, 0.2] as [number, number, number], r: 0.08, op: 'add' as const, color: '#00ff00' }))

  it('matches a full rebuild when dabs are added', () => {
    const base = starterScene()
    base.dabs = stroke(10)
    const prev = buildSceneModel(base, 128)
    const added = stroke(14).slice(10)
    const next = { ...base, dabs: [...base.dabs, ...added] }
    const inc = updateSceneModel(prev, next, sceneChanges(base, next)!)
    // Same spacing as `prev`, so compare against a full build at that spacing via the same h.
    const full = updateSceneModel(prev, next, [{ c: [0, 0, 0], r: 10 }])
    expect(Math.abs(inc.count - full.count) / full.count).toBeLessThan(0.1)
    expect(leakRatio(inc, next)).toBeLessThan(0.01)
    let maxX = -1
    for (let i = 0; i < inc.count; i++) if (inc.col[i * 3 + 1] === 255 && inc.col[i * 3] === 0) maxX = Math.max(maxX, inc.pos[i * 3 + 1])
    expect(maxX).toBeGreaterThan(0.6)
  })

  it('handles a moved shape locally and matches the moved geometry', () => {
    const base = starterScene()
    const prev = buildSceneModel(base, 128)
    const moved = { ...base, prims: base.prims.map((p, i) => (i === 0 ? { ...p, pos: [0.3, 0.3, 0] as [number, number, number] } : p)) }
    const zones = sceneChanges(base, moved)
    expect(zones?.length).toBe(2)
    const inc = updateSceneModel(prev, moved, zones!)
    expect(leakRatio(inc, moved)).toBeLessThanOrEqual(leakRatio(buildSceneModel(moved, 128), moved) + 0.002)
    // No stale points left where the sphere used to poke out on the -x side.
    const f = sceneSdf(moved)
    let stale = 0
    for (let i = 0; i < inc.count; i++) if (Math.abs(f(inc.pos[i * 3], inc.pos[i * 3 + 1], inc.pos[i * 3 + 2])) > 0.03) stale++
    expect(stale / inc.count).toBeLessThan(0.002)
  })

  it('needs a full rebuild for structural edits', () => {
    const base = starterScene()
    expect(sceneChanges(base, { ...base, blend: 0.2 })).toBeNull()
    expect(sceneChanges(base, { ...base, prims: base.prims.slice(1) })).toBeNull()
    expect(sceneChanges(base, { ...base })).toEqual([])
  })

  it('removes geometry when dabs are undone', () => {
    const base = starterScene()
    const dabs = stroke(6)
    const withDabs = buildSceneModel({ ...base, dabs }, 128)
    const undone = updateSceneModel(withDabs, base, sceneChanges({ ...base, dabs }, base)!)
    expect(Array.from({ length: undone.count }).some((_, i) => undone.col[i * 3 + 1] === 255 && undone.col[i * 3] === 0)).toBe(false)
  })
})
