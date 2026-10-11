import { isAbsolute, resolve } from 'node:path'
import { headlessLayout, type HeadlessAssets, type HeadlessPlayerOptions } from './headless'
import { buildModel, type Model } from './model'
import { installNodeCanvas } from './node-canvas'
import type { Piece } from './piece'
import { getSourcePresets } from './presets'
import { loadSource } from './source'
import { buildObjectModel, objectSpacing } from './world-assets'

// Node: builds the models that need a canvas (image / text / preset sources, text / image world
// objects) so createHeadlessPlayer can render every kind of piece. Node-only (fs, @napi-rs/canvas).

export interface AssetOptions extends Omit<HeadlessPlayerOptions, 'assets'> {
  /** Directory that relative image paths resolve against (the piece file's folder). */
  baseDir?: string
}

export interface LoadedAssets extends HeadlessAssets {
  /** Objects whose model failed to load, with the reason. */
  errors: string[]
}

/** True when the piece needs `loadPieceAssets` before it can render. */
export function needsAssets(piece: Piece): boolean {
  const s = piece.source
  if (s.kind === 'world') return s.world.objects.some((o) => o.geom.kind === 'text' || o.geom.kind === 'image')
  return s.kind !== 'scene'
}

export async function loadPieceAssets(piece: Piece, opts: AssetOptions = {}): Promise<LoadedAssets> {
  const out: LoadedAssets = { errors: [] }
  if (!needsAssets(piece)) return out
  await installNodeCanvas()
  const { cfg, res, spacing } = headlessLayout(piece, opts)
  const base = opts.baseDir ?? process.cwd()
  const local = (url: string) => (/^(data|https?|blob|file):/.test(url) || isAbsolute(url) ? url : resolve(base, url))
  const s = piece.source

  if (s.kind === 'world') {
    out.objects = await Promise.all(
      s.world.objects.map(async (o, i): Promise<Model | null> => {
        const g = o.geom
        if (g.kind !== 'text' && g.kind !== 'image') return null
        try {
          return await buildObjectModel(g.kind === 'image' ? { ...g, url: local(g.url) } : g, objectSpacing(o, spacing))
        } catch (e) {
          out.errors.push(`${o.name ?? `${g.kind} ${i + 1}`}: ${(e as Error).message}`)
          return null
        }
      }),
    )
    return out
  }

  let loaded
  if (s.kind === 'text') loaded = await loadSource({ kind: 'text', text: s.text, fontKey: s.fontKey, weight: s.weight })
  else if (s.kind === 'image') loaded = await loadSource({ kind: 'url', url: local(s.path), name: s.path })
  else if (s.kind === 'preset') {
    const preset = getSourcePresets().find((p) => p.key === s.key)
    if (!preset) throw new Error(`Unknown preset "${s.key}". Presets: ${getSourcePresets().map((p) => p.key).join(', ')}`)
    loaded = await loadSource({ kind: 'url', url: preset.url, name: `${s.key}.svg` })
  } else return out
  out.source = buildModel(
    loaded,
    { shape: cfg.shape, maskMode: cfg.maskMode, invertMask: cfg.invertMask, threshold: cfg.threshold, smooth: cfg.smooth, thickness: cfg.thickness, reliefDepth: cfg.reliefDepth },
    res,
  )
  return out
}
