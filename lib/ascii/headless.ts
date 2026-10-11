import { mergeConfig, type AsciiConfig } from './config'
import type { Piece } from './piece'
import { AsciiRenderer } from './renderer'
import { buildSceneModel } from './scene'
import type { Model } from './model'
import { objectSpacing } from './world-assets'
import { buildGeom } from './world-geom'
import { WorldRenderer, type BuiltObject } from './world-renderer'

// Renders a piece to plain-text frames without a browser (Node, tests, the MCP server). Worlds and
// modelled scenes build synchronously. Image / text / preset sources and text / image world objects
// need a canvas: build them first with `loadPieceAssets` (assets.ts, Node + @napi-rs/canvas) and
// pass them in as `assets`.

export interface HeadlessOptions {
  /** Seconds into the animation, one frame per entry. */
  times?: number[]
  cols?: number
  rows?: number
}

export interface HeadlessResult {
  frames: { t: number; text: string }[]
  /** Objects that could not be built headlessly (text / image geometry). */
  skipped: string[]
}

// Draw calls go nowhere; the renderers keep the glyph grid themselves (toText).
const NULL_CTX = new Proxy(
  {},
  { get: (_t, k) => (typeof k === 'string' && /^(fill|set|clear|draw|save|restore)/.test(k) ? () => {} : undefined), set: () => true },
) as unknown as CanvasRenderingContext2D

/** Renders synchronously without pre-built assets (worlds and modelled scenes). */
export function canRenderHeadless(piece: Piece): boolean {
  return piece.source.kind === 'world' || piece.source.kind === 'scene'
}

/** Models that need a canvas to build; see assets.ts. */
export interface HeadlessAssets {
  /** Image / text / preset source model. */
  source?: Model
  /** Text / image world objects, index-aligned with `world.objects`. */
  objects?: (Model | null)[]
}

/** Renders one frame at `t` seconds into `ctx` (pass a recording context to capture glyphs + colours). */
export interface HeadlessPlayer {
  cols: number
  rows: number
  cw: number
  ch: number
  /** Objects that could not be built (text / image geometry without assets). */
  skipped: string[]
  render(t: number, ctx?: CanvasRenderingContext2D, view?: HeadlessView): string
}

/** Camera nudge in radians (the studio's drag), for interactive terminal playback. */
export interface HeadlessView {
  userX?: number
  userY?: number
}

export interface HeadlessPlayerOptions {
  cols?: number
  rows?: number
  /** Cell height ÷ width override (terminal glyphs are ≈ 2; pieces are tuned for the config's value). */
  cellAspect?: number
  assets?: HeadlessAssets
}

/** Grid, pixel size and sample resolutions for a piece at a given terminal size. */
export function headlessLayout(piece: Piece, { cols = 96, rows = 40, cellAspect }: HeadlessPlayerOptions = {}) {
  const base = mergeConfig(piece.config)
  const cfg: AsciiConfig = { ...base, gridDots: false, intro: 0, shimmer: 0, cellAspect: cellAspect ?? base.cellAspect }
  const cw = Math.max(3, cfg.cellSize)
  const ch = Math.max(3, cfg.cellSize * cfg.cellAspect)
  const width = Math.round(cols * cw)
  const height = Math.round(rows * ch)
  const minSide = Math.min(width, height)
  // Same formulas as the component: model resolution for sources, world sample spacing.
  const res = Math.min(288, Math.max(48, Math.ceil((minSide * 0.46 * cfg.zoom) / 0.65 / (0.55 * cw) / 16) * 16))
  const world = piece.source.kind === 'world' ? piece.source.world : null
  const px = world ? (minSide * 0.5 * cfg.zoom * world.camera.zoom) / world.fit : 1
  const spacing = (cw * 0.6) / px
  return { cfg, cols, rows, cw, ch, width, height, res, spacing }
}

/** Builds the scene once so many frames render cheaply (terminal playback, renderHeadless). */
export function createHeadlessPlayer(piece: Piece, opts: HeadlessPlayerOptions = {}): HeadlessPlayer {
  const { cfg, cols, rows, cw, ch, width, height, res, spacing } = headlessLayout(piece, opts)
  const assets = opts.assets ?? {}
  const skipped: string[] = []
  const src = piece.source

  if (src.kind === 'world') {
    const world = src.world
    const built: (BuiltObject | null)[] = world.objects.map((o, i) => {
      const asset = assets.objects?.[i]
      const g = asset ? { model: asset } : buildGeom(o.geom, objectSpacing(o, spacing))
      if (!g && !o.hidden) skipped.push(o.name ?? `${o.geom.kind} ${i + 1}`)
      return g
    })
    const r = new WorldRenderer()
    return {
      cols,
      rows,
      cw,
      ch,
      skipped,
      render(t, ctx = NULL_CTX, view = {}) {
        r.render(ctx, width, height, 1, cfg, world, built, { time: t, introProgress: 1, userX: view.userX ?? 0, userY: view.userY ?? 0, zoomMul: 1, pointerX: 0, pointerY: 0 })
        return r.toText()
      },
    }
  }

  const model = src.kind === 'scene' ? buildSceneModel(src.scene, res) : assets.source
  if (!model) throw new Error(`"${src.kind}" pieces need a canvas: load them with loadPieceAssets (lib/ascii/assets.ts) or open them in the studio.`)
  const r = new AsciiRenderer()
  return {
    cols,
    rows,
    cw,
    ch,
    skipped,
    render(t, ctx = NULL_CTX, view = {}) {
      // Same pose maths as the component's auto motion.
      let rx = cfg.rotX + (view.userX ?? 0)
      let ry = cfg.rotY + (view.userY ?? 0)
      let rz = cfg.rotZ
      if (cfg.motion === 'spin') {
        rx += cfg.spinX * t
        ry += cfg.spinY * t
        rz += cfg.spinZ * t
      } else if (cfg.motion === 'sway') {
        const phase = cfg.swaySpeed * t
        rx += cfg.swayX * Math.sin(phase * 0.8 + 1)
        ry += cfg.swayY * Math.sin(phase)
      }
      r.render(ctx, width, height, 1, cfg, model, { rotX: rx, rotY: ry, rotZ: rz, time: t, introProgress: 1, pointerX: 0, pointerY: 0, zoomMul: 1 })
      return r.toText()
    },
  }
}

export function renderHeadless(piece: Piece, { times = [0, 2], cols = 96, rows = 40 }: HeadlessOptions = {}): HeadlessResult {
  const p = createHeadlessPlayer(piece, { cols, rows })
  return { frames: times.map((t) => ({ t, text: p.render(t) })), skipped: p.skipped }
}
