'use client'

import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Code2, Link2, Pause, Play, RotateCcw, Upload, Undo2 } from 'lucide-react'
import { AsciiMesh, type AsciiMeshHandle, type AsciiMeshStats, type BrushPhase, type MeshHit } from '@/components/ascii-mesh'
import { CHARSETS, DEFAULT_CONFIG, LOOKS, diffFromDefaults, mergeConfig, type AsciiConfig, type ColorMode } from '@/lib/ascii/config'
import { getSourcePresets } from '@/lib/ascii/presets'
import {
  hexToInt,
  intToHex,
  newId,
  paintDab,
  primBound,
  parseObj,
  parseScene,
  parseStl,
  serializeScene,
  starterScene,
  toPly,
  type MeshScene,
  type Vec3,
} from '@/lib/ascii/scene'
import { loadSource, type SourceSpec } from '@/lib/ascii/source'
import { cn } from '@/lib/utils'
import { ModelPanel, TOOLS } from './model-panel'
import { StudioPanel } from './studio-panel'
import type { BrushSettings, SceneTool, SourceState } from './types'

const NAV_BUTTON =
  'flex h-full items-center gap-1.5 px-3 text-xs lg:px-0 lg:hover:bg-transparent lg:hover:text-muted-foreground max-sm:px-3.5 tracking-widest uppercase text-foreground/90 transition-colors hover:bg-foreground hover:text-background focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:-outline-offset-4 whitespace-nowrap'

function buildCode(cfg: AsciiConfig, source: SourceState): string {
  const diff = diffFromDefaults(cfg)
  let src: string
  let note = ''
  if (source.kind === 'scene') {
    return `import { AsciiMesh } from '@/components/ascii-mesh'
import type { SerializedScene } from '@/lib/ascii/scene'
// Model → Scene JSON downloads this file
import scene from './scene.json'

const config = ${JSON.stringify(diff, null, 2)}

export function Hero() {
  return (
    <AsciiMesh
      source={{ kind: 'scene', scene: scene as SerializedScene }}
      config={config}
      className="h-[640px] w-full"
    />
  )
}`
  }
  if (source.kind === 'text') {
    src = `{{ kind: 'text', text: ${JSON.stringify(source.text)}, fontKey: '${source.fontKey}', weight: ${source.weight} }}`
  } else if (source.kind === 'upload') {
    src = `"/${source.name}"`
    note = `      // put ${source.name} in /public\n`
  } else {
    src = `"/logo.svg"`
    note = '      // any image, SVG or logo URL — the studio preview used a built-in mark\n'
  }
  return `import { AsciiMesh } from '@/components/ascii-mesh'

const config = ${JSON.stringify(diff, null, 2)}

export function Hero() {
  return (
    <AsciiMesh
${note}      source=${src}
      config={config}
      className="h-[640px] w-full"
    />
  )
}`
}

// Share links: `#s=<base64url JSON>` holding the config diff, a non-upload source and, for
// modelled scenes, the shapes + sculpt (paint and imported meshes stay local).
export function encodeShare(cfg: AsciiConfig, source: SourceState, scene?: MeshScene): string {
  const src = source.kind === 'upload' ? undefined : source
  const m = source.kind === 'scene' && scene ? serializeScene(scene, true) : undefined
  const bytes = new TextEncoder().encode(JSON.stringify({ c: diffFromDefaults(cfg), s: src, m }))
  let bin = ''
  bytes.forEach((b) => (bin += String.fromCharCode(b)))
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export function decodeShare(hash: string): { cfg: AsciiConfig; source?: SourceState; scene?: MeshScene } | null {
  const m = hash.match(/[#&]s=([\w-]+)/)
  if (!m) return null
  try {
    const bin = atob(m[1].replace(/-/g, '+').replace(/_/g, '/'))
    const data = JSON.parse(new TextDecoder().decode(Uint8Array.from(bin, (ch) => ch.charCodeAt(0))))
    const known = Object.fromEntries(Object.entries(data.c ?? {}).filter(([k]) => k in DEFAULT_CONFIG))
    const s = data.s as SourceState | undefined
    const scene = data.m ? (parseScene(data.m) ?? undefined) : undefined
    // A scene source without a payload (session restore) uses the separately saved scene.
    const source = s && (s.kind === 'preset' || s.kind === 'text' || s.kind === 'scene') ? s : undefined
    return { cfg: mergeConfig(known as Partial<AsciiConfig>), source, scene }
  } catch {
    return null
  }
}

const SESSION_KEY = 'ascii-mesh:session'
const SCENE_KEY = 'ascii-mesh:scene'
const HISTORY_LIMIT = 100
const BRUSH_TOOLS: SceneTool[] = ['paint', 'sculpt-add', 'sculpt-carve']
const SHORTCUTS: [string, string][] = [
  ['space', 'pause / play'],
  ['r', 'replay intro'],
  ['u', 'upload'],
  ['x', 'randomize look'],
  ['c', 'copy code'],
  ['s', 'copy share link'],
  ['t', 'copy frame as text'],
  ['⌘Z / ⇧⌘Z', 'undo / redo'],
  ['f', 'fullscreen'],
  ['← ↑ → ↓', 'rotate (canvas focused)'],
  ['o v b g e', 'model: orbit · select · paint · clay · carve'],
  ['[ / ]', 'model: brush size'],
  ['d / ⌫', 'model: duplicate / delete shape'],
  ['+ / − / 0', 'zoom / reset view'],
  ['?', 'this help'],
]

function randomLook(cfg: AsciiConfig): AsciiConfig {
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(Math.random() * xs.length)]
  const look = pick(LOOKS).patch
  const modes: ColorMode[] = ['mono', 'gradient', 'depth']
  return {
    ...cfg,
    ...look,
    charset: pick(CHARSETS).value,
    colorMode: pick(modes),
    lightAzimuth: Math.round(Math.random() * 120 - 60),
    lightElevation: Math.round(20 + Math.random() * 45),
    motion: pick(['spin', 'sway'] as const),
    waveAmp: Math.random() < 0.3 ? +(Math.random() * 0.08).toFixed(3) : 0,
    scanStrength: Math.random() < 0.3 ? +(0.2 + Math.random() * 0.5).toFixed(2) : 0,
  }
}

function download(name: string, data: BlobPart, type: string) {
  const link = document.createElement('a')
  link.download = name
  link.href = URL.createObjectURL(new Blob([data], { type }))
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
}

interface Snapshot {
  cfg: AsciiConfig
  scene: MeshScene
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

export function AsciiStudio() {
  const [cfg, setCfg] = useState<AsciiConfig>(DEFAULT_CONFIG)
  const [source, setSource] = useState<SourceState>({ kind: 'preset', key: 'starburst' })
  const [paused, setPaused] = useState(false)
  const [replayKey, setReplayKey] = useState(0)
  const [stats, setStats] = useState<AsciiMeshStats | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const uploadUrlRef = useRef<string | null>(null)
  const meshRef = useRef<AsciiMeshHandle>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [scene, setScene] = useState<MeshScene>(starterScene)
  const [tool, setTool] = useState<SceneTool>('orbit')
  const [brush, setBrush] = useState<BrushSettings>({ radius: 0.08, color: '#ff6a3d' })
  const [selected, setSelected] = useState<string | null>(null)

  // Undo history over config + scene. Rapid edits (slider drags) within 500ms coalesce into one step.
  const pastRef = useRef<Snapshot[]>([])
  const futureRef = useRef<Snapshot[]>([])
  const lastEditRef = useRef(0)
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const sceneRef = useRef(scene)
  const snapshot = (): Snapshot => ({ cfg: cfgRef.current, scene: sceneRef.current })
  const pushHistory = useCallback((coalesce: boolean) => {
    const now = Date.now()
    if (!coalesce || now - lastEditRef.current > 500) {
      pastRef.current = [...pastRef.current.slice(-HISTORY_LIMIT + 1), snapshot()]
    }
    lastEditRef.current = coalesce ? now : 0
    futureRef.current = []
  }, [])
  const commit = useCallback(
    (update: (c: AsciiConfig) => AsciiConfig, coalesce = true) => {
      const c = cfgRef.current
      const next = update(c)
      if (next === c) return
      pushHistory(coalesce)
      cfgRef.current = next
      setCfg(next)
    },
    [pushHistory],
  )
  const commitScene = useCallback(
    (update: (s: MeshScene) => MeshScene, coalesce = true) => {
      const next = update(sceneRef.current)
      if (next === sceneRef.current) return
      pushHistory(coalesce)
      sceneRef.current = next
      setScene(next)
    },
    [pushHistory],
  )
  const patch = useCallback((p: Partial<AsciiConfig>) => commit((c) => ({ ...c, ...p })), [commit])
  const step = useCallback((from: React.RefObject<Snapshot[]>, to: React.RefObject<Snapshot[]>) => {
    const target = from.current.pop()
    if (!target) return
    to.current.push(snapshot())
    lastEditRef.current = 0
    cfgRef.current = target.cfg
    sceneRef.current = target.scene
    setCfg(target.cfg)
    setScene(target.scene)
  }, [])
  const undo = useCallback(() => step(pastRef, futureRef), [step])
  const redo = useCallback(() => step(futureRef, pastRef), [step])
  const [helpOpen, setHelpOpen] = useState(false)

  const spec = useMemo<SourceSpec>(() => {
    if (source.kind === 'scene') return { kind: 'scene', scene }
    if (source.kind === 'text') return source
    if (source.kind === 'upload') return { kind: 'url', url: source.url, name: source.name }
    const preset = getSourcePresets().find((p) => p.key === source.key) ?? getSourcePresets()[0]
    return { kind: 'url', url: preset.url, name: `${preset.key}.svg` }
  }, [source, scene])

  const flash = useCallback((message: string) => {
    setNotice(message)
    window.setTimeout(() => setNotice((n) => (n === message ? null : n)), 3200)
  }, [])

  const adoptUrl = useCallback(
    async (url: string, name: string) => {
      try {
        const loaded = await loadSource({ kind: 'url', url, name })
        if (loaded.isVector || loaded.hasAlpha) {
          patch({ shape: 'extrude', maskMode: 'auto', shade: 'light', smooth: 1 })
          flash('Logo detected — extruding its silhouette')
        } else {
          patch({ shape: 'relief', maskMode: 'none', shade: 'both', smooth: 0, colorMode: 'gradient' })
          flash('Photo detected — building a depth relief')
        }
        // Release the previous blob URL so repeated uploads don't leak memory.
        if (uploadUrlRef.current && uploadUrlRef.current !== url) URL.revokeObjectURL(uploadUrlRef.current)
        uploadUrlRef.current = url.startsWith('blob:') ? url : null
        setSource({ kind: 'upload', url, name })
        setReplayKey((k) => k + 1)
      } catch {
        if (url.startsWith('blob:')) URL.revokeObjectURL(url)
        flash(
          url.startsWith('blob:')
            ? 'Could not read that image — the file may be corrupt'
            : 'Could not load that URL — the host may block cross-origin use. Download it and upload instead.',
        )
      }
    },
    [patch, flash],
  )

  const handleFile = useCallback(
    (file: File) => {
      if (!file.type.startsWith('image/') && !file.name.toLowerCase().endsWith('.svg')) {
        flash('Please choose an image or SVG file')
        return
      }
      if (file.size > 25 * 1024 * 1024) {
        flash('That file is over 25 MB — try a smaller image')
        return
      }
      adoptUrl(URL.createObjectURL(file), file.name)
    },
    [adoptUrl, flash],
  )

  const code = useMemo(() => buildCode(cfg, source), [cfg, source])

  const copy = useCallback(async (text: string, key: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(key)
      window.setTimeout(() => setCopied(null), 1600)
    } catch {
      setCopied(null)
    }
  }, [])

  // Download/clipboard names follow the source: "logo.svg" -> "logo-ascii.png".
  const baseName = useMemo(() => {
    const raw =
      source.kind === 'upload' ? source.name : source.kind === 'text' ? source.text : source.kind === 'scene' ? 'model' : source.key
    const slug = raw.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    return `${slug || 'ascii-mesh'}-ascii`
  }, [source])

  const copyImage = useCallback(() => {
    const canvas = meshRef.current?.getCanvas()
    if (!canvas || typeof ClipboardItem === 'undefined') {
      flash('Copying images is not supported in this browser')
      return
    }
    const blob = new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('empty'))), 'image/png'))
    navigator.clipboard
      .write([new ClipboardItem({ 'image/png': blob })])
      .then(() => {
        setCopied('image')
        window.setTimeout(() => setCopied(null), 1600)
      })
      .catch(() => flash('Could not copy the image'))
  }, [flash])

  const copyText = useCallback(() => {
    const text = meshRef.current?.getText()
    if (!text) {
      flash('Nothing to copy yet')
      return
    }
    copy(text, 'text')
  }, [copy, flash])

  const mainRef = useRef<HTMLElement>(null)
  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    else mainRef.current?.requestFullscreen?.().catch(() => flash('Fullscreen is not available here'))
  }, [flash])

  const downloadPng = useCallback(() => {
    const canvas = meshRef.current?.getCanvas()
    if (!canvas) return
    const link = document.createElement('a')
    link.download = `${baseName}.png`
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [baseName])

  const record = useCallback(() => {
    const canvas = meshRef.current?.getCanvas()
    if (!canvas || recording || typeof MediaRecorder === 'undefined' || !canvas.captureStream) {
      flash('Video recording is not supported in this browser')
      return
    }
    const type = ['video/webm;codecs=vp9', 'video/webm', 'video/mp4'].find((t) => MediaRecorder.isTypeSupported(t))
    if (!type) {
      flash('Video recording is not supported in this browser')
      return
    }
    const recorder = new MediaRecorder(canvas.captureStream(60), { mimeType: type, videoBitsPerSecond: 8_000_000 })
    const chunks: Blob[] = []
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data)
    recorder.onstop = () => {
      setRecording(false)
      const blob = new Blob(chunks, { type })
      const link = document.createElement('a')
      link.download = `${baseName}.${type.startsWith('video/mp4') ? 'mp4' : 'webm'}`
      link.href = URL.createObjectURL(blob)
      link.click()
      window.setTimeout(() => URL.revokeObjectURL(link.href), 1000)
    }
    setPaused(false)
    setRecording(true)
    flash('Recording 5 seconds…')
    recorder.start()
    window.setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), 5000)
  }, [recording, flash, baseName])

  const share = useCallback(async () => {
    const url = `${location.origin}${location.pathname}#s=${encodeShare(cfg, source, scene)}`
    history.replaceState(null, '', url)
    await copy(url, 'share')
    if (source.kind === 'upload') flash('Link copied — uploads stay local, so the link uses the default source')
    else if (source.kind === 'scene' && (Object.keys(scene.paint).length || scene.prims.some((p) => p.type === 'mesh')))
      flash('Link copied — paint and imported meshes stay local; export Scene JSON to share them')
    else flash('Share link copied')
  }, [cfg, source, scene, copy, flash])

  // Restore from a share link (on load and when the hash changes), else from the last session.
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    const apply = () => {
      const shared = decodeShare(location.hash)
      if (!shared) return false
      if (shared.scene) commitScene(() => shared.scene!, false)
      commit(() => shared.cfg, false)
      if (shared.source) setSource(shared.source)
      setReplayKey((k) => k + 1)
      return true
    }
    if (!apply()) {
      try {
        const saved = decodeShare(localStorage.getItem(SESSION_KEY) ?? '')
        if (saved) {
          setCfg(saved.cfg)
          if (saved.source) setSource(saved.source)
        }
        const raw = localStorage.getItem(SCENE_KEY)
        const savedScene = raw ? parseScene(JSON.parse(raw)) : null
        if (savedScene) {
          sceneRef.current = savedScene
          setScene(savedScene)
        }
      } catch {}
    }
    setRestored(true)
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [commit, commitScene])

  useEffect(() => {
    if (!restored) return
    try {
      localStorage.setItem(SESSION_KEY, `#s=${encodeShare(cfg, source)}`)
    } catch {}
  }, [cfg, source, restored])

  // The full scene (paint + imported meshes) is saved separately, debounced: strokes update it often.
  useEffect(() => {
    if (!restored) return
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(SCENE_KEY, JSON.stringify(serializeScene(scene)))
      } catch {
        try {
          localStorage.setItem(SCENE_KEY, JSON.stringify(serializeScene({ ...scene, meshes: {}, prims: scene.prims.filter((p) => p.type !== 'mesh') })))
        } catch {}
      }
    }, 600)
    return () => window.clearTimeout(t)
  }, [scene, restored])

  // ---- Modelling ----
  const pickTool = useCallback(
    (next: SceneTool) => {
      setTool(next)
      if (next === 'paint' && cfgRef.current.colorMode !== 'source') {
        patch({ colorMode: 'source' })
        flash('Color mode set to Image so paint shows')
      }
    },
    [patch, flash],
  )

  const enterScene = useCallback(() => {
    setSource({ kind: 'scene' })
    setReplayKey((k) => k + 1)
    flash('Modelling — add shapes, then sculpt or paint them on the canvas')
  }, [flash])

  const onSource = useCallback(
    (next: SourceState) => {
      if (next.kind === 'scene') enterScene()
      else {
        setSource(next)
        setTool('orbit')
      }
    },
    [enterScene],
  )

  // Live stroke state. One stroke = one undo step; scene updates are batched per animation frame.
  const strokeRef = useRef<{ last: Vec3 | null } | null>(null)
  const frameRef = useRef(0)
  const setSceneLive = useCallback((next: MeshScene) => {
    sceneRef.current = next
    if (!frameRef.current) {
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = 0
        setScene(sceneRef.current)
      })
    }
  }, [])

  const onBrush = useCallback(
    (hit: MeshHit | null, phase: BrushPhase) => {
      if (tool === 'select') {
        if (phase !== 'start') return
        const prim = hit && hit.prim >= 0 ? sceneRef.current.prims[hit.prim] : undefined
        setSelected(prim?.id ?? null)
        return
      }
      if (phase === 'start') {
        pushHistory(false)
        strokeRef.current = { last: null }
        // Copy-on-write: the history snapshot keeps the old paint object.
        if (tool === 'paint') sceneRef.current = { ...sceneRef.current, paint: { ...sceneRef.current.paint } }
      }
      if (phase === 'end') {
        strokeRef.current = null
        setScene(sceneRef.current)
        return
      }
      const stroke = strokeRef.current
      if (!hit || !stroke) return
      const r = brush.radius
      if (stroke.last && Math.hypot(hit.point[0] - stroke.last[0], hit.point[1] - stroke.last[1], hit.point[2] - stroke.last[2]) < r * 0.5) return
      stroke.last = hit.point
      const s = sceneRef.current
      if (tool === 'paint') {
        paintDab(s.paint, hit.point, r, hexToInt(brush.color))
        setSceneLive({ ...s })
      } else {
        const color = intToHex((hit.color[0] << 16) | (hit.color[1] << 8) | hit.color[2])
        setSceneLive({ ...s, dabs: [...s.dabs, { p: hit.point, r, op: tool === 'sculpt-add' ? 'add' : 'subtract', color }] })
      }
    },
    [tool, brush, pushHistory, setSceneLive],
  )

  const importModelFile = useCallback(
    async (file: File) => {
      const name = file.name.toLowerCase()
      try {
        if (name.endsWith('.json')) {
          const next = parseScene(JSON.parse(await file.text()))
          if (!next) throw new Error('Not a scene file')
          commitScene(() => next, false)
          setSelected(null)
          flash(`Loaded ${file.name}`)
          return
        }
        if (file.size > 60 * 1024 * 1024) throw new Error('File is over 60 MB')
        const tris = name.endsWith('.stl') ? parseStl(await file.arrayBuffer()) : parseObj(await file.text())
        const meshId = newId()
        const prim = {
          id: newId(),
          type: 'mesh' as const,
          op: 'add' as const,
          pos: [0, 0, 0] as Vec3,
          rot: [0, 0, 0] as Vec3,
          scale: [1, 1, 1] as Vec3,
          color: '#e4e4e4',
          meshId,
        }
        commitScene((s) => ({ ...s, prims: [...s.prims, prim], meshes: { ...s.meshes, [meshId]: { name: file.name, tris } } }), false)
        setSelected(prim.id)
        flash(`Imported ${file.name} — ${(tris.length / 9).toLocaleString()} triangles`)
      } catch (e) {
        flash(`Could not import ${file.name}: ${(e as Error).message}`)
      }
    },
    [commitScene, flash],
  )

  const exportSceneJson = useCallback(() => download('scene.json', JSON.stringify(serializeScene(sceneRef.current)), 'application/json'), [])
  const exportPly = useCallback(() => {
    const model = meshRef.current?.getModel()
    if (!model?.count) {
      flash('Nothing to export yet')
      return
    }
    download(`${baseName}.ply`, toPly(model), 'application/octet-stream')
  }, [baseName, flash])

  const selectedPrim = scene.prims.find((p) => p.id === selected)
  const highlight = useMemo(
    () =>
      source.kind === 'scene' && selectedPrim
        ? { center: selectedPrim.pos, radius: primBound(selectedPrim) }
        : null,
    [source.kind, selectedPrim],
  )

  // Paste an image (or image URL) anywhere to convert it.
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      if (isTyping(e.target)) return
      const file = Array.from(e.clipboardData?.files ?? []).find((f) => f.type.startsWith('image/'))
      if (file) {
        e.preventDefault()
        handleFile(file)
        return
      }
      const text = e.clipboardData?.getData('text')?.trim()
      if (text && /^https?:\/\/\S+$/.test(text)) {
        e.preventDefault()
        adoptUrl(text, text.split('/').pop() ?? 'image')
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [handleFile, adoptUrl])

  // Keyboard shortcuts: space pause · r replay · u upload · c copy code · s share.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target)) return
      const key = e.key.toLowerCase()
      if ((e.metaKey || e.ctrlKey) && key === 'z') {
        e.preventDefault()
        if (e.shiftKey) redo()
        else undo()
        return
      }
      if ((e.metaKey || e.ctrlKey) && key === 'y') {
        e.preventDefault()
        redo()
        return
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (source.kind === 'scene') {
        const t = TOOLS.find((x) => x.key === key)
        if (t) {
          pickTool(t.value)
          return
        }
        if (e.key === '[' || e.key === ']') {
          setBrush((b) => ({ ...b, radius: Math.min(0.3, Math.max(0.02, +(b.radius * (e.key === ']' ? 1.2 : 1 / 1.2)).toFixed(3))) }))
          return
        }
        const sel = sceneRef.current.prims.find((p) => p.id === selected)
        if (sel && (key === 'delete' || key === 'backspace')) {
          e.preventDefault()
          commitScene((s) => ({ ...s, prims: s.prims.filter((p) => p.id !== sel.id) }), false)
          setSelected(null)
          return
        }
        if (sel && key === 'd') {
          const dup = { ...sel, id: newId(), pos: [sel.pos[0] + 0.15, sel.pos[1], sel.pos[2]] as Vec3 }
          commitScene((s) => ({ ...s, prims: [...s.prims, dup] }), false)
          setSelected(dup.id)
          return
        }
      }
      if (key === 'escape') {
        setHelpOpen(false)
        setSelected(null)
      }
      else if (e.key === '?') setHelpOpen((o) => !o)
      else if (key === 'x') {
        commit(randomLook, false)
        setReplayKey((k) => k + 1)
      } else if (key === ' ' && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault()
        setPaused((p) => !p)
      } else if (key === 'r') setReplayKey((k) => k + 1)
      else if (key === 'u') fileRef.current?.click()
      else if (key === 'c') copy(code, 'code')
      else if (key === 's') share()
      else if (key === 'f') toggleFullscreen()
      else if (key === 't') copyText()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [code, copy, share, undo, redo, commit, commitScene, toggleFullscreen, copyText, source.kind, selected, pickTool])

  const handleStats = useCallback((s: AsciiMeshStats) => setStats(s), [])

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="flex h-14 shrink-0 items-stretch border-b border-dashed border-border lg:grid lg:grid-cols-[auto_minmax(0,1fr)_22rem]">
        <div className="flex items-center border-r border-dashed border-border px-4 sm:px-5">
          <h1 className="text-sm font-medium tracking-wide">ascii/mesh</h1>
        </div>
        <p className="hidden flex-1 items-center truncate px-5 text-xs text-muted-foreground xl:flex">
          Turn any image, SVG or logo into a rotatable 3D ASCII animation.
        </p>
        <nav aria-label="Studio actions" className="ml-auto flex items-stretch overflow-x-auto border-dashed border-border lg:col-start-3 lg:ml-0 lg:justify-between lg:border-l lg:px-5">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.svg"
            className="sr-only"
            tabIndex={-1}
            aria-label="Upload an image, SVG or logo"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) handleFile(file)
              e.target.value = ''
            }}
          />
          <button type="button" className={NAV_BUTTON} onClick={() => fileRef.current?.click()}>
            <Upload aria-hidden className="size-4 sm:hidden" />
            <span className="max-sm:sr-only">Upload</span>
          </button>
          <button type="button" className={NAV_BUTTON} onClick={() => setReplayKey((k) => k + 1)}>
            <RotateCcw aria-hidden className="size-4 sm:hidden" />
            <span className="max-sm:sr-only">Replay</span>
          </button>
          <button type="button" className={NAV_BUTTON} aria-pressed={paused} onClick={() => setPaused((p) => !p)}>
            {paused ? <Play aria-hidden className="size-4 sm:hidden" /> : <Pause aria-hidden className="size-4 sm:hidden" />}
            <span className="max-sm:sr-only">{paused ? 'Play' : 'Pause'}</span>
          </button>
          <button
            type="button"
            className={NAV_BUTTON}
            onClick={() => {
              meshRef.current?.resetView()
              commit(() => DEFAULT_CONFIG, false)
              setSource({ kind: 'preset', key: 'starburst' })
              setReplayKey((k) => k + 1)
            }}
          >
            <Undo2 aria-hidden className="size-4 sm:hidden" />
            <span className="max-sm:sr-only">Reset</span>
          </button>
          <button type="button" className={NAV_BUTTON} onClick={() => copy(code, 'code')}>
            <Code2 aria-hidden className="size-4 sm:hidden" />
            <span className="max-sm:sr-only">{copied === 'code' ? 'Copied' : 'Code'}</span>
          </button>
          <button type="button" className={NAV_BUTTON} onClick={share}>
            <Link2 aria-hidden className="size-4 sm:hidden" />
            <span className="max-sm:sr-only">{copied === 'share' ? 'Copied' : 'Share'}</span>
          </button>
        </nav>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] lg:grid-rows-[minmax(0,1fr)]">
        <main
          ref={mainRef}
          className="relative h-[68dvh] min-h-[420px] border-b border-dashed border-border lg:h-auto lg:border-r lg:border-b-0"
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={(e) => {
            // Ignore leave events fired when the pointer moves onto a child element.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDragOver(false)
          }}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) {
              handleFile(file)
              return
            }
            // Images dragged from another tab arrive as a URL.
            const url = (e.dataTransfer.getData('text/uri-list') || e.dataTransfer.getData('text/plain')).split('\n')[0]?.trim()
            if (url && /^(https?:|data:image\/)/.test(url)) adoptUrl(url, url.split('/').pop()?.split('?')[0] || 'image')
          }}
        >
          <div className="absolute inset-0">
            <AsciiMesh
              ref={meshRef}
              source={spec}
              config={cfg}
              paused={paused}
              replayKey={replayKey}
              onStats={handleStats}
              onLoadingChange={setLoading}
              onError={() => flash('Could not load that source')}
              tool={source.kind === 'scene' && tool !== 'orbit' ? 'brush' : 'orbit'}
              brushRadius={tool === 'select' ? 0.015 : brush.radius}
              onBrush={onBrush}
              highlight={highlight}
              className="h-full w-full"
              label="Interactive 3D ASCII render. Drag or use arrow keys to rotate, plus and minus to zoom."
            />
          </div>

          {source.kind === 'scene' ? (
            <div role="toolbar" aria-label="Modelling tools" className="absolute top-5 left-5 flex flex-wrap items-stretch border border-border bg-background/85 text-[11px] tracking-widest uppercase">
              {TOOLS.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  aria-pressed={tool === t.value}
                  title={`${t.hint} (${t.key})`}
                  onClick={() => pickTool(t.value)}
                  className={cn(
                    'h-8 px-2.5 transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:-outline-offset-4',
                    tool === t.value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {t.label}
                </button>
              ))}
              {BRUSH_TOOLS.includes(tool) && (
                <label className="flex items-center gap-2 border-l border-dashed border-border px-2.5 normal-case tracking-normal text-muted-foreground">
                  <span className="sr-only">Brush size</span>
                  <input
                    type="range"
                    min={0.02}
                    max={0.3}
                    step={0.005}
                    value={brush.radius}
                    onChange={(e) => setBrush((b) => ({ ...b, radius: +e.target.value }))}
                    className="w-20 accent-foreground"
                  />
                </label>
              )}
              {tool === 'paint' && (
                <label className="flex items-center border-l border-dashed border-border px-2">
                  <span className="sr-only">Brush color</span>
                  <input
                    type="color"
                    value={brush.color}
                    onChange={(e) => setBrush((b) => ({ ...b, color: e.target.value }))}
                    className="size-5 cursor-pointer border border-border bg-transparent p-0"
                  />
                </label>
              )}
            </div>
          ) : (
            <p className="pointer-events-none absolute top-5 right-5 hidden max-w-56 sm:block text-right text-xs leading-relaxed text-foreground/90">
              Any image, SVG or logo, rebuilt as a rotatable field of characters.
            </p>
          )}

          <dl className="pointer-events-none absolute bottom-5 left-5 flex flex-col gap-0.5 text-xs leading-relaxed text-foreground/90">
            <div className="flex gap-2">
              <dt className="text-muted-foreground">grid</dt>
              <dd className="tabular-nums">{stats ? `${stats.cols}×${stats.rows}` : '—'}</dd>
            </div>
            <div className="hidden gap-2 sm:flex">
              <dt className="text-muted-foreground">glyphs</dt>
              <dd className="tabular-nums">{stats ? stats.glyphs.toLocaleString() : '—'}</dd>
            </div>
            <div className="hidden gap-2 sm:flex">
              <dt className="text-muted-foreground">points</dt>
              <dd className="tabular-nums">{stats ? stats.points.toLocaleString() : '—'}</dd>
            </div>
            <div className="flex gap-2">
              <dt className="text-muted-foreground">fps</dt>
              <dd className="tabular-nums">{stats ? stats.fps : '—'}</dd>
            </div>
          </dl>

          <p className="pointer-events-none absolute right-5 bottom-5 text-right text-xs text-muted-foreground">
            <span className="pointer-coarse:hidden">
              {source.kind === 'scene' ? (TOOLS.find((t) => t.value === tool)?.hint.toLowerCase() ?? '') + ' · alt-drag to orbit' : 'drag to rotate · double-click to reset · paste an image'}
            </span>
            <span className="hidden lg:block pointer-coarse:hidden">press ? for shortcuts</span>
            <span className="hidden pointer-coarse:inline">drag · pinch · double-tap</span>
          </p>

          {loading && (
            <p role="status" className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-xs tracking-widest text-muted-foreground uppercase motion-safe:animate-pulse">
              Loading source…
            </p>
          )}

          {notice && (
            <p
              role="status"
              className={cn(
                'pointer-events-none absolute border border-dashed border-border bg-background/80 px-3 py-2 text-xs',
                source.kind === 'scene' ? 'top-16 left-5' : 'top-5 left-5',
              )}
            >
              {notice}
            </p>
          )}
          {helpOpen && (
            <div
              role="dialog"
              aria-label="Keyboard shortcuts"
              className="absolute inset-0 z-10 flex items-center justify-center bg-background/80"
              onClick={() => setHelpOpen(false)}
            >
              <dl className="grid grid-cols-[auto_auto] gap-x-6 gap-y-2 border border-dashed border-border bg-background px-6 py-5 text-xs">
                {SHORTCUTS.map(([k, v]) => (
                  <div key={k} className="contents">
                    <dt className="text-right tracking-widest text-foreground uppercase">{k}</dt>
                    <dd className="text-muted-foreground">{v}</dd>
                  </div>
                ))}
              </dl>
            </div>
          )}

          {dragOver && (
            <div className="pointer-events-none absolute inset-3 flex items-center justify-center border border-dashed border-foreground bg-background/80 text-sm tracking-widest uppercase">
              Drop to convert
            </div>
          )}
        </main>

        <aside aria-label="Customization" className="min-h-0 overflow-y-auto overscroll-contain bg-background">
          <StudioPanel
            cfg={cfg}
            onChange={patch}
            source={source}
            onSource={onSource}
            onFile={handleFile}
            onUrl={(url) => adoptUrl(url, url.split('/').pop() ?? 'image')}
            code={code}
            onCopyCode={() => copy(code, 'code')}
            onCopyJson={() => copy(JSON.stringify(diffFromDefaults(cfg), null, 2), 'json')}
            onDownloadPng={downloadPng}
            onCopyImage={copyImage}
            onCopyText={copyText}
            onRecord={record}
            recording={recording}
            onShare={share}
            copied={copied}
            modelPanel={
              <ModelPanel
                scene={scene}
                onScene={commitScene}
                selected={selected}
                onSelect={setSelected}
                tool={tool}
                onTool={pickTool}
                brush={brush}
                onBrush={setBrush}
                onImportFile={importModelFile}
                onExportJson={exportSceneJson}
                onExportPly={exportPly}
              />
            }
          />
        </aside>
      </div>
    </div>
  )
}
