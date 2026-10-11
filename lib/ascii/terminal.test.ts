import { describe, expect, it } from 'vitest'
import { mergeConfig } from './config'
import type { Piece } from './piece'
import { cellsToAnsi, createTerminalRenderer, detectColorDepth, parseColor } from './terminal'
import { getWorldPreset } from './worlds'

const koi = (): Piece => {
  const p = getWorldPreset('koi')!
  return { name: p.label, source: { kind: 'world', world: p.world() }, config: mergeConfig(p.config) } as Piece
}

describe('terminal renderer', () => {
  it('parses canvas colour strings', () => {
    expect(parseColor('#ff8000')).toBe(0xff8000)
    expect(parseColor('#fff')).toBe(0xffffff)
    expect(parseColor('rgb(1, 2, 3)')).toBe(0x010203)
    expect(parseColor('rgba(255,0,0,0.5)')).toBe(0xff0000)
  })

  it('renders a gallery world to sized, coloured lines', () => {
    const r = createTerminalRenderer(koi(), { cols: 60, rows: 20, depth: 'truecolor' })
    const lines = r.frame(1)
    expect(lines).toHaveLength(20)
    expect(lines.join('')).toMatch(/\x1b\[38;2;\d+;\d+;\d+m/)
    // Piece background is painted so dim fields stay dim on any terminal theme.
    expect(lines[0].startsWith('\x1b[48;2;')).toBe(true)
    const plain = createTerminalRenderer(koi(), { cols: 60, rows: 20, depth: 'none' }).frame(1)
    expect(plain.every((l) => [...l].length === 60 && !l.includes('\x1b'))).toBe(true)
    expect(plain.join('').trim().length).toBeGreaterThan(100)
  })

  it('corrects for tall terminal cells', () => {
    // A round pond is wider than tall in characters at aspect 2, and roughly square at aspect 1.
    const extent = (aspect: number) => {
      const lines = createTerminalRenderer(koi(), { cols: 80, rows: 40, depth: 'none', cellAspect: aspect }).frame(0)
      const ink = lines.map((l) => l.replace(/[ .·]/g, ' '))
      const rows = ink.filter((l) => l.trim()).length
      return rows
    }
    expect(extent(2)).toBeLessThan(extent(1))
  })

  it('emits a colour code only when the colour changes', () => {
    const cells = [
      { char: 'a', rgb: 0xff0000 },
      { char: 'b', rgb: 0xff0000 },
      { char: ' ', rgb: -1 },
    ]
    expect(cellsToAnsi(cells, 3, 1, '256')).toEqual(['\x1b[38;5;196mab \x1b[0m'])
  })

  it('honours NO_COLOR', () => {
    expect(detectColorDepth({ NO_COLOR: '1', COLORTERM: 'truecolor' })).toBe('none')
    expect(detectColorDepth({ COLORTERM: 'truecolor' })).toBe('truecolor')
  })
})
