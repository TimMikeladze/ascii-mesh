import { resolveFontFamily, type FontKey } from './config'
import type { MeshScene, SerializedScene } from './scene'
import type { SerializedWorld, World } from './world'

export type SourceSpec =
  | { kind: 'url'; url: string; name?: string }
  | { kind: 'text'; text: string; fontKey: FontKey; weight: number }
  /** A modelled scene: the studio's live `MeshScene` or a saved scene JSON (`SerializedScene`). */
  | { kind: 'scene'; scene: MeshScene | SerializedScene }
  /** A composed world: many animated objects over generative fields (docs/worlds.md). */
  | { kind: 'world'; world: World | SerializedWorld }

type ImageSpec = Exclude<SourceSpec, { kind: 'scene' } | { kind: 'world' }>

export interface LoadedSource {
  image: CanvasImageSource
  width: number
  height: number
  hasAlpha: boolean
  isVector: boolean
}

export function sourceKey(spec: ImageSpec): string {
  return spec.kind === 'url'
    ? `url:${spec.url}`
    : `text:${spec.fontKey}:${spec.weight}:${spec.text}`
}

function detectAlpha(image: CanvasImageSource, width: number, height: number): boolean {
  const size = 64
  const scale = size / Math.max(width, height)
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = document.createElement('canvas')
  canvas.width = w
  canvas.height = h
  const ctx = canvas.getContext('2d', { willReadFrequently: true })
  if (!ctx) return false
  ctx.drawImage(image, 0, 0, w, h)
  const data = ctx.getImageData(0, 0, w, h).data
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 250) return true
  }
  return false
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('Could not load image'))
    img.src = url
  })
}

async function loadText(spec: Extract<SourceSpec, { kind: 'text' }>): Promise<LoadedSource> {
  const family = resolveFontFamily(spec.fontKey)
  const fontSize = 220
  const font = `${spec.weight} ${fontSize}px ${family}`
  try {
    await document.fonts.load(font, spec.text || 'A')
  } catch {
    // fall back to whichever font resolves
  }
  const lines = (spec.text || ' ').split('\n').slice(0, 6)
  const probe = document.createElement('canvas').getContext('2d')!
  probe.font = font
  const lineHeight = fontSize * 1.05
  const widest = Math.max(...lines.map((l) => probe.measureText(l).width), 40)
  const pad = 20
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(widest + pad * 2)
  canvas.height = Math.ceil(lineHeight * lines.length + pad * 2)
  const ctx = canvas.getContext('2d')!
  ctx.font = font
  ctx.fillStyle = '#ffffff'
  ctx.textBaseline = 'top'
  lines.forEach((line, i) => ctx.fillText(line, pad, pad + i * lineHeight))
  return {
    image: canvas,
    width: canvas.width,
    height: canvas.height,
    hasAlpha: true,
    isVector: true,
  }
}

export async function loadSource(spec: ImageSpec): Promise<LoadedSource> {
  if (spec.kind === 'text') return loadText(spec)
  const img = await loadImage(spec.url)
  const width = img.naturalWidth || 512
  const height = img.naturalHeight || 512
  const isVector = spec.url.startsWith('data:image/svg') || /\.svg(\?|$)/i.test(spec.url) || spec.name?.toLowerCase().endsWith('.svg') === true
  return { image: img, width, height, hasAlpha: detectAlpha(img, width, height), isVector }
}
