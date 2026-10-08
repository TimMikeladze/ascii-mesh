import { mergeConfig, type AsciiConfig } from './config'
import type { Piece } from './piece'
import { AsciiRenderer } from './renderer'
import { buildSceneModel } from './scene'
import { buildGeom } from './world-geom'
import { WorldRenderer, type BuiltObject } from './world-renderer'

// Renders a piece to plain-text frames without a browser (Node, tests, the MCP server). Worlds and
// modelled scenes only: image / text / preset sources need a canvas to rasterise and are rendered
// by the studio (which writes `<name>.frame.txt`).

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

export function canRenderHeadless(piece: Piece): boolean {
  return piece.source.kind === 'world' || piece.source.kind === 'scene'
}

export function renderHeadless(piece: Piece, { times = [0, 2], cols = 96, rows = 40 }: HeadlessOptions = {}): HeadlessResult {
  const cfg: AsciiConfig = { ...mergeConfig(piece.config), gridDots: false, intro: 0, shimmer: 0 }
  const cw = Math.max(3, cfg.cellSize)
  const ch = Math.max(3, cfg.cellSize * cfg.cellAspect)
  const width = Math.round(cols * cw)
  const height = Math.round(rows * ch)
  const frames: HeadlessResult['frames'] = []
  const skipped: string[] = []
  const src = piece.source

  if (src.kind === 'world') {
    const world = src.world
    const px = (Math.min(width, height) * 0.5 * cfg.zoom * world.camera.zoom) / world.fit
    const h = (cw * 0.6) / px
    const built: (BuiltObject | null)[] = world.objects.map((o, i) => {
      const g = buildGeom(o.geom, o.scale.map((s) => Math.min(0.25, Math.max(0.002, h / Math.max(1e-3, Math.abs(s))))) as [number, number, number])
      if (!g && !o.hidden) skipped.push(o.name ?? `${o.geom.kind} ${i + 1}`)
      return g
    })
    const r = new WorldRenderer()
    for (const t of times) {
      r.render(NULL_CTX, width, height, 1, cfg, world, built, { time: t, introProgress: 1, userX: 0, userY: 0, zoomMul: 1, pointerX: 0, pointerY: 0 })
      frames.push({ t, text: r.toText() })
    }
    return { frames, skipped }
  }

  if (src.kind === 'scene') {
    const minSide = Math.min(width, height)
    const res = Math.min(288, Math.max(48, Math.ceil((minSide * 0.46 * cfg.zoom) / 0.65 / (0.55 * cw) / 16) * 16))
    const model = buildSceneModel(src.scene, res)
    const r = new AsciiRenderer()
    for (const t of times) {
      // Same pose maths as the component's auto motion.
      let rx = cfg.rotX
      let ry = cfg.rotY
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
      r.render(NULL_CTX, width, height, 1, cfg, model, { rotX: rx, rotY: ry, rotZ: rz, time: t, introProgress: 1, pointerX: 0, pointerY: 0, zoomMul: 1 })
      frames.push({ t, text: r.toText() })
    }
    return { frames, skipped }
  }

  throw new Error(`"${src.kind}" sources need the studio to render (it writes <name>.frame.txt); only world and scene pieces render headlessly.`)
}
