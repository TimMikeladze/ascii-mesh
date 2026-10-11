import { buildModel, type Model } from './model'
import { loadSource } from './source'
import type { Vec3 } from './scene'
import type { Geom, WObject } from './world'

// Shared by the studio (world-build.ts) and Node (assets.ts): sample spacing per object and the
// async text / image object models.

/** Quantise a spacing to quarter-octaves so small zoom / resize changes reuse cached models. */
export function quantize(h: number): number {
  return Math.pow(2, Math.round(Math.log2(h) * 4) / 4)
}

/** Local sample spacing per axis: world spacing divided by the object's scale on that axis. */
export function objectSpacing(o: WObject, h: number): Vec3 {
  const grow = o.array ? Math.max(1, o.array.grow ** (o.array.count - 1)) : 1
  return o.scale.map((s) => quantize(Math.min(0.25, Math.max(0.002, h / (Math.max(1e-3, Math.abs(s)) * grow))))) as Vec3
}

export async function buildObjectModel(g: Extract<Geom, { kind: 'text' | 'image' }>, hv: Vec3): Promise<Model> {
  const h = Math.min(hv[0], hv[1])
  const res = Math.round(Math.min(420, Math.max(32, 1 / h)))
  if (g.kind === 'text') {
    const loaded = await loadSource({ kind: 'text', text: g.text, fontKey: g.fontKey, weight: g.weight })
    return buildModel(loaded, { shape: 'extrude', maskMode: 'alpha', invertMask: false, threshold: 0.5, smooth: 1, thickness: Math.max(0.01, g.depth), reliefDepth: 0.3 }, res)
  }
  const loaded = await loadSource({ kind: 'url', url: g.url })
  const relief = g.relief || !(loaded.hasAlpha || loaded.isVector)
  return buildModel(
    loaded,
    relief
      ? { shape: 'relief', maskMode: 'none', invertMask: false, threshold: 0.5, smooth: 0, thickness: 0.2, reliefDepth: Math.max(0.01, g.depth) }
      : { shape: 'extrude', maskMode: 'auto', invertMask: false, threshold: 0.5, smooth: 1, thickness: Math.max(0.01, g.depth), reliefDepth: 0.3 },
    res,
  )
}

