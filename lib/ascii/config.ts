export type ShapeMode = 'extrude' | 'relief'
export type MaskMode = 'auto' | 'alpha' | 'luma' | 'luma-invert' | 'none'
export type ColorMode = 'mono' | 'gradient' | 'depth' | 'source'
export type ShadeMode = 'light' | 'image' | 'both'
export type MotionMode = 'static' | 'spin' | 'sway'
export type FontKey = 'geist-mono' | 'jetbrains' | 'space' | 'plex' | 'system'

export interface AsciiConfig {
  // Geometry
  shape: ShapeMode
  maskMode: MaskMode
  invertMask: boolean
  threshold: number
  smooth: number
  thickness: number
  reliefDepth: number

  // Glyphs
  charset: string
  fontKey: FontKey
  fontWeight: number
  cellSize: number
  cellAspect: number
  glyphScale: number

  // Color
  colorMode: ColorMode
  fg: string
  fg2: string
  bg: string
  transparentBg: boolean

  // Tone + light
  shade: ShadeMode
  brightness: number
  contrast: number
  gamma: number
  invert: boolean
  ambient: number
  lightAzimuth: number
  lightElevation: number
  pointerLight: boolean
  depthFade: number

  // Background grid
  gridDots: boolean
  gridChar: string
  gridColor: string
  gridOpacity: number

  // View + motion
  motion: MotionMode
  rotX: number
  rotY: number
  rotZ: number
  spinX: number
  spinY: number
  spinZ: number
  swayX: number
  swayY: number
  swaySpeed: number
  interactive: boolean
  inertia: number
  wheelZoom: boolean
  zoom: number
  perspective: number
  offsetX: number
  offsetY: number

  // Effects
  waveAmp: number
  waveFreq: number
  waveSpeed: number
  shimmer: number
  scanStrength: number
  scanSpeed: number
  intro: number
}

export const DEFAULT_CONFIG: AsciiConfig = {
  shape: 'extrude',
  maskMode: 'auto',
  invertMask: false,
  threshold: 0.5,
  smooth: 1,
  thickness: 0.22,
  reliefDepth: 0.35,

  charset: ' .·:▴▲',
  fontKey: 'geist-mono',
  fontWeight: 500,
  cellSize: 7,
  cellAspect: 1,
  glyphScale: 1.1,

  colorMode: 'gradient',
  fg: '#e4e4e4',
  fg2: '#6a6a6a',
  bg: '#0f0f0f',
  transparentBg: false,

  shade: 'light',
  brightness: 0.08,
  contrast: 1.15,
  gamma: 1,
  invert: false,
  ambient: 0.22,
  lightAzimuth: -35,
  lightElevation: 35,
  pointerLight: false,
  depthFade: 0.25,

  gridDots: true,
  gridChar: '·',
  gridColor: '#ffffff',
  gridOpacity: 0.1,

  motion: 'spin',
  rotX: -24,
  rotY: 32,
  rotZ: 0,
  spinX: 0,
  spinY: 22,
  spinZ: 0,
  swayX: 8,
  swayY: 28,
  swaySpeed: 0.8,
  interactive: true,
  inertia: 0.06,
  wheelZoom: false,
  zoom: 1,
  perspective: 0.35,
  offsetX: 0,
  offsetY: 0,

  waveAmp: 0,
  waveFreq: 6,
  waveSpeed: 1.5,
  shimmer: 0.04,
  scanStrength: 0,
  scanSpeed: 0.25,
  intro: 1.2,
}

export const FONT_OPTIONS: { key: FontKey; label: string; cssVar: string | null }[] = [
  { key: 'geist-mono', label: 'Geist Mono', cssVar: '--font-geist-mono' },
  { key: 'jetbrains', label: 'JetBrains Mono', cssVar: '--font-jetbrains' },
  { key: 'space', label: 'Space Mono', cssVar: '--font-space' },
  { key: 'plex', label: 'IBM Plex Mono', cssVar: '--font-plex' },
  { key: 'system', label: 'System mono', cssVar: null },
]

const SYSTEM_MONO = 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace'

export function resolveFontFamily(key: FontKey): string {
  const option = FONT_OPTIONS.find((f) => f.key === key)
  if (!option?.cssVar || typeof document === 'undefined') return SYSTEM_MONO
  const value = getComputedStyle(document.documentElement).getPropertyValue(option.cssVar).trim()
  return value ? `${value}, ${SYSTEM_MONO}` : SYSTEM_MONO
}

export const CHARSETS: { key: string; label: string; value: string }[] = [
  { key: 'vortex', label: 'Dots + triangles', value: ' .·:▴▲' },
  { key: 'classic', label: 'Classic ramp', value: ' .:-=+*#%@' },
  { key: 'dots', label: 'Dots', value: ' ·.:∙•●' },
  { key: 'blocks', label: 'Blocks', value: ' ░▒▓█' },
  { key: 'binary', label: 'Binary', value: ' 01' },
  { key: 'slashes', label: 'Hatch', value: ' ./\\|+#' },
  { key: 'braille', label: 'Braille', value: ' ⠁⠃⠇⡇⣇⣧⣷⣿' },
  { key: 'letters', label: 'Letters', value: ' .coCO0@' },
]

export interface LookPreset {
  key: string
  label: string
  patch: Partial<AsciiConfig>
}

export const LOOKS: LookPreset[] = [
  {
    key: 'vortex',
    label: 'Vortex',
    patch: {
      charset: ' .·:▴▲',
      colorMode: 'gradient',
      fg: '#e4e4e4',
      fg2: '#6a6a6a',
      bg: '#0f0f0f',
      transparentBg: false,
      gridDots: true,
      gridChar: '·',
      gridColor: '#ffffff',
      gridOpacity: 0.1,
      cellSize: 7,
      invert: false,
    },
  },
  {
    key: 'terminal',
    label: 'Terminal',
    patch: {
      charset: ' .:-=+*#%@',
      colorMode: 'mono',
      fg: '#f2f2f2',
      bg: '#0a0a0a',
      transparentBg: false,
      gridDots: false,
      cellSize: 8,
      invert: false,
    },
  },
  {
    key: 'blocks',
    label: 'Blocks',
    patch: {
      charset: ' ░▒▓█',
      colorMode: 'gradient',
      fg: '#ffffff',
      fg2: '#3b3b3b',
      bg: '#101010',
      transparentBg: false,
      gridDots: false,
      cellSize: 9,
      invert: false,
    },
  },
  {
    key: 'binary',
    label: 'Binary',
    patch: {
      charset: ' 01',
      colorMode: 'depth',
      fg: '#ffffff',
      fg2: '#4a4a4a',
      bg: '#0c0c0c',
      transparentBg: false,
      gridDots: false,
      cellSize: 8,
      invert: false,
    },
  },
  {
    key: 'amber',
    label: 'Amber CRT',
    patch: {
      charset: ' .:+*#',
      colorMode: 'gradient',
      fg: '#ffc46b',
      fg2: '#6b3d12',
      bg: '#120b05',
      transparentBg: false,
      gridDots: true,
      gridChar: '.',
      gridColor: '#ffb454',
      gridOpacity: 0.08,
      cellSize: 8,
      invert: false,
    },
  },
  {
    key: 'blueprint',
    label: 'Blueprint',
    patch: {
      charset: ' .·:+x',
      colorMode: 'gradient',
      fg: '#d4e6ff',
      fg2: '#4a78b8',
      bg: '#0a1a33',
      transparentBg: false,
      gridDots: true,
      gridChar: '+',
      gridColor: '#9cc2ff',
      gridOpacity: 0.07,
      cellSize: 8,
      invert: false,
    },
  },
  {
    key: 'ink',
    label: 'Ink',
    patch: {
      charset: ' .:-=+*#%@',
      colorMode: 'mono',
      fg: '#141414',
      fg2: '#8a8a8a',
      bg: '#e8e8e8',
      transparentBg: false,
      gridDots: true,
      gridChar: '·',
      gridColor: '#000000',
      gridOpacity: 0.12,
      cellSize: 8,
      invert: false,
    },
  },
]

export function mergeConfig(partial?: Partial<AsciiConfig>): AsciiConfig {
  return { ...DEFAULT_CONFIG, ...(partial ?? {}) }
}

export function diffFromDefaults(config: AsciiConfig): Partial<AsciiConfig> {
  const out: Record<string, unknown> = {}
  for (const key of Object.keys(DEFAULT_CONFIG) as (keyof AsciiConfig)[]) {
    if (config[key] !== DEFAULT_CONFIG[key]) out[key] = config[key]
  }
  return out as Partial<AsciiConfig>
}
