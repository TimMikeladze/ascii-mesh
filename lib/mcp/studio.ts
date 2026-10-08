import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { mergeConfig } from '../ascii/config'
import { canRenderHeadless, renderHeadless } from '../ascii/headless'
import { FRAME_SUFFIX, PIECE_SUFFIX, parsePiece, pieceStem, serializePiece, type Piece } from '../ascii/piece'
import { buildInstructions } from '../ascii/world-prompt'
import { WORLD_PRESETS, getWorldPreset } from '../ascii/worlds'

// The studio's MCP tools as plain functions over one root folder (the folder the studio holds).
// scripts/mcp-server.ts exposes them over stdio. Every path is resolved inside `root`.
// See docs/local-claude.md.

const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'out'])

export class StudioFiles {
  readonly root: string
  constructor(root: string) {
    this.root = resolve(root)
  }

  /** Root-relative path → absolute, refusing anything that escapes the root. */
  resolve(path: string): string {
    const abs = resolve(this.root, path)
    if (abs !== this.root && !abs.startsWith(this.root + sep)) throw new Error(`Path escapes the studio folder: ${path}`)
    return abs
  }

  listPieces(): { path: string; name?: string; kind?: string; hasFrame: boolean; error?: string }[] {
    const out: ReturnType<StudioFiles['listPieces']> = []
    const walk = (dir: string, depth: number) => {
      if (depth > 6) return
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue
        const abs = join(dir, entry.name)
        if (entry.isDirectory()) walk(abs, depth + 1)
        else if (entry.name.endsWith(PIECE_SUFFIX)) {
          const path = relative(this.root, abs).split(sep).join('/')
          const parsed = parsePiece(readFileSync(abs, 'utf8'))
          out.push({
            path,
            ...('piece' in parsed ? { name: parsed.piece.name, kind: parsed.piece.source.kind } : { error: parsed.error }),
            hasFrame: existsSync(this.resolve(pieceStem(path) + FRAME_SUFFIX)),
          })
        }
      }
    }
    walk(this.root, 0)
    return out.sort((a, b) => a.path.localeCompare(b.path))
  }

  readPiece(path: string): { text: string; frame: string | null; frameAgeSeconds: number | null } {
    const abs = this.resolve(path)
    const frameAbs = this.resolve(pieceStem(path) + FRAME_SUFFIX)
    const hasFrame = existsSync(frameAbs)
    return {
      text: readFileSync(abs, 'utf8'),
      frame: hasFrame ? readFileSync(frameAbs, 'utf8') : null,
      frameAgeSeconds: hasFrame ? Math.round((Date.now() - statSync(frameAbs).mtimeMs) / 1000) : null,
    }
  }

  /** Validates, normalises and writes a piece. Returns what was written. */
  writePiece(path: string, json: string): { written: string; report: PieceReport } {
    if (!path.endsWith(PIECE_SUFFIX)) throw new Error(`Piece paths must end with ${PIECE_SUFFIX}`)
    const report = validatePiece(json)
    if (!report.piece) throw new Error(report.errors.join('; '))
    const abs = this.resolve(path)
    mkdirSync(dirname(abs), { recursive: true })
    const text = serializePiece(report.piece)
    writeFileSync(abs, text)
    return { written: text, report }
  }
}

export interface PieceReport {
  piece: Piece | null
  errors: string[]
  /** Entries the parser dropped or repaired. */
  warnings: string[]
}

/** Parses piece JSON and explains what the studio would drop. */
export function validatePiece(json: string): PieceReport {
  const parsed = parsePiece(json)
  if ('error' in parsed) return { piece: null, errors: [parsed.error], warnings: [] }
  const warnings: string[] = []
  const raw = JSON.parse(json) as { source?: { world?: { objects?: unknown[]; fields?: unknown[] } }; config?: Record<string, unknown> }
  const { piece } = parsed
  if (piece.source.kind === 'world') {
    const w = raw.source?.world
    const objs = Array.isArray(w?.objects) ? w.objects.length : 0
    const fields = Array.isArray(w?.fields) ? w.fields.length : 0
    if (objs !== piece.source.world.objects.length) warnings.push(`${objs - piece.source.world.objects.length} object(s) dropped (unknown geom kind or invalid fields)`)
    if (fields !== piece.source.world.fields.length) warnings.push(`${fields - piece.source.world.fields.length} field(s) dropped (unknown type)`)
    const anims = piece.source.world.objects.reduce((n, o) => n + o.anim.length, 0)
    if (!anims && !piece.source.world.camera.anim.length && !piece.source.world.objects.some((o) => o.geom.kind === 'particles'))
      warnings.push('Nothing animates: add spin / orbit / bob / pulse / sway / drift, particles or a camera move')
  }
  for (const k of Object.keys(raw.config ?? {})) if (!(k in piece.config)) warnings.push(`config.${k} is not a known key (dropped)`)
  return { piece, errors: [], warnings }
}

export function renderPieceText(json: string, opts: { times?: number[]; cols?: number; rows?: number } = {}): string {
  const report = validatePiece(json)
  if (!report.piece) throw new Error(report.errors.join('; '))
  if (!canRenderHeadless(report.piece))
    throw new Error(`"${report.piece.source.kind}" pieces render only in the studio — open the piece there and read its .frame.txt`)
  const { frames, skipped } = renderHeadless(report.piece, opts)
  const parts = frames.map((f) => `t = ${f.t}s\n${f.text || '(empty frame)'}`)
  if (skipped.length) parts.push(`Not rendered headlessly (text/image geometry; visible in the studio): ${skipped.join(', ')}`)
  if (report.warnings.length) parts.push(`Warnings:\n- ${report.warnings.join('\n- ')}`)
  return parts.join('\n\n')
}

export function galleryList() {
  return WORLD_PRESETS.map((p) => ({ key: p.key, label: p.label, blurb: p.blurb }))
}

export function galleryPiece(key: string): string {
  const p = getWorldPreset(key)
  if (!p) throw new Error(`Unknown gallery key "${key}". Keys: ${WORLD_PRESETS.map((x) => x.key).join(', ')}`)
  return serializePiece({ name: p.label, source: { kind: 'world', world: p.world() }, config: mergeConfig(p.config) })
}

export function studioGuide(): string {
  return `${buildInstructions()}
# Pieces (files the studio renders)
A piece is \`<name>${PIECE_SUFFIX}\`: { "v": 1, "name"?, "source": { "kind": "world", "world": World }, "config": Config-diff }.
Other source kinds: preset { key }, text { text, fontKey, weight }, image { path }, scene { scene } (see the ascii-studio skill).
Loop: write_piece → render_piece (headless preview, instant) → the studio (if it holds this folder) renders live and writes
<name>${FRAME_SUFFIX}; read it with read_piece. Re-read a piece before editing — the user may have tweaked it in the studio.`
}
