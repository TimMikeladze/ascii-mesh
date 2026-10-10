import { DEFAULT_CONFIG, diffFromDefaults, mergeConfig, type AsciiConfig } from '@/lib/ascii/config'
import { parseScene, serializeScene, type MeshScene } from '@/lib/ascii/scene'
import { parseWorld, serializeWorld, type World } from '@/lib/ascii/world'
import type { SourceState } from './types'

// Share links: `#s=<base64url JSON>` holding the config diff, a non-upload source and, for
// modelled scenes, the shapes + sculpt (paint and imported meshes stay local). Pure functions so
// the home page can build studio links without pulling in the whole studio component.

export function encodeShare(cfg: AsciiConfig, source: SourceState, scene?: MeshScene, world?: World): string {
  const src = source.kind === 'upload' ? undefined : source
  const m = source.kind === 'scene' && scene ? serializeScene(scene, true) : undefined
  const w = source.kind === 'world' && world ? serializeWorld(world, true) : undefined
  const bytes = new TextEncoder().encode(JSON.stringify({ c: diffFromDefaults(cfg), s: src, m, w }))
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeShare(hash: string): { cfg: AsciiConfig; source?: SourceState; scene?: MeshScene; world?: World } | null {
  const m = hash.match(/[#&]s=([\w-]+)/)
  if (!m) return null
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))))
    const known = Object.fromEntries(Object.entries(data.c ?? {}).filter(([k]) => k in DEFAULT_CONFIG))
    const s = data.s as SourceState | undefined
    const scene = data.m ? (parseScene(data.m) ?? undefined) : undefined
    const world = data.w ? (parseWorld(data.w) ?? undefined) : undefined
    // A scene / world source without a payload (session restore) uses the separately saved one.
    const source = s && (s.kind === 'preset' || s.kind === 'text' || s.kind === 'scene' || s.kind === 'world') ? s : undefined
    return { cfg: mergeConfig(known as Partial<AsciiConfig>), source, scene, world }
  } catch {
    return null
  }
}
