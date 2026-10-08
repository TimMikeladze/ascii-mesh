'use client'

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { CSSProperties, Ref } from 'react'
import useSWR from 'swr'
import { mergeConfig, resolveFontFamily, type AsciiConfig } from '@/lib/ascii/config'
import { buildModel, emptyModel, type Model } from '@/lib/ascii/model'
import { AsciiRenderer } from '@/lib/ascii/renderer'
import {
  buildSceneModel,
  colorizeModel,
  parseScene,
  sceneChanges,
  updateSceneModel,
  type MeshScene,
  type SceneModel,
  type Vec3,
} from '@/lib/ascii/scene'
import { loadSource, sourceKey, type SourceSpec } from '@/lib/ascii/source'
import { objectInstances, parseWorld, type World } from '@/lib/ascii/world'
import { useWorldBuild } from '@/lib/ascii/world-build'
import { WorldRenderer, type BuiltObject } from '@/lib/ascii/world-renderer'

export interface AsciiMeshStats {
  fps: number
  cols: number
  rows: number
  points: number
  glyphs: number
}

export interface AsciiMeshHandle {
  getCanvas: () => HTMLCanvasElement | null
  resetView: () => void
  /** Current frame as plain-text ASCII. */
  getText: () => string
  /** The point cloud currently being drawn. */
  getModel: () => Model
}

/** A surface point under the pointer, in model space. */
export interface MeshHit {
  point: Vec3
  normal: Vec3
  /** Point index in the model. */
  index: number
  /** `scene.prims` index for scene sources, else -1. */
  prim: number
  color: [number, number, number]
}

export type BrushPhase = 'start' | 'move' | 'end'

export interface AsciiMeshProps {
  source: SourceSpec | string
  config?: Partial<AsciiConfig>
  className?: string
  style?: CSSProperties
  paused?: boolean
  replayKey?: number
  label?: string
  onStats?: (stats: AsciiMeshStats) => void
  onError?: (error: Error) => void
  onLoadingChange?: (loading: boolean) => void
  /** `brush`: primary drag calls `onBrush` instead of rotating (alt / right drag still orbits). */
  tool?: 'orbit' | 'brush'
  /** Brush ring radius in model units. */
  brushRadius?: number
  onBrush?: (hit: MeshHit | null, phase: BrushPhase) => void
  /** Dashed ring drawn around a model-space sphere (e.g. the selected shape). */
  highlight?: { center: Vec3; radius: number } | null
  /** World sources: index of the object to ring (follows its animation). */
  highlightObject?: number | null
  /** World sources: a click (not a drag) on the canvas reports the object under it, or -1. */
  onPickObject?: (index: number) => void
  ref?: Ref<AsciiMeshHandle>
}

function quantize16(n: number) {
  return Math.ceil(n / 16) * 16
}

export function AsciiMesh({
  source,
  config,
  className,
  style,
  paused = false,
  replayKey = 0,
  label = 'Interactive ASCII 3D render',
  onStats,
  onError,
  onLoadingChange,
  tool = 'orbit',
  brushRadius = 0.08,
  onBrush,
  highlight = null,
  highlightObject = null,
  onPickObject,
  ref,
}: AsciiMeshProps) {
  const cfg = useMemo(() => mergeConfig(config), [config])
  const spec = useMemo<SourceSpec>(() => (typeof source === 'string' ? { kind: 'url', url: source } : source), [source])

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<AsciiRenderer | null>(null)
  const worldRendererRef = useRef<WorldRenderer | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })
  const [grabbing, setGrabbing] = useState(false)

  const scene = useMemo<MeshScene | null>(() => {
    if (spec.kind !== 'scene') return null
    return 'v' in spec.scene ? parseScene(spec.scene) : spec.scene
  }, [spec])

  const world = useMemo<World | null>(() => {
    if (spec.kind !== 'world') return null
    return 'v' in spec.world ? parseWorld(spec.world) : spec.world
  }, [spec])

  const isImage = spec.kind !== 'scene' && spec.kind !== 'world'
  const { data: loaded, isValidating } = useSWR(isImage ? ['ascii-source', sourceKey(spec)] : null, () => loadSource(spec as Exclude<SourceSpec, { kind: 'scene' } | { kind: 'world' }>), {
    revalidateOnFocus: false,
    revalidateOnReconnect: false,
    shouldRetryOnError: false,
    keepPreviousData: true,
    onError: (e) => onError?.(e as Error),
  })

  const onLoadingChangeRef = useRef(onLoadingChange)
  useEffect(() => {
    onLoadingChangeRef.current = onLoadingChange
  }, [onLoadingChange])
  useEffect(() => {
    onLoadingChangeRef.current?.(isValidating)
  }, [isValidating])

  const res = useMemo(() => {
    const minSide = Math.min(size.w || 600, size.h || 600)
    const px = (minSide * 0.46 * cfg.zoom) / 0.65
    return Math.min(288, Math.max(48, quantize16(px / (0.55 * Math.max(3, cfg.cellSize)))))
  }, [size.w, size.h, cfg.zoom, cfg.cellSize])

  // Strokes, their undo and shape tweaks are local edits: resample only where the surface changed.
  const geometryRef = useRef<{ scene: MeshScene; res: number; model: SceneModel } | null>(null)
  const sceneGeometry = useMemo(() => {
    if (!scene) return null
    const prev = geometryRef.current
    let model: SceneModel | null = null
    if (prev && prev.res === res) {
      const zones = sceneChanges(prev.scene, scene)
      if (zones && zones.length === 0) model = prev.model
      else if (zones && zones.length < 150) model = updateSceneModel(prev.model, scene, zones)
    }
    model ??= buildSceneModel(scene, res)
    geometryRef.current = { scene, res, model }
    return model
    // Paint changes must not rebuild geometry.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scene?.prims, scene?.dabs, scene?.blend, scene?.meshes, res])
  const sceneModel = useMemo(
    () => (sceneGeometry && scene ? colorizeModel(sceneGeometry, scene.paint) : null),
    [sceneGeometry, scene],
  )

  const worldPx = world ? (Math.min(size.w || 600, size.h || 600) * 0.5 * cfg.zoom * world.camera.zoom) / world.fit : 1
  const worldBuilt = useWorldBuild(world, worldPx, Math.max(3, cfg.cellSize))

  const imageModel = useMemo(
    () =>
      isImage && loaded
        ? buildModel(
            loaded,
            {
              shape: cfg.shape,
              maskMode: cfg.maskMode,
              invertMask: cfg.invertMask,
              threshold: cfg.threshold,
              smooth: cfg.smooth,
              thickness: cfg.thickness,
              reliefDepth: cfg.reliefDepth,
            },
            res,
          )
        : emptyModel(),
    [isImage, loaded, cfg.shape, cfg.maskMode, cfg.invertMask, cfg.threshold, cfg.smooth, cfg.thickness, cfg.reliefDepth, res],
  )
  const model: Model = sceneModel ?? imageModel

  const cfgRef = useRef(cfg)
  const modelRef = useRef(model)
  const pausedRef = useRef(paused)
  const dirtyRef = useRef(true)
  const onStatsRef = useRef(onStats)
  const clockRef = useRef(0)
  const introStartRef = useRef(0)
  const userRef = useRef({ x: 0, y: 0, vx: 0, vy: 0, dragging: false, lastX: 0, lastY: 0, lastT: 0 })
  const autoRef = useRef({ x: 0, y: 0, z: 0, phase: 0 })
  const pointerRef = useRef({ x: 0, y: 0 })
  const zoomMulRef = useRef(1)
  const toolRef = useRef(tool)
  const onBrushRef = useRef(onBrush)
  const brushRadiusRef = useRef(brushRadius)
  const highlightRef = useRef(highlight)
  const worldRef = useRef<{ world: World; built: (BuiltObject | null)[] } | null>(null)
  const highlightObjectRef = useRef(highlightObject)
  const onPickObjectRef = useRef(onPickObject)
  const clickRef = useRef<{ x: number; y: number } | null>(null)
  const ringRef = useRef<HTMLDivElement>(null)
  const highlightElRef = useRef<HTMLDivElement>(null)
  const strokeRef = useRef<number | null>(null)
  // Picking during a stroke uses the surface as it was when the stroke began; otherwise clay
  // would be picked on the clay it just added and climb toward the camera.
  const strokeSnapRef = useRef<{ buf: Int32Array; model: Model } | null>(null)
  useEffect(() => {
    toolRef.current = tool
    onBrushRef.current = onBrush
    brushRadiusRef.current = brushRadius
    if (tool !== 'brush' && ringRef.current) ringRef.current.style.display = 'none'
  }, [tool, onBrush, brushRadius])
  useEffect(() => {
    highlightRef.current = highlight
    dirtyRef.current = true
  }, [highlight])
  useEffect(() => {
    worldRef.current = world ? { world, built: worldBuilt } : null
    highlightObjectRef.current = highlightObject
    onPickObjectRef.current = onPickObject
    dirtyRef.current = true
  }, [world, worldBuilt, highlightObject, onPickObject])

  useEffect(() => {
    cfgRef.current = cfg
    dirtyRef.current = true
  }, [cfg])
  useEffect(() => {
    modelRef.current = model
    dirtyRef.current = true
  }, [model])
  useEffect(() => {
    pausedRef.current = paused
  }, [paused])
  useEffect(() => {
    onStatsRef.current = onStats
  }, [onStats])
  useEffect(() => {
    introStartRef.current = clockRef.current
    dirtyRef.current = true
  }, [replayKey, loaded, spec.kind])

  // Make sure the chosen web font is ready before glyphs are drawn.
  useEffect(() => {
    let cancelled = false
    const family = resolveFontFamily(cfg.fontKey)
    document.fonts
      .load(`${cfg.fontWeight} 16px ${family}`, cfg.charset + cfg.gridChar)
      .catch(() => undefined)
      .then(() => {
        if (cancelled) return
        rendererRef.current?.invalidate()
        dirtyRef.current = true
      })
    return () => {
      cancelled = true
    }
  }, [cfg.fontKey, cfg.fontWeight, cfg.charset, cfg.gridChar])

  const resetView = useCallback(() => {
    const u = userRef.current
    u.x = 0
    u.y = 0
    u.vx = 0
    u.vy = 0
    zoomMulRef.current = 1
    dirtyRef.current = true
  }, [])

  useImperativeHandle(
    ref,
    () => ({
      getCanvas: () => canvasRef.current,
      resetView,
      getText: () => (worldRef.current ? worldRendererRef.current?.toText() : rendererRef.current?.toText()) ?? '',
      getModel: () => modelRef.current,
    }),
    [resetView],
  )

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const renderer = new AsciiRenderer()
    rendererRef.current = renderer
    const worldRenderer = new WorldRenderer()
    worldRendererRef.current = worldRenderer
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1
    let visible = true
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)')
    let reducedMotion = motionQuery.matches
    const onMotionPref = () => {
      reducedMotion = motionQuery.matches
      dirtyRef.current = true
    }
    motionQuery.addEventListener('change', onMotionPref)

    const resize = () => {
      const rect = container.getBoundingClientRect()
      width = Math.max(1, Math.floor(rect.width))
      height = Math.max(1, Math.floor(rect.height))
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      renderer.invalidate()
      worldRenderer.invalidate()
      dirtyRef.current = true
      setSize((prev) => (prev.w === width && prev.h === height ? prev : { w: width, h: height }))
    }
    const resizeObserver = new ResizeObserver(resize)
    resizeObserver.observe(container)
    resize()

    const intersection = new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting
      if (visible) dirtyRef.current = true
    })
    intersection.observe(container)

    let raf = 0
    let last = performance.now()
    let statsTimer = 0
    let frames = 0
    let fps = 0

    const tick = (now: number) => {
      raf = requestAnimationFrame(tick)
      const dt = Math.min(0.05, (now - last) / 1000)
      last = now
      if (!visible) return

      const c = cfgRef.current
      const user = userRef.current
      const auto = autoRef.current
      const isPaused = pausedRef.current
      const w = worldRef.current

      if (!isPaused) clockRef.current += dt

      // Auto-motion holds still while brushing so strokes land where the user aims.
      if (!w && !isPaused && !user.dragging && !reducedMotion && toolRef.current !== 'brush') {
        if (c.motion === 'spin') {
          auto.x += c.spinX * dt
          auto.y += c.spinY * dt
          auto.z += c.spinZ * dt
        } else if (c.motion === 'sway') {
          auto.phase += c.swaySpeed * dt
        }
      }

      if (!user.dragging) {
        user.x += user.vx * dt
        user.y += user.vy * dt
        const decay = Math.pow(Math.max(0.0001, c.inertia), dt)
        user.vx *= decay
        user.vy *= decay
        if (Math.abs(user.vx) < 0.05) user.vx = 0
        if (Math.abs(user.vy) < 0.05) user.vy = 0
      }

      const introProgress = c.intro > 0 && !reducedMotion ? Math.min(1, (clockRef.current - introStartRef.current) / c.intro) : 1
      const moving = user.vx !== 0 || user.vy !== 0
      const animated =
        (w !== null && !isPaused && !reducedMotion) ||
        (c.motion !== 'static' && !isPaused && !reducedMotion) ||
        (!isPaused && (c.waveAmp > 0 || c.shimmer > 0 || c.scanStrength > 0)) ||
        introProgress < 1 ||
        user.dragging ||
        moving ||
        c.pointerLight
      if (!animated && !dirtyRef.current) return
      dirtyRef.current = false

      let rx = c.rotX + user.x
      let ry = c.rotY + user.y
      let rz = c.rotZ
      if (c.motion === 'spin') {
        rx += auto.x
        ry += auto.y
        rz += auto.z
      } else if (c.motion === 'sway') {
        rx += c.swayX * Math.sin(auto.phase * 0.8 + 1)
        ry += c.swayY * Math.sin(auto.phase)
      }

      // Worlds run on their own clock: replay restarts the animation; reduced motion holds frame 0.
      const worldTime = reducedMotion ? 0 : clockRef.current - introStartRef.current
      const stats = w
        ? worldRenderer.render(ctx, width, height, dpr, c, w.world, w.built, {
            time: worldTime,
            introProgress,
            userX: user.x,
            userY: user.y,
            zoomMul: zoomMulRef.current,
            pointerX: pointerRef.current.x,
            pointerY: pointerRef.current.y,
          })
        : renderer.render(ctx, width, height, dpr, c, modelRef.current, {
            rotX: rx,
            rotY: ry,
            rotZ: rz,
            time: clockRef.current,
            introProgress,
            pointerX: pointerRef.current.x,
            pointerY: pointerRef.current.y,
            zoomMul: zoomMulRef.current,
          })

      let hl = highlightRef.current
      const hlIndex = highlightObjectRef.current
      if (w && hlIndex !== null && w.world.objects[hlIndex]) {
        const o = w.world.objects[hlIndex]
        const inst = objectInstances(o, worldTime)
        const b = w.built[hlIndex]
        hl = inst.length && b ? { center: inst[0].center, radius: b.model.radius * inst[0].scale * (inst.length > 1 ? 1.15 : 1) } : null
      } else if (w) hl = null
      const hlEl = highlightElRef.current
      if (hlEl) {
        if (hl && (w || modelRef.current.count > 0)) {
          const p = w ? worldRenderer.project(hl.center[0], hl.center[1], hl.center[2]) : renderer.project(hl.center[0], hl.center[1], hl.center[2])
          const size = Math.max(12, hl.radius * p.scale * 2)
          hlEl.style.display = 'block'
          hlEl.style.transform = `translate(${p.x - size / 2}px, ${p.y - size / 2}px)`
          hlEl.style.width = hlEl.style.height = `${size}px`
        } else hlEl.style.display = 'none'
      }

      frames++
      if (now - statsTimer > 500) {
        fps = Math.round((frames * 1000) / Math.max(1, now - statsTimer))
        frames = 0
        statsTimer = now
        onStatsRef.current?.({ fps, ...stats })
      }
    }
    raf = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(raf)
      resizeObserver.disconnect()
      motionQuery.removeEventListener('change', onMotionPref)
      intersection.disconnect()
      rendererRef.current = null
      worldRendererRef.current = null
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      // Trackpad pinch arrives as ctrl+wheel; treat it as zoom whenever the mesh is interactive.
      const pinch = e.ctrlKey && cfgRef.current.interactive
      if (!cfgRef.current.wheelZoom && !pinch) return
      e.preventDefault()
      zoomMulRef.current = Math.min(3, Math.max(0.4, zoomMulRef.current * Math.exp(-e.deltaY * (pinch ? 0.01 : 0.0015))))
      dirtyRef.current = true
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef({ dist: 1, zoom: 1 })

  const pickAt = (e: React.PointerEvent<HTMLCanvasElement>): MeshHit | null => {
    const renderer = rendererRef.current
    const snap = strokeSnapRef.current
    const m = snap?.model ?? modelRef.current
    if (!renderer || !m.count) return null
    const rect = e.currentTarget.getBoundingClientRect()
    const i = renderer.pick(e.clientX - rect.left, e.clientY - rect.top, snap?.buf)
    if (i < 0 || i >= m.count) return null
    const o = i * 3
    const prim = 'prim' in m ? (m as Model & { prim: Int32Array }).prim[i] : -1
    return {
      point: [m.pos[o], m.pos[o + 1], m.pos[o + 2]],
      normal: [m.nrm[o], m.nrm[o + 1], m.nrm[o + 2]],
      index: i,
      prim,
      color: [m.col[o], m.col[o + 1], m.col[o + 2]],
    }
  }

  const moveRing = (e: React.PointerEvent<HTMLCanvasElement>, hit: MeshHit | null) => {
    const ring = ringRef.current
    const renderer = rendererRef.current
    if (!ring || !renderer) return
    const rect = e.currentTarget.getBoundingClientRect()
    const p = hit ? renderer.project(...hit.point) : renderer.project(0, 0, 0)
    const size = Math.max(6, brushRadiusRef.current * p.scale * 2)
    ring.style.display = 'block'
    ring.style.width = ring.style.height = `${size}px`
    ring.style.transform = `translate(${e.clientX - rect.left - size / 2}px, ${e.clientY - rect.top - size / 2}px)`
    ring.style.opacity = hit ? '1' : '0.4'
  }

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const brushing =
      toolRef.current === 'brush' &&
      strokeRef.current === null &&
      (e.pointerType === 'touch' ? pointersRef.current.size === 0 : e.button === 0 && !e.altKey)
    if (brushing) {
      e.currentTarget.setPointerCapture(e.pointerId)
      strokeRef.current = e.pointerId
      strokeSnapRef.current = rendererRef.current ? { buf: rendererRef.current.snapshotPick(), model: modelRef.current } : null
      const hit = pickAt(e)
      moveRing(e, hit)
      onBrushRef.current?.(hit, 'start')
      return
    }
    clickRef.current = e.button === 0 ? { x: e.clientX, y: e.clientY } : null
    if (!cfgRef.current.interactive && toolRef.current !== 'brush') return
    e.currentTarget.setPointerCapture(e.pointerId)
    const pts = pointersRef.current
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const u = userRef.current
    if (pts.size === 2) {
      const [a, b] = Array.from(pts.values())
      pinchRef.current = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, zoom: zoomMulRef.current }
      u.dragging = false
      u.vx = 0
      u.vy = 0
      return
    }
    if (pts.size > 2) return
    setGrabbing(true)
    u.dragging = true
    u.vx = 0
    u.vy = 0
    u.lastX = e.clientX
    u.lastY = e.clientY
    u.lastT = performance.now()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (toolRef.current === 'brush' && !pointersRef.current.size) {
      const hit = pickAt(e)
      moveRing(e, hit)
      if (strokeRef.current === e.pointerId) onBrushRef.current?.(hit, 'move')
      return
    }
    const rect = e.currentTarget.getBoundingClientRect()
    pointerRef.current.x = ((e.clientX - rect.left) / rect.width) * 2 - 1
    pointerRef.current.y = ((e.clientY - rect.top) / rect.height) * 2 - 1
    const pts = pointersRef.current
    if (pts.has(e.pointerId)) pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.size >= 2) {
      const [a, b] = Array.from(pts.values())
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      zoomMulRef.current = Math.min(3, Math.max(0.4, (pinchRef.current.zoom * dist) / pinchRef.current.dist))
      dirtyRef.current = true
      return
    }
    const u = userRef.current
    if (!u.dragging) return
    const now = performance.now()
    const dtm = Math.max(1, now - u.lastT) / 1000
    const dy = (e.clientX - u.lastX) * 0.45
    const dx = (e.clientY - u.lastY) * 0.45
    u.y += dy
    u.x += dx
    u.vy = u.vy * 0.5 + (dy / dtm) * 0.5
    u.vx = u.vx * 0.5 + (dx / dtm) * 0.5
    u.lastX = e.clientX
    u.lastY = e.clientY
    u.lastT = now
    dirtyRef.current = true
  }

  const endDrag = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (strokeRef.current === e.pointerId) {
      strokeRef.current = null
      strokeSnapRef.current = null
      if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
      onBrushRef.current?.(null, 'end')
      return
    }
    const click = clickRef.current
    clickRef.current = null
    if (click && e.type === 'pointerup' && worldRef.current && onPickObjectRef.current && Math.hypot(e.clientX - click.x, e.clientY - click.y) < 4) {
      const rect = e.currentTarget.getBoundingClientRect()
      onPickObjectRef.current(worldRendererRef.current?.pickObject(e.clientX - rect.left, e.clientY - rect.top) ?? -1)
    }
    const pts = pointersRef.current
    pts.delete(e.pointerId)
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId)
    const u = userRef.current
    if (pts.size === 1) {
      const [rest] = Array.from(pts.values())
      u.dragging = true
      u.vx = 0
      u.vy = 0
      u.lastX = rest.x
      u.lastY = rest.y
      u.lastT = performance.now()
      return
    }
    setGrabbing(false)
    if (!u.dragging) return
    u.dragging = false
    if (performance.now() - u.lastT > 90) {
      u.vx = 0
      u.vy = 0
    }
  }

  // Arrow keys rotate (shift = bigger steps), +/- zoom, 0 resets — keyboard parity with drag.
  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    if (!cfgRef.current.interactive || e.metaKey || e.ctrlKey || e.altKey) return
    const step = e.shiftKey ? 30 : 10
    const u = userRef.current
    if (e.key === 'ArrowLeft') u.y -= step
    else if (e.key === 'ArrowRight') u.y += step
    else if (e.key === 'ArrowUp') u.x -= step
    else if (e.key === 'ArrowDown') u.x += step
    else if (e.key === '+' || e.key === '=') zoomMulRef.current = Math.min(3, zoomMulRef.current * 1.15)
    else if (e.key === '-') zoomMulRef.current = Math.max(0.4, zoomMulRef.current / 1.15)
    else if (e.key === '0') resetView()
    else return
    e.preventDefault()
    e.stopPropagation()
    dirtyRef.current = true
  }

  return (
    <div
      ref={containerRef}
      className={className}
      style={{ position: 'relative', overflow: 'hidden', ...style }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={label}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onPointerLeave={() => {
          if (ringRef.current && strokeRef.current === null) ringRef.current.style.display = 'none'
        }}
        onContextMenu={(e) => tool === 'brush' && e.preventDefault()}
        onDoubleClick={() => tool !== 'brush' && resetView()}
        onKeyDown={onKeyDown}
        tabIndex={cfg.interactive ? 0 : undefined}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          touchAction: cfg.interactive || tool === 'brush' ? 'none' : 'auto',
          cursor: tool === 'brush' && !grabbing ? 'crosshair' : cfg.interactive ? (grabbing ? 'grabbing' : 'grab') : 'default',
          outline: 'none',
        }}
      />
      <div
        ref={highlightElRef}
        aria-hidden
        style={{ position: 'absolute', left: 0, top: 0, display: 'none', pointerEvents: 'none', borderRadius: '50%', border: `1px dashed ${cfg.fg}`, opacity: 0.55 }}
      />
      <div
        ref={ringRef}
        aria-hidden
        style={{ position: 'absolute', left: 0, top: 0, display: 'none', pointerEvents: 'none', borderRadius: '50%', border: `1px solid ${cfg.fg}`, boxShadow: `0 0 0 1px ${cfg.bg}` }}
      />
    </div>
  )
}
