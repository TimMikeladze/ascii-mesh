import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIG, mergeConfig } from '../../lib/ascii/config'
import { WORLD_PRESETS } from '../../lib/ascii/worlds'
import { encodeShare, decodeShare } from './share'

// Share links (`#s=…`) carry the config diff plus a source — and, for worlds, the serialized
// world itself. The home page builds them to hand a chat scene to the studio.

describe('encodeShare / decodeShare', () => {
  it('round-trips a world source with its payload', () => {
    const cfg = mergeConfig(WORLD_PRESETS[0].config)
    const world = WORLD_PRESETS[0].world()
    const hash = encodeShare(cfg, { kind: 'world' }, undefined, world)
    const back = decodeShare(`#s=${hash}`)!
    expect(back.source).toEqual({ kind: 'world' })
    expect(back.world?.objects.map((o) => o.geom)).toEqual(world.objects.map((o) => o.geom))
    expect(back.cfg).toEqual(cfg)
  })

  it('round-trips a preset source and only the config diff', () => {
    const cfg = { ...DEFAULT_CONFIG, cellSize: 9 }
    const back = decodeShare(`#s=${encodeShare(cfg, { kind: 'preset', key: 'starburst' })}`)!
    expect(back.source).toEqual({ kind: 'preset', key: 'starburst' })
    expect(back.cfg.cellSize).toBe(9)
    // Keys left at default are dropped from the link and re-filled on decode.
    expect(back.cfg.charset).toBe(DEFAULT_CONFIG.charset)
  })

  it('drops uploads from links and ignores unknown config keys', () => {
    const back = decodeShare(
      `#s=${encodeShare({ ...DEFAULT_CONFIG, cellSize: 11 }, { kind: 'upload', url: 'blob:x', name: 'a.png' })}`,
    )!
    expect(back.source).toBeUndefined()
    expect(back.cfg.cellSize).toBe(11)
  })

  it('returns null for hashes without a share payload', () => {
    expect(decodeShare('')).toBeNull()
    expect(decodeShare('#w=orrery')).toBeNull()
    expect(decodeShare('#s=not-base64!!')).toBeNull()
  })
})
