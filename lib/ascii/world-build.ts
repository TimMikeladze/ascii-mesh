'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import type { Model } from './model'
import { buildObjectModel as buildAsync, objectSpacing, quantize } from './world-assets'
import { buildGeom, type GeomModel } from './world-geom'
import type { BuiltObject } from './world-renderer'
import type { Vec3 } from './scene'
import type { Geom, World, WObject } from './world'

// Builds (and caches) every world object's local point cloud at a spacing that follows the
// screen: ~0.55 of a cell. Text and image geometry load asynchronously.

const sceneIds = new WeakMap<object, number>()
let sceneCounter = 0

function geomKey(g: Geom): string {
  if (g.kind === 'sculpt') {
    let id = sceneIds.get(g.scene)
    if (id === undefined) sceneIds.set(g.scene, (id = ++sceneCounter))
    return `sculpt:${id}`
  }
  return JSON.stringify(g)
}

/**
 * Per-object models for `world`, index-aligned with `world.objects` (null while loading).
 * `pxPerUnit` is screen pixels per world unit, `cellPx` the glyph cell width.
 */
export function useWorldBuild(world: World | null, pxPerUnit: number, cellPx: number): (BuiltObject | null)[] {
  const cache = useRef(new Map<string, GeomModel>())
  const [asyncModels, setAsyncModels] = useState(() => new Map<string, Model>())
  const pending = useRef(new Set<string>())
  const h = quantize((cellPx * 0.6) / Math.max(1e-3, pxPerUnit))

  const jobs = useMemo(() => {
    if (!world) return []
    return world.objects.map((o) => {
      const hl = objectSpacing(o, h)
      return { o, hl, key: `${geomKey(o.geom)}|${hl.join(',')}` }
    })
  }, [world, h])

  // Text / image models load in the background, then trigger a rebuild.
  useEffect(() => {
    for (const { o, hl, key } of jobs) {
      const g = o.geom
      if ((g.kind !== 'text' && g.kind !== 'image') || asyncModels.has(key) || pending.current.has(key)) continue
      pending.current.add(key)
      buildAsync(g, hl)
        .then((m) => setAsyncModels((prev) => new Map(prev).set(key, m)))
        .catch(() => undefined)
        .finally(() => pending.current.delete(key))
    }
  }, [jobs, asyncModels])

  return useMemo(() => {
    const used = new Set<string>()
    const out = jobs.map(({ o, key, hl }) => {
      used.add(key)
      const g = o.geom
      if (g.kind === 'text' || g.kind === 'image') {
        const m = asyncModels.get(key)
        return m ? { model: m } : null
      }
      let built = cache.current.get(key)
      if (!built) {
        built = buildGeom(g, hl) ?? undefined
        if (built) cache.current.set(key, built)
      }
      return built ?? null
    })
    // Keep the cache bounded to what the current world uses.
    for (const k of cache.current.keys()) if (!used.has(k)) cache.current.delete(k)
    return out
  }, [jobs, asyncModels])
}
