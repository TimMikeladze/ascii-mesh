'use client'

import type React from 'react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Code2, Link2, Pause, Play, RotateCcw, Upload, Undo2 } from 'lucide-react'
import { OhMyAscii, type OhMyAsciiHandle, type OhMyAsciiStats, type BrushPhase, type MeshHit } from '@/components/ohmyascii'
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
import { FRAME_SUFFIX, nextPiecePath, parsePiece, pieceStem, relativeTo, resolveRelative, serializePiece, type Piece, type PieceSource } from '@/lib/ascii/piece'
import { loadSource, type SourceSpec } from '@/lib/ascii/source'
import { makeObject, objectLabel, parseWorld, serializeWorld, type World } from '@/lib/ascii/world'
import { WORLD_PRESETS, getWorldPreset } from '@/lib/ascii/worlds'
import { cn } from '@/lib/utils'
import { useStudioFolder } from './folder'
import { FolderPanel } from './folder-panel'
import { ModelPanel, TOOLS } from './model-panel'
import { decodeShare, encodeShare } from './share'
import { StudioPanel } from './studio-panel'
import type { BrushSettings, SceneTool, SourceState } from './types'
import { WorldPanel } from './world-panel'
import { AiPanel } from './ai-panel'
import { AI_CONFIG_KEYS } from '@/lib/ascii/world-prompt'
import { agentPrompt } from '@/lib/ascii/handoff'

const NAV_BUTTON =
  'flex h-full items-center gap-1.5 px-3 text-xs lg:px-0 lg:hover:bg-transparent lg:hover:text-muted-foreground max-sm:px-3.5 tracking-widest uppercase text-foreground/90 transition-colors hover:bg-foreground hover:text-background focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:-outline-offset-4 whitespace-nowrap'

function buildCode(cfg: AsciiConfig, source: SourceState): string {
  const diff = diffFromDefaults(cfg)
  let src: string
  let note = ''
  if (source.kind === 'world') {
    return `import { OhMyAscii } from '@/components/ohmyascii'
import type { SerializedWorld } from '@/lib/ascii/world'
// World → Export downloads this file
import world from './world.json'

const config = ${JSON.stringify(diff, null, 2)}

export function Hero() {
  return (
    <OhMyAscii
      source={{ kind: 'world', world: world as SerializedWorld }}
      config={config}
      className="h-[640px] w-full"
    />
  )
}`
  }
  if (source.kind === 'scene') {
    return `import { OhMyAscii } from '@/components/ohmyascii'
import type { SerializedScene } from '@/lib/ascii/scene'
// Model → Scene JSON downloads this file
import scene from './scene.json'

const config = ${JSON.stringify(diff, null, 2)}

export function Hero() {
  return (
    <OhMyAscii
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
  return `import { OhMyAscii } from '@/components/ohmyascii'

const config = ${JSON.stringify(diff, null, 2)}

export function Hero() {
  return (
    <OhMyAscii
${note}      source=${src}
      config={config}
      className="h-[640px] w-full"
    />
  )
}`
}

// Share links (`#s=…`, see ./share) and gallery deep links (`#w=<preset key>`) restore on load.

const SESSION_KEY = 'ohmyascii:session'
const SCENE_KEY = 'ohmyascii:scene'
const WORLD_KEY = 'ohmyascii:world'
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
  ['d / ⌫', 'model / world: duplicate / delete selection'],
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
  world: World
}

function isTyping(target: EventTarget | null) {
  const el = target as HTMLElement | null
  return !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName))
}

export function OhMyAsciiStudio() {
  const [cfg, setCfg] = useState<AsciiConfig>(DEFAULT_CONFIG)
  const [source, setSource] = useState<SourceState>({ kind: 'preset', key: 'starburst' })
  const [paused, setPaused] = useState(false)
  const [replayKey, setReplayKey] = useState(0)
  const [stats, setStats] = useState<OhMyAsciiStats | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)
  const [copied, setCopied] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [recording, setRecording] = useState(false)
  const uploadUrlRef = useRef<string | null>(null)
  const meshRef = useRef<OhMyAsciiHandle>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const [scene, setScene] = useState<MeshScene>(starterScene)
  const [tool, setTool] = useState<SceneTool>('orbit')
  const [brush, setBrush] = useState<BrushSettings>({ radius: 0.08, color: '#ff6a3d' })
  const [selected, setSelected] = useState<string | null>(null)

  const [world, setWorld] = useState<World>(() => WORLD_PRESETS[0].world())
  const [worldSel, setWorldSel] = useState<string | null>(null)
  const [worldPreset, setWorldPreset] = useState<string | null>(WORLD_PRESETS[0].key)

  // Undo history over config + scene. Rapid edits (slider drags) within 500ms coalesce into one step.
  const pastRef = useRef<Snapshot[]>([])
  const futureRef = useRef<Snapshot[]>([])
  const lastEditRef = useRef(0)
  const cfgRef = useRef(cfg)
  cfgRef.current = cfg
  const sceneRef = useRef(scene)
  const worldRef = useRef(world)
  const snapshot = (): Snapshot => ({ cfg: cfgRef.current, scene: sceneRef.current, world: worldRef.current })
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
  const commitWorld = useCallback(
    (update: (w: World) => World, coalesce = true) => {
      const next = update(worldRef.current)
      if (next === worldRef.current) return
      pushHistory(coalesce)
      worldRef.current = next
      setWorld(next)
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
    worldRef.current = target.world
    setCfg(target.cfg)
    setScene(target.scene)
    setWorld(target.world)
  }, [])
  const undo = useCallback(() => step(pastRef, futureRef), [step])
  const redo = useCallback(() => step(futureRef, pastRef), [step])
  const [helpOpen, setHelpOpen] = useState(false)

  const spec = useMemo<SourceSpec>(() => {
    if (source.kind === 'scene') return { kind: 'scene', scene }
    if (source.kind === 'world') return { kind: 'world', world }
    if (source.kind === 'text') return source
    if (source.kind === 'upload') return { kind: 'url', url: source.url, name: source.name }
    const preset = getSourcePresets().find((p) => p.key === source.key) ?? getSourcePresets()[0]
    return { kind: 'url', url: preset.url, name: `${preset.key}.svg` }
  }, [source, scene, world])

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
      source.kind === 'upload' ? source.name : source.kind === 'text' ? source.text : source.kind === 'scene' ? 'model' : source.kind === 'world' ? (world.name ?? 'world') : source.key
    const slug = raw.replace(/\.[a-z0-9]+$/i, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
    return `${slug || 'ohmyascii'}-ascii`
  }, [source, world.name])

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
    // Worlds record exactly one loop from the start (replay restarts the world clock).
    const seconds = source.kind === 'world' ? Math.min(30, worldRef.current.duration) : 5
    if (source.kind === 'world') setReplayKey((k) => k + 1)
    setPaused(false)
    setRecording(true)
    flash(`Recording ${seconds} seconds…`)
    recorder.start()
    window.setTimeout(() => recorder.state !== 'inactive' && recorder.stop(), seconds * 1000)
  }, [recording, flash, baseName, source.kind])

  const share = useCallback(async () => {
    const url = `${location.origin}${location.pathname}#s=${encodeShare(cfg, source, scene, world)}`
    history.replaceState(null, '', url)
    await copy(url, 'share')
    if (source.kind === 'upload') flash('Link copied — uploads stay local, so the link uses the default source')
    else if (source.kind === 'scene' && (Object.keys(scene.paint).length || scene.prims.some((p) => p.type === 'mesh')))
      flash('Link copied — paint and imported meshes stay local; export Scene JSON to share them')
    else if (source.kind === 'world' && world.objects.some((o) => o.geom.kind === 'image' && /^(blob|data):/.test(o.geom.url)))
      flash('Link copied — uploaded images stay local; export the world JSON to share them')
    else flash('Share link copied')
  }, [cfg, source, scene, world, copy, flash])

  // Restore from a share link (on load and when the hash changes), else from the last session.
  const [restored, setRestored] = useState(false)
  useEffect(() => {
    const apply = () => {
      const shared = decodeShare(location.hash)
      if (!shared) {
        // Gallery deep link: `#w=<preset key>` opens the studio on that creation.
        const wm = location.hash.match(/[#&]w=([\w-]+)/)
        const preset = wm ? getWorldPreset(wm[1]) : undefined
        if (!preset) return false
        commitWorld(() => preset.world(), false)
        commit(() => mergeConfig(preset.config), false)
        setWorldPreset(wm![1])
        setWorldSel(null)
        setSource({ kind: 'world' })
        setTool('orbit')
        meshRef.current?.resetView()
        setReplayKey((k) => k + 1)
        return true
      }
      if (shared.scene) commitScene(() => shared.scene!, false)
      if (shared.world) {
        commitWorld(() => shared.world!, false)
        setWorldPreset(null)
      }
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
        const rawWorld = localStorage.getItem(WORLD_KEY)
        const savedWorld = rawWorld ? parseWorld(JSON.parse(rawWorld)) : null
        if (savedWorld) {
          worldRef.current = savedWorld
          setWorld(savedWorld)
          setWorldPreset(WORLD_PRESETS.find((p) => p.label === savedWorld.name)?.key ?? null)
        }
      } catch {}
    }
    setRestored(true)
    window.addEventListener('hashchange', apply)
    return () => window.removeEventListener('hashchange', apply)
  }, [commit, commitScene, commitWorld])

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

  useEffect(() => {
    if (!restored) return
    const t = window.setTimeout(() => {
      try {
        localStorage.setItem(WORLD_KEY, JSON.stringify(serializeWorld(world, true)))
      } catch {}
    }, 600)
    return () => window.clearTimeout(t)
  }, [world, restored])

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

  const applyWorldPreset = useCallback(
    (key: string) => {
      const preset = getWorldPreset(key)
      if (!preset) return
      pushHistory(false)
      const next = preset.world()
      const nextCfg = mergeConfig(preset.config)
      worldRef.current = next
      cfgRef.current = nextCfg
      setWorld(next)
      setCfg(nextCfg)
      setWorldPreset(key)
      setWorldSel(null)
      meshRef.current?.resetView()
      setReplayKey((k) => k + 1)
    },
    [pushHistory],
  )

  const enterWorld = useCallback(() => {
    setSource({ kind: 'world' })
    setTool('orbit')
    if (worldPreset) applyWorldPreset(worldPreset)
    else setReplayKey((k) => k + 1)
    flash('Composing — pick a scene from the gallery, or add objects and backgrounds')
  }, [flash, worldPreset, applyWorldPreset])

  const onSource = useCallback(
    (next: SourceState) => {
      if (next.kind === 'scene') enterScene()
      else if (next.kind === 'world') enterWorld()
      else {
        setSource(next)
        setTool('orbit')
      }
    },
    [enterScene, enterWorld],
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

  const exportWorldJson = useCallback(
    () => download(`${baseName.replace(/-ascii$/, '')}.world.json`, JSON.stringify(serializeWorld(worldRef.current), null, 2), 'application/json'),
    [baseName],
  )
  const importWorldFile = useCallback(
    async (file: File) => {
      try {
        const data = JSON.parse(await file.text())
        // Accept a bare world, a serialized piece holding one, or a scene (added as an object).
        const raw = data?.source?.kind === 'world' ? data.source.world : data
        const scn = !raw?.objects && raw?.prims ? parseScene(raw) : null
        if (scn) {
          const o = makeObject('sculpt', { geom: { kind: 'sculpt', scene: scn }, name: file.name.replace(/\.json$/, ''), source: true })
          commitWorld((w) => ({ ...w, objects: [...w.objects, o] }), false)
          setWorldSel(o.id)
          flash(`Added ${file.name} as an object`)
          return
        }
        const next = parseWorld(raw)
        if (!next || !Array.isArray(raw?.objects)) throw new Error('Not a world file')
        commitWorld(() => next, false)
        setWorldPreset(null)
        setWorldSel(null)
        flash(`Loaded ${file.name}`)
      } catch (e) {
        flash(`Could not import ${file.name}: ${(e as Error).message}`)
      }
    },
    [commitWorld, flash],
  )
  const addModelled = useCallback(() => {
    const s = sceneRef.current
    if (!s.prims.length && !s.dabs.length) {
      flash('The modeller is empty — build something under Model, sculpt & paint first')
      return
    }
    const o = makeObject('sculpt', { geom: { kind: 'sculpt', scene: s }, name: 'Modelled object', source: true })
    commitWorld((w) => ({ ...w, objects: [...w.objects, o] }), false)
    setWorldSel(o.id)
  }, [commitWorld, flash])
  const aiCurrent = useCallback(() => {
    if (source.kind !== 'world') return null
    const c = cfgRef.current
    const strip = (k: string, v: unknown) => (k === 'id' ? undefined : v)
    return JSON.stringify({ world: serializeWorld(worldRef.current, true), config: Object.fromEntries(AI_CONFIG_KEYS.map((k) => [k, c[k]])) }, strip)
  }, [source.kind])
  const applyAi = useCallback(
    (next: World, patchCfg: Partial<AsciiConfig>) => {
      pushHistory(false)
      const nextCfg = { ...cfgRef.current, ...patchCfg }
      worldRef.current = next
      cfgRef.current = nextCfg
      setWorld(next)
      setCfg(nextCfg)
      setWorldPreset(null)
      setWorldSel(null)
      setSource({ kind: 'world' })
      setTool('orbit')
      setReplayKey((k) => k + 1)
    },
    [pushHistory],
  )
  const worldSelIndex = source.kind === 'world' ? world.objects.findIndex((o) => o.id === worldSel) : -1
  const pickWorldObject = useCallback((i: number) => setWorldSel(i >= 0 ? (worldRef.current.objects[i]?.id ?? null) : null), [])

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
      if (source.kind === 'world' && worldSel) {
        const sel = worldRef.current.objects.find((o) => o.id === worldSel)
        if (sel && (key === 'delete' || key === 'backspace')) {
          e.preventDefault()
          commitWorld((w) => ({ ...w, objects: w.objects.filter((o) => o.id !== sel.id) }), false)
          setWorldSel(null)
          return
        }
        if (sel && key === 'd') {
          const dup = { ...sel, id: newId(), pos: [sel.pos[0] + 0.2, sel.pos[1], sel.pos[2]] as Vec3 }
          commitWorld((w) => ({ ...w, objects: [...w.objects, dup] }), false)
          setWorldSel(dup.id)
          return
        }
      }
      if (key === 'escape') {
        setHelpOpen(false)
        setSelected(null)
        setWorldSel(null)
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
  }, [code, copy, share, undo, redo, commit, commitScene, commitWorld, toggleFullscreen, copyText, source.kind, selected, worldSel, pickTool])

  // ---- Folder (docs/studio-folder.md) ----
  // `diskRef` is the active piece's text as last read from or written to disk, so our own writes
  // aren't mistaken for an agent's edit. `savedRef` is the normalised form of the state that text
  // describes; state serialising to the same thing needs no write (keeps hand formatting intact).
  const folder = useStudioFolder()
  const [activePiece, setActivePiece] = useState<string | null>(null)
  const diskRef = useRef<string | null>(null)
  const savedRef = useRef<string | null>(null)
  const pieceErrorRef = useRef<string | null>(null)
  const applyingRef = useRef(false)
  const imageTextRef = useRef<string | undefined>(undefined)
  const folderFilesRef = useRef(folder.files)
  folderFilesRef.current = folder.files
  const { readFile: readFolderFile, write: writeFolder, root: folderRoot } = folder

  const pieceFromState = useCallback(
    (path: string): Piece | null => {
      let src: PieceSource
      if (source.kind === 'scene') src = { kind: 'scene', scene }
      else if (source.kind === 'world') src = { kind: 'world', world }
      else if (source.kind === 'upload') {
        if (!source.path) return null
        src = { kind: 'image', path: relativeTo(path, source.path) }
      } else src = source
      return { source: src, config: cfg }
    },
    [source, scene, world, cfg],
  )

  const applyPiece = useCallback(
    async (path: string, text: string, first: boolean) => {
      diskRef.current = text
      const parsed = parsePiece(text)
      applyingRef.current = true
      try {
        if ('error' in parsed) {
          if (pieceErrorRef.current !== text) flash(`${path}: ${parsed.error}`)
          pieceErrorRef.current = text
          return
        }
        pieceErrorRef.current = null
        const { piece } = parsed
        let next: SourceState
        if (piece.source.kind === 'image') {
          const target = resolveRelative(path, piece.source.path)
          imageTextRef.current = target ? folderFilesRef.current.get(target) : undefined
        const file = target ? await readFolderFile(target) : null
          if (!file || !target) {
            flash(`${path}: image "${piece.source.path}" not found in the folder`)
            return
          }
          const url = URL.createObjectURL(file)
          if (uploadUrlRef.current) URL.revokeObjectURL(uploadUrlRef.current)
          uploadUrlRef.current = url
          next = { kind: 'upload', url, name: file.name, path: target }
        } else if (piece.source.kind === 'scene') next = { kind: 'scene' }
        else if (piece.source.kind === 'world') next = { kind: 'world' }
        else next = piece.source
        savedRef.current = serializePiece(piece)
        // One undo step for config + scene together.
        pushHistory(false)
        cfgRef.current = piece.config
        setCfg(piece.config)
        if (piece.source.kind === 'scene') {
          sceneRef.current = piece.source.scene
          setScene(piece.source.scene)
        }
        if (piece.source.kind === 'world') {
          worldRef.current = piece.source.world
          setWorld(piece.source.world)
          setWorldPreset(null)
        }
        setSource(next)
        if (next.kind !== 'scene') setTool('orbit')
        if (first) setReplayKey((k) => k + 1)
      } finally {
        applyingRef.current = false
      }
    },
    [readFolderFile, flash, pushHistory],
  )

  const openPiece = useCallback(
    (path: string) => {
      const text = folder.files.get(path)
      if (text === undefined) return
      setActivePiece(path)
      void applyPiece(path, text, true)
    },
    [folder.files, applyPiece],
  )

  // Agent edits to the active piece (or the image it points at) reload live; a piece that
  // disappears, or a folder that is closed, is let go.
  useEffect(() => {
    if (!activePiece) return
    if (!folder.root) {
      if (!folder.pending) setActivePiece(null)
      return
    }
    const text = folder.files.get(activePiece)
    if (text === undefined) {
      setActivePiece(null)
      return
    }
    const imagePath = source.kind === 'upload' ? source.path : undefined
    const image = imagePath ? folder.files.get(imagePath) : undefined
    // Only a change to an image the scan has seen counts; a just-copied file may not be seen yet.
    const imageChanged = image !== undefined && image !== imageTextRef.current
    if (image !== undefined) imageTextRef.current = image
    if (text !== diskRef.current || imageChanged) void applyPiece(activePiece, text, false)
  }, [folder.files, folder.root, folder.pending, activePiece, source, applyPiece])

  // Remember the open piece across reloads.
  const ACTIVE_KEY = 'ohmyascii:piece'
  const wantedRef = useRef<string | null>(null)
  useEffect(() => {
    try {
      wantedRef.current = localStorage.getItem(ACTIVE_KEY)
    } catch {}
  }, [])
  useEffect(() => {
    if (!activePiece) return
    try {
      localStorage.setItem(ACTIVE_KEY, activePiece)
    } catch {}
  }, [activePiece])

  // A piece appearing on disk while none is open is opened ("show me what you made"). Pieces
  // seen during the first scans after a folder is held are the folder's existing contents.
  const knownPiecesRef = useRef<Set<string> | null>(null)
  const heldAtRef = useRef(0)
  useEffect(() => {
    if (!folder.root) {
      knownPiecesRef.current = null
      return
    }
    if (!knownPiecesRef.current) heldAtRef.current = Date.now()
    const known = knownPiecesRef.current ?? new Set<string>()
    knownPiecesRef.current = new Set(folder.pieces)
    if (activePiece) return
    const wanted = wantedRef.current
    if (wanted && folder.pieces.includes(wanted)) {
      wantedRef.current = null
      openPiece(wanted)
      return
    }
    if (Date.now() - heldAtRef.current < 2000) return
    const fresh = folder.pieces.find((p) => !known.has(p))
    if (fresh) openPiece(fresh)
  }, [folder.root, folder.pieces, activePiece, openPiece])

  // Studio edits save back to the active piece (debounced). An upload is first copied into the
  // folder so the piece can reference it by path.
  useEffect(() => {
    if (!activePiece || !folderRoot) return
    const t = window.setTimeout(async () => {
      if (applyingRef.current) return
      try {
        if (source.kind === 'upload' && !source.path) {
          const blob = await (await fetch(source.url)).blob()
          const dir = activePiece.includes('/') ? activePiece.slice(0, activePiece.lastIndexOf('/') + 1) : ''
          const safe = source.name.replace(/[^\w.-]+/g, '-') || 'image'
          const dot = safe.lastIndexOf('.')
          const [stem, ext] = dot > 0 ? [safe.slice(0, dot), safe.slice(dot)] : [safe, '']
          let target = `${dir}${safe}`
          // Never overwrite an image another piece may use.
          for (let i = 2; folder.files.has(target); i++) target = `${dir}${stem}-${i}${ext}`
          await writeFolder(target, blob)
          // Record what the watcher will see, and save the piece in the same step, so the scan
          // that picks up the copy doesn't reload the piece's previous image.
          imageTextRef.current = await blob.text()
          const next = { ...source, path: target }
          const text = serializePiece({ source: { kind: 'image', path: relativeTo(activePiece, target) }, config: cfg })
          savedRef.current = text
          diskRef.current = text
          await writeFolder(activePiece, text)
          setSource(next)
          return
        }
        const piece = pieceFromState(activePiece)
        if (!piece) return
        const text = serializePiece(piece)
        if (text === savedRef.current) return
        savedRef.current = text
        diskRef.current = text
        await writeFolder(activePiece, text)
      } catch {
        flash(`Could not save ${activePiece}`)
      }
    }, 600)
    return () => window.clearTimeout(t)
  }, [activePiece, folderRoot, folder.files, writeFolder, source, cfg, pieceFromState, flash])

  // The rendered frame goes next to the piece as text, so an agent can read what it made.
  const frameTextRef = useRef<string | null>(null)
  useEffect(() => {
    if (!activePiece || !folderRoot) return
    const t = window.setTimeout(() => {
      const text = meshRef.current?.getText()
      if (!text || text === frameTextRef.current) return
      frameTextRef.current = text
      writeFolder(`${pieceStem(activePiece)}${FRAME_SUFFIX}`, `${text}\n`).catch(() => undefined)
    }, 1500)
    return () => window.clearTimeout(t)
  }, [activePiece, folderRoot, writeFolder, cfg, scene, world, source, stats?.points])

  const newPiece = useCallback(async () => {
    const path = nextPiecePath(folder.pieces)
    const piece = pieceFromState(path)
    // Uploads without a path are copied in by the save effect once the piece is active.
    const text = serializePiece(piece ?? { source: { kind: 'preset', key: 'starburst' }, config: cfg })
    try {
      await writeFolder(path, text)
      diskRef.current = text
      savedRef.current = piece ? text : null
      setActivePiece(path)
      flash(`Saved ${path} — edits now save to it`)
    } catch {
      flash(`Could not write ${path}`)
    }
  }, [folder.pieces, writeFolder, pieceFromState, cfg, flash])

  // Handoff for an agent in the user's terminal: point at the open piece, else inline the scene.
  const handoffPrompt = useCallback(
    (request: string) => {
      const piece = activePiece ? null : pieceFromState('scene.ascii.json')
      return agentPrompt({
        request,
        piecePath: activePiece,
        folderName: folderRoot,
        pieceJson: piece ? serializePiece(piece) : null,
        studioUrl: `${location.origin}${location.pathname}`,
      })
    },
    [activePiece, folderRoot, pieceFromState],
  )

  // ---- Handoff from the home composer ----
  // `/studio?q=<prompt>` makes the AI panel start a fresh chat with it; the param is stripped so
  // reloads don't re-send.
  const [autoPrompt, setAutoPrompt] = useState<string | null>(null)
  useEffect(() => {
    const q = new URLSearchParams(location.search).get('q')
    if (!q) return
    setAutoPrompt(q)
    const clean = new URL(location.href)
    clean.searchParams.delete('q')
    history.replaceState(null, '', clean)
  }, [])

  const handleStats = useCallback((s: OhMyAsciiStats) => setStats(s), [])

  return (
    <div className="studio-shell flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="flex h-14 shrink-0 items-stretch border-b border-dashed border-border lg:grid lg:grid-cols-[auto_minmax(0,1fr)_22rem]">
        <div className="flex items-center border-r border-dashed border-border px-4 sm:px-5">
          <Link href="/" className="text-sm font-medium tracking-wide transition-colors hover:text-muted-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:-outline-offset-4">
            ohmyascii
          </Link>
        </div>
        <p className="hidden flex-1 items-center truncate px-5 text-xs text-muted-foreground xl:flex">
          Turn images, logos, sculptures and whole 2D / 3D scenes into animated ASCII.
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
            <OhMyAscii
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
              highlightObject={worldSelIndex >= 0 ? worldSelIndex : null}
              onPickObject={source.kind === 'world' ? pickWorldObject : undefined}
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
          ) : source.kind === 'world' ? (
            <p className="pointer-events-none absolute top-5 right-5 hidden max-w-56 sm:block text-right text-xs leading-relaxed text-foreground/90">
              {world.name ?? 'Untitled world'}
            </p>
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
              {source.kind === 'scene'
                ? (TOOLS.find((t) => t.value === tool)?.hint.toLowerCase() ?? '') + ' · alt-drag to orbit'
                : source.kind === 'world'
                  ? `drag to orbit · click to select${worldSelIndex >= 0 ? ` · ${objectLabel(world.objects[worldSelIndex], worldSelIndex).toLowerCase()}` : ''}`
                  : 'drag to rotate · double-click to reset · paste an image'}
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
            folderPanel={
              folder.supported || folder.root ? (
                <FolderPanel folder={folder} active={activePiece} onOpen={openPiece} onNew={newPiece} />
              ) : undefined
            }
            aiPanel={
              <AiPanel
                current={aiCurrent}
                onApply={applyAi}
                handoff={handoffPrompt}
                autoPrompt={autoPrompt}
                onCopy={(text) => {
                  copy(text, 'handoff')
                  flash('Prompt copied — paste it into Claude Code running in your terminal')
                }}
              />
            }
            worldPanel={
              <WorldPanel
                world={world}
                onWorld={commitWorld}
                onPreset={applyWorldPreset}
                activePreset={worldPreset}
                selected={worldSel}
                onSelect={setWorldSel}
                onAddModelled={addModelled}
                onImportFile={importWorldFile}
                onExportJson={exportWorldJson}
              />
            }
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
