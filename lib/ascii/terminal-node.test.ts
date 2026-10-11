import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createCanvas } from '@napi-rs/canvas'
import { describe, expect, it } from 'vitest'
import { encodeShare } from '../../components/studio/share'
import { mergeConfig } from './config'
import { serializePiece } from './piece'
import { openPiece, openTerminalPiece } from './terminal-node'
import { emptyWorld, makeObject } from './world'

const ink = (lines: string[]) => lines.join('').replace(/\s/g, '').length
const size = { cols: 60, rows: 20, depth: 'none' as const }

describe('openPiece', () => {
  it('resolves gallery keys, studio links and raw JSON', () => {
    expect(openPiece('koi').origin).toBe('gallery')
    expect(openPiece('http://localhost:3000/studio#w=koi').piece.name).toBe('Koi pond')
    const link = `https://x.dev/studio#s=${encodeShare(mergeConfig({}), { kind: 'text', text: 'OK', fontKey: 'system', weight: 700 })}`
    expect(openPiece(link).piece.source).toMatchObject({ kind: 'text', text: 'OK' })
    expect(openPiece('{"v":1,"source":{"kind":"preset","key":"heart"},"config":{}}').piece.source.kind).toBe('preset')
    expect(() => openPiece('nope-not-a-thing')).toThrow(/gallery key/)
  })
})

describe('openTerminalPiece', () => {
  it('renders canvas sources: text, preset and an image file next to the piece', async () => {
    expect(ink((await openTerminalPiece(openPiece('{"source":{"kind":"text","text":"HI","fontKey":"system","weight":800}}'), size)).frame(0))).toBeGreaterThan(80)
    expect(ink((await openTerminalPiece(openPiece('{"source":{"kind":"preset","key":"bolt"}}'), size)).frame(0))).toBeGreaterThan(80)

    const dir = mkdtempSync(join(tmpdir(), 'oma-'))
    const c = createCanvas(64, 64)
    const g = c.getContext('2d')
    g.fillStyle = '#ff3366'
    g.fillRect(12, 12, 40, 40)
    writeFileSync(join(dir, 'square.png'), c.toBuffer('image/png'))
    writeFileSync(join(dir, 'sq.ascii.json'), JSON.stringify({ v: 1, source: { kind: 'image', path: 'square.png' }, config: {} }))
    const r = await openTerminalPiece(openPiece(join(dir, 'sq.ascii.json')), { ...size, depth: 'truecolor' })
    expect(r.errors).toEqual([])
    expect(ink(r.frame(0).map((l) => l.replace(/\x1b\[[\d;]*m/g, '')))).toBeGreaterThan(80)
  })

  it('builds text objects inside worlds and reports missing images instead of failing', async () => {
    const world = { ...emptyWorld(), objects: [makeObject('text', { name: 'Title' }), makeObject('image', { name: 'Gone' })] }
    const g = world.objects[1].geom
    if (g.kind === 'image') g.url = 'missing.png'
    const r = await openTerminalPiece({ source: { kind: 'world', world }, config: mergeConfig({}) }, size)
    expect(ink(r.frame(0))).toBeGreaterThan(10)
    expect(r.errors.join()).toMatch(/Gone/)
    expect(r.skipped).toEqual(['Gone'])
    expect(serializePiece({ source: { kind: 'world', world }, config: mergeConfig({}) })).toContain('Title')
  })
})
