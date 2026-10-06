'use client'

import { useRef, useState } from 'react'
import { Upload } from 'lucide-react'
import {
  CHARSETS,
  FONT_OPTIONS,
  LOOKS,
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
  copied: string | null
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
  copied,
}: StudioPanelProps) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [urlDraft, setUrlDraft] = useState('')
  const presets = getSourcePresets()
  const activeCharset = CHARSETS.find((c) => c.value === cfg.charset)?.key ?? null

  return (
    <div className="flex flex-col">
      <Section title="Source" defaultOpen>
        <ChipRow
          label="Built-in marks"
          value={source.kind === 'preset' ? source.key : null}
          options={presets.map((p) => ({ value: p.key, label: p.label }))}
          onChange={(key) => onSource({ kind: 'preset', key })}
        />
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
                onChange={(weight) => onSource({ ...source, weight })}
              />
            </div>
          )}
        </div>
      </Section>

      <Section title="Look" defaultOpen>
        <ChipRow
          label="Presets"
          value={null}
          options={LOOKS.map((l) => ({ value: l.key, label: l.label }))}
          onChange={(key) => {
            const look = LOOKS.find((l) => l.key === key)
            if (look) onChange(look.patch)
          }}
        />
      </Section>

      <Section title="Shape">
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
          <SliderField label="Thickness" value={cfg.thickness} min={0} max={0.8} step={0.01} onChange={(thickness) => onChange({ thickness })} />
        ) : (
          <SliderField label="Relief depth" value={cfg.reliefDepth} min={0} max={1} step={0.01} onChange={(reliefDepth) => onChange({ reliefDepth })} />
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
        <SliderField label="Threshold" value={cfg.threshold} min={0.02} max={0.98} step={0.01} onChange={(threshold) => onChange({ threshold })} format={pct} />
        <SliderField label="Edge smoothing" value={cfg.smooth} min={0} max={4} step={1} onChange={(smooth) => onChange({ smooth })} />
        <ToggleField label="Invert silhouette" value={cfg.invertMask} onChange={(invertMask) => onChange({ invertMask })} />
      </Section>

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
        <SelectField label="Typeface" value={cfg.fontKey} options={fontOptions} onChange={(fontKey) => onChange({ fontKey })} />
        <SliderField label="Font weight" value={cfg.fontWeight} min={300} max={800} step={100} onChange={(fontWeight) => onChange({ fontWeight })} />
        <SliderField label="Cell size" value={cfg.cellSize} min={4} max={24} step={1} onChange={(cellSize) => onChange({ cellSize })} format={(v) => `${v}px`} />
        <SliderField label="Cell aspect" value={cfg.cellAspect} min={0.6} max={2.4} step={0.05} onChange={(cellAspect) => onChange({ cellAspect })} format={(v) => v.toFixed(2)} />
        <SliderField label="Glyph scale" value={cfg.glyphScale} min={0.5} max={1.8} step={0.05} onChange={(glyphScale) => onChange({ glyphScale })} format={(v) => v.toFixed(2)} />
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
          <ColorField label="Dark color" value={cfg.fg2} onChange={(fg2) => onChange({ fg2 })} />
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
        <SliderField label="Light azimuth" value={cfg.lightAzimuth} min={-180} max={180} step={1} onChange={(lightAzimuth) => onChange({ lightAzimuth })} format={deg} />
        <SliderField label="Light elevation" value={cfg.lightElevation} min={-90} max={90} step={1} onChange={(lightElevation) => onChange({ lightElevation })} format={deg} />
        <ToggleField label="Light follows cursor" value={cfg.pointerLight} onChange={(pointerLight) => onChange({ pointerLight })} />
        <SliderField label="Ambient" value={cfg.ambient} min={0} max={1} step={0.01} onChange={(ambient) => onChange({ ambient })} format={pct} />
        <SliderField label="Brightness" value={cfg.brightness} min={-0.5} max={0.5} step={0.01} onChange={(brightness) => onChange({ brightness })} />
        <SliderField label="Contrast" value={cfg.contrast} min={0.3} max={3} step={0.05} onChange={(contrast) => onChange({ contrast })} format={(v) => v.toFixed(2)} />
        <SliderField label="Gamma" value={cfg.gamma} min={0.3} max={3} step={0.05} onChange={(gamma) => onChange({ gamma })} format={(v) => v.toFixed(2)} />
        <SliderField label="Depth fade" value={cfg.depthFade} min={0} max={1} step={0.01} onChange={(depthFade) => onChange({ depthFade })} format={pct} />
        <ToggleField label="Invert tones" value={cfg.invert} onChange={(invert) => onChange({ invert })} />
      </Section>

      <Section title="Motion & camera" defaultOpen>
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
            <SliderField label="Spin Y (turntable)" value={cfg.spinY} min={-180} max={180} step={1} onChange={(spinY) => onChange({ spinY })} format={(v) => `${Math.round(v)}°/s`} />
            <SliderField label="Spin X (flip)" value={cfg.spinX} min={-180} max={180} step={1} onChange={(spinX) => onChange({ spinX })} format={(v) => `${Math.round(v)}°/s`} />
            <SliderField label="Spin Z (roll)" value={cfg.spinZ} min={-180} max={180} step={1} onChange={(spinZ) => onChange({ spinZ })} format={(v) => `${Math.round(v)}°/s`} />
          </>
        )}
        {cfg.motion === 'sway' && (
          <>
            <SliderField label="Sway Y range" value={cfg.swayY} min={0} max={90} step={1} onChange={(swayY) => onChange({ swayY })} format={deg} />
            <SliderField label="Sway X range" value={cfg.swayX} min={0} max={90} step={1} onChange={(swayX) => onChange({ swayX })} format={deg} />
            <SliderField label="Sway speed" value={cfg.swaySpeed} min={0.1} max={4} step={0.05} onChange={(swaySpeed) => onChange({ swaySpeed })} format={(v) => v.toFixed(2)} />
          </>
        )}
        <SliderField label="Base tilt X" value={cfg.rotX} min={-180} max={180} step={1} onChange={(rotX) => onChange({ rotX })} format={deg} />
        <SliderField label="Base turn Y" value={cfg.rotY} min={-180} max={180} step={1} onChange={(rotY) => onChange({ rotY })} format={deg} />
        <SliderField label="Base roll Z" value={cfg.rotZ} min={-180} max={180} step={1} onChange={(rotZ) => onChange({ rotZ })} format={deg} />
        <ToggleField label="Drag to rotate (360°)" value={cfg.interactive} onChange={(interactive) => onChange({ interactive })} />
        <SliderField label="Drag glide" value={cfg.inertia} min={0.01} max={0.6} step={0.01} onChange={(inertia) => onChange({ inertia })} format={(v) => v.toFixed(2)} />
        <ToggleField label="Scroll to zoom" value={cfg.wheelZoom} onChange={(wheelZoom) => onChange({ wheelZoom })} />
        <SliderField label="Zoom" value={cfg.zoom} min={0.3} max={2} step={0.01} onChange={(zoom) => onChange({ zoom })} format={(v) => `${v.toFixed(2)}×`} />
        <SliderField label="Perspective" value={cfg.perspective} min={0} max={1.1} step={0.01} onChange={(perspective) => onChange({ perspective })} format={pct} />
        <SliderField label="Offset X" value={cfg.offsetX} min={-0.5} max={0.5} step={0.01} onChange={(offsetX) => onChange({ offsetX })} format={pct} />
        <SliderField label="Offset Y" value={cfg.offsetY} min={-0.5} max={0.5} step={0.01} onChange={(offsetY) => onChange({ offsetY })} format={pct} />
      </Section>

      <Section title="Effects">
        <SliderField label="Wave amplitude" value={cfg.waveAmp} min={0} max={0.3} step={0.005} onChange={(waveAmp) => onChange({ waveAmp })} format={(v) => v.toFixed(3)} />
        <SliderField label="Wave frequency" value={cfg.waveFreq} min={1} max={30} step={0.5} onChange={(waveFreq) => onChange({ waveFreq })} />
        <SliderField label="Wave speed" value={cfg.waveSpeed} min={0} max={8} step={0.1} onChange={(waveSpeed) => onChange({ waveSpeed })} />
        <SliderField label="Glyph shimmer" value={cfg.shimmer} min={0} max={0.6} step={0.01} onChange={(shimmer) => onChange({ shimmer })} format={pct} />
        <SliderField label="Scanline glow" value={cfg.scanStrength} min={0} max={1} step={0.01} onChange={(scanStrength) => onChange({ scanStrength })} format={pct} />
        <SliderField label="Scanline speed" value={cfg.scanSpeed} min={0.05} max={1.5} step={0.01} onChange={(scanSpeed) => onChange({ scanSpeed })} format={(v) => v.toFixed(2)} />
        <SliderField label="Intro dissolve" value={cfg.intro} min={0} max={4} step={0.1} onChange={(intro) => onChange({ intro })} format={(v) => (v === 0 ? 'off' : `${v.toFixed(1)}s`)} />
      </Section>

      <Section title="Background grid">
        <ToggleField label="Dotted grid" value={cfg.gridDots} onChange={(gridDots) => onChange({ gridDots })} />
        {cfg.gridDots && (
          <>
            <TextField label="Grid glyph" value={cfg.gridChar} onChange={(gridChar) => onChange({ gridChar: Array.from(gridChar)[0] ?? '' })} />
            <ColorField label="Grid color" value={cfg.gridColor} onChange={(gridColor) => onChange({ gridColor })} />
            <SliderField label="Grid opacity" value={cfg.gridOpacity} min={0.01} max={0.6} step={0.01} onChange={(gridOpacity) => onChange({ gridOpacity })} format={pct} />
          </>
        )}
      </Section>

      <Section title="Export" defaultOpen>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: copied === 'code' ? 'Copied' : 'Code', action: onCopyCode },
            { label: copied === 'json' ? 'Copied' : 'JSON', action: onCopyJson },
            { label: 'PNG', action: onDownloadPng },
          ].map((b) => (
            <button
              key={b.label}
              type="button"
              onClick={b.action}
              className="h-9 border border-border text-[11px] tracking-widest uppercase transition-colors hover:border-foreground hover:bg-foreground hover:text-background focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2"
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
          Copy <code className="text-foreground">components/ascii-mesh.tsx</code> and{' '}
          <code className="text-foreground">lib/ascii/</code> into any Next.js project, install{' '}
          <code className="text-foreground">swr</code>, and expose the mono fonts as CSS variables.
        </p>
      </Section>
    </div>
  )
}
