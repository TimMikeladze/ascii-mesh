'use client'

import { useCallback, useMemo, useRef, useState } from 'react'
import { Code2, Pause, Play, RotateCcw, Upload, Undo2 } from 'lucide-react'
import { AsciiMesh, type AsciiMeshHandle, type AsciiMeshStats } from '@/components/ascii-mesh'
import { DEFAULT_CONFIG, diffFromDefaults, type AsciiConfig } from '@/lib/ascii/config'
import { getSourcePresets } from '@/lib/ascii/presets'
import { loadSource, type SourceSpec } from '@/lib/ascii/source'
import { StudioPanel } from './studio-panel'
import type { SourceState } from './types'

const NAV_BUTTON =
  'flex h-full items-center gap-1.5 px-3 text-xs max-sm:px-3.5 tracking-widest uppercase text-foreground/90 transition-colors hover:bg-foreground hover:text-background focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:-outline-offset-4 whitespace-nowrap'

function buildCode(cfg: AsciiConfig, source: SourceState): string {
  const diff = diffFromDefaults(cfg)
  let src: string
  if (source.kind === 'text') {
    src = `{{ kind: 'text', text: ${JSON.stringify(source.text)}, fontKey: '${source.fontKey}', weight: ${source.weight} }}`
  } else if (source.kind === 'upload') {
    src = `"/${source.name}"`
  } else {
    src = `"/${source.key}.svg"`
  }
  return `import { AsciiMesh } from '@/components/ascii-mesh'

const config = ${JSON.stringify(diff, null, 2)}

export function Hero() {
  return (
    <AsciiMesh
      source=${src}
      config={config}
      className="h-[640px] w-full"
    />
  )
}`
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
  const meshRef = useRef<AsciiMeshHandle>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const patch = useCallback((p: Partial<AsciiConfig>) => setCfg((c) => ({ ...c, ...p })), [])

  const spec = useMemo<SourceSpec>(() => {
    if (source.kind === 'text') return source
    if (source.kind === 'upload') return { kind: 'url', url: source.url, name: source.name }
    const preset = getSourcePresets().find((p) => p.key === source.key) ?? getSourcePresets()[0]
    return { kind: 'url', url: preset.url, name: `${preset.key}.svg` }
  }, [source])

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
        setSource({ kind: 'upload', url, name })
        setReplayKey((k) => k + 1)
      } catch {
        flash('Could not read that image — check the file or URL')
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

  const downloadPng = useCallback(() => {
    const canvas = meshRef.current?.getCanvas()
    if (!canvas) return
    const link = document.createElement('a')
    link.download = 'ascii-mesh.png'
    link.href = canvas.toDataURL('image/png')
    link.click()
  }, [])

  const handleStats = useCallback((s: AsciiMeshStats) => setStats(s), [])

  return (
    <div className="flex min-h-dvh flex-col lg:h-dvh lg:overflow-hidden">
      <header className="flex h-14 shrink-0 items-stretch border-b border-dashed border-border">
        <div className="flex items-center gap-2 border-r border-dashed border-border px-4 sm:px-5">
          <span aria-hidden className="text-sm leading-none">
            ▲
          </span>
          <h1 className="text-sm font-medium tracking-wide">ascii/mesh</h1>
        </div>
        <p className="hidden flex-1 items-center px-5 text-xs text-muted-foreground xl:flex">
          Turn any image, SVG or logo into a rotatable 3D ASCII animation.
        </p>
        <nav aria-label="Studio actions" className="ml-auto flex items-stretch overflow-x-auto xl:border-l border-dashed border-border">
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
              setCfg(DEFAULT_CONFIG)
              setSource({ kind: 'preset', key: 'starburst' })
              setReplayKey((k) => k + 1)
            }}
          >
            <Undo2 aria-hidden className="size-4 sm:hidden" />
            <span className="max-sm:sr-only">Reset</span>
          </button>
          <button type="button" className={NAV_BUTTON} onClick={() => copy(code, 'code')}>
            <Code2 aria-hidden className="size-4 sm:hidden" />
            <span className="max-sm:sr-only">{copied === 'code' ? 'Copied' : 'Copy code'}</span>
          </button>
        </nav>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <main
          className="relative h-[68dvh] min-h-[420px] border-b border-dashed border-border lg:h-auto lg:border-r lg:border-b-0"
          onDragOver={(e) => {
            e.preventDefault()
            setDragOver(true)
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragOver(false)
            const file = e.dataTransfer.files?.[0]
            if (file) handleFile(file)
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
              className="h-full w-full"
              label="Interactive 3D ASCII render. Drag to rotate."
            />
          </div>

          <p className="pointer-events-none absolute top-5 right-5 hidden max-w-56 sm:block text-right text-xs leading-relaxed text-foreground/90">
            Any image, SVG or logo, rebuilt as a rotatable field of characters.
          </p>

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
            <span className="pointer-coarse:hidden">drag to rotate · double-click to reset</span>
            <span className="hidden pointer-coarse:inline">drag to rotate · pinch to zoom · double-tap to reset</span>
          </p>

          {loading && (
            <p role="status" className="pointer-events-none absolute inset-x-0 top-1/2 text-center text-xs tracking-widest text-muted-foreground uppercase motion-safe:animate-pulse">
              Loading source…
            </p>
          )}

          {notice && (
            <p
              role="status"
              className="pointer-events-none absolute top-5 left-5 border border-dashed border-border bg-background/80 px-3 py-2 text-xs"
            >
              {notice}
            </p>
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
            onSource={setSource}
            onFile={handleFile}
            onUrl={(url) => adoptUrl(url, url.split('/').pop() ?? 'image')}
            code={code}
            onCopyCode={() => copy(code, 'code')}
            onCopyJson={() => copy(JSON.stringify(diffFromDefaults(cfg), null, 2), 'json')}
            onDownloadPng={downloadPng}
            copied={copied}
          />
        </aside>
      </div>
    </div>
  )
}
