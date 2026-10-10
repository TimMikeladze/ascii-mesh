import { describe, expect, it } from 'vitest'
import { mergeConfig } from './config'
import { applyTone, hash, lightVector, parseHex, toneIndex, visibleText } from './raster'

describe('raster helpers', () => {
  it('parseHex handles short, long and invalid colours', () => {
    expect(parseHex('#fff')).toEqual([255, 255, 255])
    expect(parseHex('#12ab34')).toEqual([0x12, 0xab, 0x34])
    expect(parseHex('nope')).toEqual([0, 0, 0])
  })

  it('hash is deterministic and in [0, 1)', () => {
    for (const n of [0, 1, 42, 99999]) {
      expect(hash(n)).toBe(hash(n))
      expect(hash(n)).toBeGreaterThanOrEqual(0)
      expect(hash(n)).toBeLessThan(1)
    }
  })

  it('lightVector is normalised', () => {
    const [x, y, z] = lightVector(mergeConfig({ lightAzimuth: 30, lightElevation: 60 }), 0, 0)
    expect(Math.hypot(x, y, z)).toBeCloseTo(1)
    const [px, py] = lightVector(mergeConfig({ pointerLight: true }), 1, 1)
    expect(px).toBeGreaterThan(0)
    expect(py).toBeLessThan(0)
  })

  it('applyTone clamps, inverts and adds the scanline', () => {
    const base = mergeConfig({ contrast: 1, brightness: 0, gamma: 1, invert: false, scanStrength: 0 })
    expect(applyTone(2, 0, 10, 0, base)).toBe(1)
    expect(applyTone(0.25, 0, 10, 0, { ...base, invert: true })).toBeCloseTo(0.75)
    expect(applyTone(0.2, 0, 10, 0, { ...base, scanStrength: 0.5, scanSpeed: 1 })).toBeGreaterThan(0.2)
  })

  it('toneIndex stays in range under shimmer', () => {
    const cfg = mergeConfig({ shimmer: 1 })
    for (let id = 0; id < 200; id++) {
      const ci = toneIndex(id % 2, id, 1.3, cfg, 5)
      expect(ci).toBeGreaterThanOrEqual(0)
      expect(ci).toBeLessThan(5)
    }
    expect(toneIndex(0.5, 0, 0, mergeConfig({ shimmer: 0 }), 5)).toBe(2)
  })

  it('visibleText trims to the bounding box', () => {
    const glyphs = [' ', '#']
    // 4x3 grid, glyphs at (1,1) and (2,1)
    expect(visibleText(new Int32Array([5, 6]), [1, 1], glyphs, 4, 3, 2)).toBe('##')
    expect(visibleText(new Int32Array(0), [], glyphs, 4, 3, 0)).toBe('')
  })
})
