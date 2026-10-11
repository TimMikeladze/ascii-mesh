'use client'

import { useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Box, Sparkles, Upload } from 'lucide-react'
import {
  CHARSETS,
  FONT_OPTIONS,
  LOOKS,
  DEFAULT_CONFIG,
  type AsciiConfig,
  type ColorMode,
  type MaskMode,
  type MotionMode,
  type ShadeMode,
  type ShapeMode,
} from '@/lib/ascii/config'
import { getSourcePresets } from '@/lib/ascii/presets'
import {
  ChipRow,
  ColorField,
  Section,
  Segmented,
  SelectField,
  SliderField,
  TextField,
  ToggleField,
} from './controls'
import type { SourceState } from './types'

interface StudioPanelProps {
  cfg: AsciiConfig
  onChange: (patch: Partial<AsciiConfig>) => void
  source: SourceState
  onSource: (next: SourceState) => void
  onFile: (file: File) => void
  onUrl: (url: string) => void
  code: string
  onCopyCode: () => void
  onCopyJson: () => void
  onDownloadPng: () => void
  onCopyImage: () => void
  onCopyText: () => void
  onRecord: () => void
  recording: boolean
  onShare: () => void
  onCopyTerminal: () => void
  copied: string | null
  /** Rendered as the "Model" section while the scene source is active. */
  modelPanel?: ReactNode
  /** Rendered as the "World" section while the world source is active. */
  worldPanel?: ReactNode
  /** Rendered as the "Generate with AI" section. */
  aiPanel?: ReactNode
  /** Rendered as the "Folder" section when the browser can hold a folder. */
  folderPanel?: ReactNode
}

const fontOptions = FONT_OPTIONS.map((f) => ({ value: f.key, label: f.label }))
const deg = (v: number) => `${Math.round(v)}°`
const pct = (v: number) => `${Math.round(v * 100)}%`

export function StudioPanel({
  cfg,
  onChange,
  source,
  onSource,
  onFile,
  onUrl,
  code,
  onCopyCode,
  onCopyJson,
  onDownloadPng,
  onCopyImage,
  onCopyText,
  onRecord,
  recording,
  onShare,
  onCopyTerminal,
  copied,
  modelPanel,
  worldPanel,
  aiPanel,
  folderPanel,
}: StudioPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [urlDraft, setUrlDraft] = useState('')
  const presets = getSourcePresets()
  const activeCharset = CHARSETS.find((c) => c.value === cfg.charset)?.key ?? null

  return (
    <div className="flex flex-col">
      {aiPanel && (
        <Section title="Generate with AI" defaultOpen>
          {aiPanel}
        </Section>
      )}

      {folderPanel && <Section title="Folder">{folderPanel}</Section>}

      <Section title="Source" defaultOpen>
        <ChipRow
          label="Built-in marks"
          value={source.kind === 'preset' ? source.key : null}
          options={presets.map((p) => ({ value: p.key, label: p.label }))}
          onChange={(key) => onSource({ kind: 'preset', key })}
        />
        <button
          type="button"
          aria-pressed={source.kind === 'scene'}
          onClick={() => onSource(source.kind === 'scene' ? { kind: 'preset', key: presets[0].key } : { kind: 'scene' })}
          className={
            'flex h-10 items-center justify-center gap-2 border text-xs tracking-widest uppercase transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2 ' +
            (source.kind === 'scene'
              ? 'border-foreground bg-foreground text-background'
              : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground')
          }
        >
          <Box className="size-3.5" aria-hidden />
          {source.kind === 'scene' ? 'Modelling — back to marks' : 'Model, sculpt & paint in 3D'}
        </button>
        <button
          type="button"
          aria-pressed={source.kind === 'world'}
          onClick={() => onSource(source.kind === 'world' ? { kind: 'preset', key: presets[0].key } : { kind: 'world' })}
          className={
            'flex h-10 items-center justify-center gap-2 border text-xs tracking-widest uppercase transition-colors focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2 ' +
            (source.kind === 'world'
              ? 'border-foreground bg-foreground text-background'
              : 'border-border text-muted-foreground hover:border-foreground hover:text-foreground')
          }
        >
          <Sparkles className="size-3.5" aria-hidden />
          {source.kind === 'world' ? 'Composing — back to marks' : 'Compose a 2D / 3D scene'}
        </button>
        <div className="flex flex-col gap-2">
          <input
            ref={fileRef}
            type="file"
            accept="image/*,.svg"
            className="sr-only"
            tabIndex={-1}
            aria-label="Upload an image, SVG or logo"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) onFile(file)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex h-16 items-center justify-center gap-2 border border-dashed border-border text-xs tracking-widest text-muted-foreground uppercase transition-colors hover:border-foreground hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2"
          >
            <Upload className="size-3.5" aria-hidden />
            {source.kind === 'upload' ? source.name : 'Upload image / SVG / logo'}
          </button>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Or drop a file onto the canvas. Transparent PNGs and SVGs are extruded; photos become depth reliefs.
          </p>
        </div>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault()
            if (urlDraft.trim()) onUrl(urlDraft.trim())
          }}
        >
          <input
            type="url"
            aria-label="Image URL"
            value={urlDraft}
            onChange={(e) => setUrlDraft(e.target.value)}
            placeholder="https://… image url"
            className="h-9 min-w-0 flex-1 border border-border bg-background px-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2"
          />
          <button
            type="submit"
            className="h-9 border border-border px-3 text-[11px] tracking-widest uppercase hover:border-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2"
          >
            Load
          </button>
        </form>
        <div className="border-t border-dashed border-border pt-4">
          <ToggleField
            label="Use text as source"
            value={source.kind === 'text'}
            onChange={(on) =>
              onSource(
                on
                  ? { kind: 'text', text: 'ASCII', fontKey: 'geist-mono', weight: 800 }
                  : { kind: 'preset', key: presets[0].key },
              )
            }
          />
          {source.kind === 'text' && (
            <div className="mt-4 flex flex-col gap-4">
              <TextField
                label="Text"
                multiline
                value={source.text}
                onChange={(text) => onSource({ ...source, text })}
              />
              <SelectField
                label="Typeface"
                value={source.fontKey}
                options={fontOptions}
                onChange={(fontKey) => onSource({ ...source, fontKey })}
              />
              <SliderField
                label="Weight"
                value={source.weight}
                min={300}
                max={900}
                step={100}
                defaultValue={800}
                onChange={(weight) => onSource({ ...source, weight })}
              />
            </div>
          )}
        </div>
      </Section>

      {source.kind === 'scene' && modelPanel && (
        <Section title="Model" defaultOpen>
          {modelPanel}
        </Section>
      )}

      {source.kind === 'world' && worldPanel && (
        <Section title="World" defaultOpen>
          {worldPanel}
        </Section>
      )}

      <Section title="Look" defaultOpen>
        <ChipRow
          label="Presets"
          value={LOOKS.find((l) => Object.entries(l.patch).every(([k, v]) => cfg[k as keyof AsciiConfig] === v))?.key ?? null}
          options={LOOKS.map((l) => ({ value: l.key, label: l.label }))}
          onChange={(key) => {
            const look = LOOKS.find((l) => l.key === key)
            if (look) onChange(look.patch)
          }}
        />
      </Section>

      {source.kind !== 'scene' && source.kind !== 'world' && <Section title="Shape">
        <Segmented<ShapeMode>
          label="3D mode"
          value={cfg.shape}
          options={[
            { value: 'extrude', label: 'Extrude' },
            { value: 'relief', label: 'Relief' },
          ]}
          onChange={(shape) => onChange({ shape })}
        />
        {cfg.shape === 'extrude' ? (
          <SliderField label="Thickness" value={cfg.thickness} min={0} max={0.8} step={0.01} onChange={(thickness) => onChange({ thickness })} defaultValue={DEFAULT_CONFIG.thickness} />
        ) : (
          <SliderField label="Relief depth" value={cfg.reliefDepth} min={0} max={1} step={0.01} onChange={(reliefDepth) => onChange({ reliefDepth })} defaultValue={DEFAULT_CONFIG.reliefDepth} />
        )}
        <SelectField<MaskMode>
          label="Silhouette from"
          value={cfg.maskMode}
          options={[
            { value: 'auto', label: 'Auto detect' },
            { value: 'alpha', label: 'Transparency' },
            { value: 'luma', label: 'Light pixels' },
            { value: 'luma-invert', label: 'Dark pixels' },
            { value: 'none', label: 'Whole image' },
          ]}
          onChange={(maskMode) => onChange({ maskMode })}
        />
        <SliderField label="Threshold" value={cfg.threshold} min={0.02} max={0.98} step={0.01} onChange={(threshold) => onChange({ threshold })} defaultValue={DEFAULT_CONFIG.threshold} format={pct} />
        <SliderField label="Edge smoothing" value={cfg.smooth} min={0} max={4} step={1} onChange={(smooth) => onChange({ smooth })} defaultValue={DEFAULT_CONFIG.smooth} />
        <ToggleField label="Invert silhouette" value={cfg.invertMask} onChange={(invertMask) => onChange({ invertMask })} />
      </Section>}

      <Section title="Characters">
        <ChipRow
          label="Character set"
          value={activeCharset}
          options={CHARSETS.map((c) => ({ value: c.key, label: c.label }))}
          onChange={(key) => {
            const set = CHARSETS.find((c) => c.key === key)
            if (set) onChange({ charset: set.value })
          }}
        />
        <TextField
          label="Custom ramp (dark → bright)"
          value={cfg.charset}
          onChange={(charset) => onChange({ charset })}
          placeholder=" .:-=+*#%@"
        />
        <button
          type="button"
          onClick={() => onChange({ charset: Array.from(cfg.charset).reverse().join('') })}
          className="-mt-2 self-start text-[11px] tracking-widest text-muted-foreground uppercase hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed"
        >
          ⇄ Reverse ramp
        </button>
        <SelectField label="Typeface" value={cfg.fontKey} options={fontOptions} onChange={(fontKey) => onChange({ fontKey })} />
        <SliderField label="Font weight" value={cfg.fontWeight} min={300} max={800} step={100} onChange={(fontWeight) => onChange({ fontWeight })} defaultValue={DEFAULT_CONFIG.fontWeight} />
        <SliderField label="Cell size" value={cfg.cellSize} min={4} max={24} step={1} onChange={(cellSize) => onChange({ cellSize })} defaultValue={DEFAULT_CONFIG.cellSize} format={(v) => `${v}px`} />
        <SliderField label="Cell aspect" value={cfg.cellAspect} min={0.6} max={2.4} step={0.05} onChange={(cellAspect) => onChange({ cellAspect })} defaultValue={DEFAULT_CONFIG.cellAspect} format={(v) => v.toFixed(2)} />
        <SliderField label="Glyph scale" value={cfg.glyphScale} min={0.5} max={1.8} step={0.05} onChange={(glyphScale) => onChange({ glyphScale })} defaultValue={DEFAULT_CONFIG.glyphScale} format={(v) => v.toFixed(2)} />
      </Section>

      <Section title="Color">
        <Segmented<ColorMode>
          label="Color mode"
          value={cfg.colorMode}
          options={[
            { value: 'mono', label: 'Mono' },
            { value: 'gradient', label: 'Tone' },
            { value: 'depth', label: 'Depth' },
            { value: 'source', label: 'Image' },
          ]}
          onChange={(colorMode) => onChange({ colorMode })}
        />
        <ColorField label={cfg.colorMode === 'mono' ? 'Glyph color' : 'Bright color'} value={cfg.fg} onChange={(fg) => onChange({ fg })} />
        {(cfg.colorMode === 'gradient' || cfg.colorMode === 'depth') && (
          <>
            <ColorField label="Dark color" value={cfg.fg2} onChange={(fg2) => onChange({ fg2 })} />
            <button
              type="button"
              onClick={() => onChange({ fg: cfg.fg2, fg2: cfg.fg })}
              className="-mt-2 self-start text-[11px] tracking-widest text-muted-foreground uppercase hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed"
            >
              ⇅ Swap colors
            </button>
          </>
        )}
        <ColorField label="Background" value={cfg.bg} onChange={(bg) => onChange({ bg })} />
        <ToggleField label="Transparent background" value={cfg.transparentBg} onChange={(transparentBg) => onChange({ transparentBg })} />
      </Section>

      <Section title="Light & tone">
        <Segmented<ShadeMode>
          label="Brightness from"
          value={cfg.shade}
          options={[
            { value: 'light', label: 'Light' },
            { value: 'image', label: 'Image' },
            { value: 'both', label: 'Both' },
          ]}
          onChange={(shade) => onChange({ shade })}
        />
        <SliderField label="Light azimuth" value={cfg.lightAzimuth} min={-180} max={180} step={1} onChange={(lightAzimuth) => onChange({ lightAzimuth })} defaultValue={DEFAULT_CONFIG.lightAzimuth} format={deg} />
        <SliderField label="Light elevation" value={cfg.lightElevation} min={-90} max={90} step={1} onChange={(lightElevation) => onChange({ lightElevation })} defaultValue={DEFAULT_CONFIG.lightElevation} format={deg} />
        <ToggleField label="Light follows cursor" value={cfg.pointerLight} onChange={(pointerLight) => onChange({ pointerLight })} />
        <SliderField label="Ambient" value={cfg.ambient} min={0} max={1} step={0.01} onChange={(ambient) => onChange({ ambient })} defaultValue={DEFAULT_CONFIG.ambient} format={pct} />
        <SliderField label="Brightness" value={cfg.brightness} min={-0.5} max={0.5} step={0.01} onChange={(brightness) => onChange({ brightness })} defaultValue={DEFAULT_CONFIG.brightness} />
        <SliderField label="Contrast" value={cfg.contrast} min={0.3} max={3} step={0.05} onChange={(contrast) => onChange({ contrast })} defaultValue={DEFAULT_CONFIG.contrast} format={(v) => v.toFixed(2)} />
        <SliderField label="Gamma" value={cfg.gamma} min={0.3} max={3} step={0.05} onChange={(gamma) => onChange({ gamma })} defaultValue={DEFAULT_CONFIG.gamma} format={(v) => v.toFixed(2)} />
        <SliderField label="Depth fade" value={cfg.depthFade} min={0} max={1} step={0.01} onChange={(depthFade) => onChange({ depthFade })} defaultValue={DEFAULT_CONFIG.depthFade} format={pct} />
        <ToggleField label="Invert tones" value={cfg.invert} onChange={(invert) => onChange({ invert })} />
      </Section>

      {source.kind !== 'world' && <Section title="Motion & camera" defaultOpen>
        <Segmented<MotionMode>
          label="Animation"
          value={cfg.motion}
          options={[
            { value: 'static', label: 'Still' },
            { value: 'spin', label: 'Spin' },
            { value: 'sway', label: 'Sway' },
          ]}
          onChange={(motion) => onChange({ motion })}
        />
        {cfg.motion === 'spin' && (
          <>
            <SliderField label="Spin Y (turntable)" value={cfg.spinY} min={-180} max={180} step={1} onChange={(spinY) => onChange({ spinY })} defaultValue={DEFAULT_CONFIG.spinY} format={(v) => `${Math.round(v)}°/s`} />
            <SliderField label="Spin X (flip)" value={cfg.spinX} min={-180} max={180} step={1} onChange={(spinX) => onChange({ spinX })} defaultValue={DEFAULT_CONFIG.spinX} format={(v) => `${Math.round(v)}°/s`} />
            <SliderField label="Spin Z (roll)" value={cfg.spinZ} min={-180} max={180} step={1} onChange={(spinZ) => onChange({ spinZ })} defaultValue={DEFAULT_CONFIG.spinZ} format={(v) => `${Math.round(v)}°/s`} />
          </>
        )}
        {cfg.motion === 'sway' && (
          <>
            <SliderField label="Sway Y range" value={cfg.swayY} min={0} max={90} step={1} onChange={(swayY) => onChange({ swayY })} defaultValue={DEFAULT_CONFIG.swayY} format={deg} />
            <SliderField label="Sway X range" value={cfg.swayX} min={0} max={90} step={1} onChange={(swayX) => onChange({ swayX })} defaultValue={DEFAULT_CONFIG.swayX} format={deg} />
            <SliderField label="Sway speed" value={cfg.swaySpeed} min={0.1} max={4} step={0.05} onChange={(swaySpeed) => onChange({ swaySpeed })} defaultValue={DEFAULT_CONFIG.swaySpeed} format={(v) => v.toFixed(2)} />
          </>
        )}
        <SliderField label="Base tilt X" value={cfg.rotX} min={-180} max={180} step={1} onChange={(rotX) => onChange({ rotX })} defaultValue={DEFAULT_CONFIG.rotX} format={deg} />
        <SliderField label="Base turn Y" value={cfg.rotY} min={-180} max={180} step={1} onChange={(rotY) => onChange({ rotY })} defaultValue={DEFAULT_CONFIG.rotY} format={deg} />
        <SliderField label="Base roll Z" value={cfg.rotZ} min={-180} max={180} step={1} onChange={(rotZ) => onChange({ rotZ })} defaultValue={DEFAULT_CONFIG.rotZ} format={deg} />
        <ToggleField label="Drag to rotate (360°)" value={cfg.interactive} onChange={(interactive) => onChange({ interactive })} />
        <SliderField label="Drag glide" value={cfg.inertia} min={0.01} max={0.6} step={0.01} onChange={(inertia) => onChange({ inertia })} defaultValue={DEFAULT_CONFIG.inertia} format={(v) => v.toFixed(2)} />
        <ToggleField label="Scroll to zoom" value={cfg.wheelZoom} onChange={(wheelZoom) => onChange({ wheelZoom })} />
        <SliderField label="Zoom" value={cfg.zoom} min={0.3} max={2} step={0.01} onChange={(zoom) => onChange({ zoom })} defaultValue={DEFAULT_CONFIG.zoom} format={(v) => `${v.toFixed(2)}×`} />
        <SliderField label="Perspective" value={cfg.perspective} min={0} max={1.1} step={0.01} onChange={(perspective) => onChange({ perspective })} defaultValue={DEFAULT_CONFIG.perspective} format={pct} />
        <SliderField label="Offset X" value={cfg.offsetX} min={-0.5} max={0.5} step={0.01} onChange={(offsetX) => onChange({ offsetX })} defaultValue={DEFAULT_CONFIG.offsetX} format={pct} />
        <SliderField label="Offset Y" value={cfg.offsetY} min={-0.5} max={0.5} step={0.01} onChange={(offsetY) => onChange({ offsetY })} defaultValue={DEFAULT_CONFIG.offsetY} format={pct} />
      </Section>}

      <Section title="Effects">
        <SliderField label="Wave amplitude" value={cfg.waveAmp} min={0} max={0.3} step={0.005} onChange={(waveAmp) => onChange({ waveAmp })} defaultValue={DEFAULT_CONFIG.waveAmp} format={(v) => v.toFixed(3)} />
        <SliderField label="Wave frequency" value={cfg.waveFreq} min={1} max={30} step={0.5} onChange={(waveFreq) => onChange({ waveFreq })} defaultValue={DEFAULT_CONFIG.waveFreq} />
        <SliderField label="Wave speed" value={cfg.waveSpeed} min={0} max={8} step={0.1} onChange={(waveSpeed) => onChange({ waveSpeed })} defaultValue={DEFAULT_CONFIG.waveSpeed} />
        <SliderField label="Glyph shimmer" value={cfg.shimmer} min={0} max={0.6} step={0.01} onChange={(shimmer) => onChange({ shimmer })} defaultValue={DEFAULT_CONFIG.shimmer} format={pct} />
        <SliderField label="Scanline glow" value={cfg.scanStrength} min={0} max={1} step={0.01} onChange={(scanStrength) => onChange({ scanStrength })} defaultValue={DEFAULT_CONFIG.scanStrength} format={pct} />
        <SliderField label="Scanline speed" value={cfg.scanSpeed} min={0.05} max={1.5} step={0.01} onChange={(scanSpeed) => onChange({ scanSpeed })} defaultValue={DEFAULT_CONFIG.scanSpeed} format={(v) => v.toFixed(2)} />
        <SliderField label="Intro dissolve" value={cfg.intro} min={0} max={4} step={0.1} onChange={(intro) => onChange({ intro })} defaultValue={DEFAULT_CONFIG.intro} format={(v) => (v === 0 ? 'off' : `${v.toFixed(1)}s`)} />
      </Section>

      <Section title="Background grid">
        <ToggleField label="Dotted grid" value={cfg.gridDots} onChange={(gridDots) => onChange({ gridDots })} />
        {cfg.gridDots && (
          <>
            <TextField label="Grid glyph" value={cfg.gridChar} onChange={(gridChar) => onChange({ gridChar: Array.from(gridChar)[0] ?? '' })} />
            <ColorField label="Grid color" value={cfg.gridColor} onChange={(gridColor) => onChange({ gridColor })} />
            <SliderField label="Grid opacity" value={cfg.gridOpacity} min={0.01} max={0.6} step={0.01} onChange={(gridOpacity) => onChange({ gridOpacity })} defaultValue={DEFAULT_CONFIG.gridOpacity} format={pct} />
          </>
        )}
      </Section>

      <Section title="Export" defaultOpen>
        <div className="grid grid-cols-3 gap-2">
          {[
            { key: 'code', label: copied === 'code' ? 'Copied' : 'Code', action: onCopyCode },
            { key: 'json', label: copied === 'json' ? 'Copied' : 'JSON', action: onCopyJson },
            { key: 'png', label: 'PNG', action: onDownloadPng },
            { key: 'video', label: recording ? 'Recording…' : 'Video', action: onRecord, disabled: recording },
            { key: 'image', label: copied === 'image' ? 'Copied' : 'Copy PNG', action: onCopyImage },
            { key: 'text', label: copied === 'text' ? 'Copied' : 'Copy text', action: onCopyText },
            { key: 'terminal', label: copied === 'terminal' ? 'Copied' : 'Terminal', action: onCopyTerminal },
            { key: 'share', label: copied === 'share' ? 'Copied' : 'Share link', action: onShare },
          ].map((b) => (
            <button
              key={b.key}
              type="button"
              onClick={b.action}
              disabled={b.disabled}
              className="h-9 border border-border text-[11px] tracking-widest uppercase transition-colors hover:border-foreground hover:bg-foreground hover:text-background focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-60"
            >
              {b.label}
            </button>
          ))}
        </div>
        <label className="sr-only" htmlFor="export-code">
          Generated component code
        </label>
        <textarea
          id="export-code"
          readOnly
          value={code}
          rows={12}
          className="w-full resize-y border border-border bg-background p-2 text-[11px] leading-relaxed text-muted-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2"
        />
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Copy <code className="text-foreground">components/ohmyascii.tsx</code> and{' '}
          <code className="text-foreground">lib/ascii/</code> into any Next.js project, install{' '}
          <code className="text-foreground">swr</code>, and expose the mono fonts as CSS variables.
        </p>
      </Section>
    </div>
  )
}
