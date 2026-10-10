import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { StudioFiles, galleryList, galleryPiece, renderPieceText, studioGuide, validatePiece } from './studio'

const tmp = () => mkdtempSync(join(tmpdir(), 'ohmyascii-'))

describe('StudioFiles', () => {
  it('writes normalised pieces, lists them, reads them with their frame, and stays inside the root', () => {
    const root = tmp()
    const files = new StudioFiles(root)
    const { written } = files.writePiece('art/koi.ascii.json', galleryPiece('koi'))
    expect(JSON.parse(written).source.kind).toBe('world')
    writeFileSync(join(root, 'art/koi.frame.txt'), '~~ koi ~~')
    expect(files.listPieces()).toEqual([{ path: 'art/koi.ascii.json', name: 'Koi pond', kind: 'world', hasFrame: true }])
    expect(files.readPiece('art/koi.ascii.json').frame).toBe('~~ koi ~~')
    expect(() => files.writePiece('../escape.ascii.json', galleryPiece('koi'))).toThrow(/escapes/)
    expect(() => files.writePiece('art/koi.json', galleryPiece('koi'))).toThrow(/\.ascii\.json/)
    expect(() => files.writePiece('bad.ascii.json', '{nope')).toThrow(/Invalid JSON/)
    expect(readFileSync(join(root, 'art/koi.ascii.json'), 'utf8')).toBe(written)
  })
})

describe('tools', () => {
  it('validate explains what the studio would drop', () => {
    const r = validatePiece(JSON.stringify({ source: { kind: 'world', world: { objects: [{ geom: { kind: 'bad' } }, { geom: { kind: 'shape', type: 'box' } }] } }, config: { nope: 1 } }))
    expect(r.piece).not.toBeNull()
    expect(r.warnings.join('\n')).toMatch(/1 object\(s\) dropped[\s\S]*Nothing animates[\s\S]*config\.nope/)
  })

  it('renders worlds and modelled scenes headlessly, at several times', () => {
    const out = renderPieceText(galleryPiece('mandala'), { times: [0, 3], cols: 60, rows: 24 })
    const frames = out.split(/^t = /m).filter(Boolean)
    expect(frames).toHaveLength(2)
    expect(frames[0].replace(/\s/g, '').length).toBeGreaterThan(100)
    expect(frames[0]).not.toBe(frames[1])
    const scene = JSON.stringify({ source: { kind: 'scene', scene: { v: 1, blend: 0.1, prims: [{ type: 'sphere', op: 'add', pos: [0, 0, 0], rot: [0, 0, 0], scale: [1, 1, 1], color: '#ffffff' }], dabs: [] } }, config: { gridDots: false } })
    expect(renderPieceText(scene, { times: [0] }).replace(/\s/g, '').length).toBeGreaterThan(100)
    expect(() => renderPieceText(JSON.stringify({ source: { kind: 'preset', key: 'star' } }))).toThrow(/only in the studio/)
  })

  it('gallery and guide are complete', () => {
    expect(galleryList().length).toBeGreaterThanOrEqual(13)
    expect(() => galleryPiece('nope')).toThrow(/Keys:/)
    expect(studioGuide()).toMatch(/write_piece[\s\S]*frame\.txt/)
  })
})
