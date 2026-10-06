'use client'

import { useCallback, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react'
import type { CSSProperties, Ref } from 'react'
import useSWR from 'swr'
import { mergeConfig, resolveFontFamily, type AsciiConfig } from '@/lib/ascii/config'
import { buildModel, emptyModel } from '@/lib/ascii/model'
import { AsciiRenderer } from '@/lib/ascii/renderer'
import { loadSource, sourceKey, type SourceSpec } from '@/lib/ascii/source'

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
}

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
  ref,
}: AsciiMeshProps) {
  const cfg = useMemo(() => mergeConfig(config), [config])
  const spec = useMemo<SourceSpec>(() => (typeof source === 'string' ? { kind: 'url', url: source } : source), [source])

  const containerRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const rendererRef = useRef<AsciiRenderer | null>(null)
  const [size, setSize] = useState({ w: 0, h: 0 })

  const { data: loaded, isValidating } = useSWR(['ascii-source', sourceKey(spec)], () => loadSource(spec), {
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

  const model = useMemo(
    () =>
      loaded
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
    [loaded, cfg.shape, cfg.maskMode, cfg.invertMask, cfg.threshold, cfg.smooth, cfg.thickness, cfg.reliefDepth, res],
  )

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
  }, [replayKey, loaded])

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

  useImperativeHandle(ref, () => ({ getCanvas: () => canvasRef.current, resetView }), [resetView])

  useEffect(() => {
    const container = containerRef.current
    const canvas = canvasRef.current
    if (!container || !canvas) return
    const renderer = new AsciiRenderer()
    rendererRef.current = renderer
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    let width = 0
    let height = 0
    let dpr = 1
    let visible = true
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    const resize = () => {
      const rect = container.getBoundingClientRect()
      width = Math.max(1, Math.floor(rect.width))
      height = Math.max(1, Math.floor(rect.height))
      dpr = Math.min(2, window.devicePixelRatio || 1)
      canvas.width = Math.round(width * dpr)
      canvas.height = Math.round(height * dpr)
      renderer.invalidate()
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

      if (!isPaused) clockRef.current += dt

      if (!isPaused && !user.dragging && !reducedMotion) {
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

      const stats = renderer.render(ctx, width, height, dpr, c, modelRef.current, {
        rotX: rx,
        rotY: ry,
        rotZ: rz,
        time: clockRef.current,
        introProgress,
        pointerX: pointerRef.current.x,
        pointerY: pointerRef.current.y,
        zoomMul: zoomMulRef.current,
      })

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
      intersection.disconnect()
      rendererRef.current = null
    }
  }, [])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const onWheel = (e: WheelEvent) => {
      if (!cfgRef.current.wheelZoom) return
      e.preventDefault()
      zoomMulRef.current = Math.min(3, Math.max(0.4, zoomMulRef.current * Math.exp(-e.deltaY * 0.0015)))
      dirtyRef.current = true
    }
    canvas.addEventListener('wheel', onWheel, { passive: false })
    return () => canvas.removeEventListener('wheel', onWheel)
  }, [])

  const pointersRef = useRef(new Map<number, { x: number; y: number }>())
  const pinchRef = useRef({ dist: 1, zoom: 1 })

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!cfgRef.current.interactive) return
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
    u.dragging = true
    u.vx = 0
    u.vy = 0
    u.lastX = e.clientX
    u.lastY = e.clientY
    u.lastT = performance.now()
  }

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
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
    if (!u.dragging) return
    u.dragging = false
    if (performance.now() - u.lastT > 90) {
      u.vx = 0
      u.vy = 0
    }
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
        onDoubleClick={resetView}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          touchAction: cfg.interactive ? 'none' : 'auto',
          cursor: cfg.interactive ? 'grab' : 'default',
        }}
      />
    </div>
  )
}
