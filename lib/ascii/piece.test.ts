import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG } from './config'
import { nextPiecePath, parsePiece, pieceStem, relativeTo, resolveRelative, serializePiece } from './piece'
import { starterScene } from './scene'

describe('pieces', () => {
  it('parses a hand-written piece and keeps only valid config keys', () => {
    const r = parsePiece(
      JSON.stringify({
        name: 'Logo',
        source: { kind: 'preset', key: 'rings' },
        config: { charset: ' .#', cellSize: 9, bogus: 1, zoom: 'big', spinY: null },
      }),
    )
    if ('error' in r) throw new Error(r.error)
    expect(r.piece.name).toBe('Logo')
    expect(r.piece.source).toEqual({ kind: 'preset', key: 'rings' })
    expect(r.piece.config.charset).toBe(' .#')
    expect(r.piece.config.cellSize).toBe(9)
    expect(r.piece.config.zoom).toBe(DEFAULT_CONFIG.zoom)
    expect(r.piece.config.spinY).toBe(DEFAULT_CONFIG.spinY)
    expect('bogus' in r.piece.config).toBe(false)
  })

  it('fills text defaults and accepts image paths', () => {
    const t = parsePiece('{"source":{"kind":"text","text":"HI"}}')
    expect('piece' in t && t.piece.source).toEqual({ kind: 'text', text: 'HI', fontKey: 'geist-mono', weight: 700 })
    const i = parsePiece('{"source":{"kind":"image","path":"logo.svg"}}')
    expect('piece' in i && i.piece.source).toEqual({ kind: 'image', path: 'logo.svg' })
  })

  it('reports errors instead of throwing', () => {
    expect(parsePiece('{oops')).toHaveProperty('error')
    expect(parsePiece('{"source":{"kind":"video"}}')).toHaveProperty('error')
    expect(parsePiece('[]')).toHaveProperty('error')
  })

  it('round-trips a scene piece with a config diff only', () => {
    const scene = starterScene()
    const text = serializePiece({ source: { kind: 'scene', scene }, config: { ...DEFAULT_CONFIG, zoom: 1.4 } })
    expect(JSON.parse(text).config).toEqual({ zoom: 1.4 })
    const r = parsePiece(text)
    if ('error' in r || r.piece.source.kind !== 'scene') throw new Error('bad round trip')
    expect(r.piece.source.scene.prims.map((p) => p.type)).toEqual(scene.prims.map((p) => p.type))
    expect(serializePiece(r.piece)).toBe(text)
  })

  it('resolves paths relative to the piece and refuses to escape the root', () => {
    expect(resolveRelative('art/a.ascii.json', 'logo.svg')).toBe('art/logo.svg')
    expect(resolveRelative('art/a.ascii.json', '../img/x.png')).toBe('img/x.png')
    expect(resolveRelative('a.ascii.json', '../x.png')).toBeNull()
    expect(relativeTo('art/a.ascii.json', 'img/x.png')).toBe('../img/x.png')
    expect(relativeTo('art/a.ascii.json', 'art/x.png')).toBe('x.png')
    expect(resolveRelative('art/a.ascii.json', relativeTo('art/a.ascii.json', 'img/x.png'))).toBe('img/x.png')
    expect(pieceStem('art/a.ascii.json')).toBe('art/a')
    expect(nextPiecePath(['untitled-1.ascii.json'])).toBe('untitled-2.ascii.json')
  })
})

describe('skill example', () => {
  it('accepts a hand-written scene without ids', () => {
    const r = parsePiece(
      JSON.stringify({
        v: 1,
        source: {
          kind: 'scene',
          scene: {
            v: 1,
            blend: 0.12,
            prims: [{ type: 'sphere', op: 'add', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: '#fff' }],
            dabs: [{ p: [0.3, 0.5, 0.2], r: 0.08, op: 'add', color: '#ff6a3d' }],
          },
        },
        config: { colorMode: 'source' },
      }),
    )
    if ('error' in r || r.piece.source.kind !== 'scene') throw new Error('rejected')
    expect(r.piece.source.scene.prims[0].id).toBeTruthy()
    expect(r.piece.source.scene.dabs).toHaveLength(1)
  })
})
