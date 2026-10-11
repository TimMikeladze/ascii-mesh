import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { decodeShare } from '../../components/studio/share'
import { loadPieceAssets } from './assets'
import { mergeConfig } from './config'
import { parsePiece, type Piece } from './piece'
import { createTerminalRenderer, type TerminalOptions, type TerminalRenderer } from './terminal'
import { WORLD_PRESETS, getWorldPreset } from './worlds'

// Node entry for terminal playback: turn whatever the user has (gallery key, *.ascii.json path,
// studio link, raw JSON, stdin) into a piece, build its canvas assets, and return a renderer.

export interface OpenedPiece {
  piece: Piece
  /** File the piece came from, when it came from one (for --watch and relative images). */
  path?: string
  /** Where it came from, for status lines. */
  origin: 'gallery' | 'file' | 'link' | 'json'
}

export function galleryPiece(key: string): Piece | null {
  const p = getWorldPreset(key)
  return p ? { name: p.label, source: { kind: 'world', world: p.world() }, config: mergeConfig(p.config) } : null
}

/** Resolves a gallery key, file path, studio link (`#s=…` / `#w=…`), raw JSON, or '-' (stdin). */
export function openPiece(input: string): OpenedPiece {
  const text = input.trim()
  const gallery = galleryPiece(text)
  if (gallery) return { piece: gallery, origin: 'gallery' }

  if (/[#&](s|w)=/.test(text)) {
    const w = text.match(/[#&]w=([\w-]+)/)
    if (w) {
      const p = galleryPiece(w[1])
      if (!p) throw new Error(`Unknown gallery key "${w[1]}" in link`)
      return { piece: p, origin: 'link' }
    }
    const shared = decodeShare(text)
    if (!shared) throw new Error('Could not decode the studio link (copy it again with Share in the studio)')
    const { cfg, source, scene, world } = shared
    if (source?.kind === 'world' && world) return { piece: { source: { kind: 'world', world }, config: cfg }, origin: 'link' }
    if (source?.kind === 'scene' && scene) return { piece: { source: { kind: 'scene', scene }, config: cfg }, origin: 'link' }
    if (source?.kind === 'preset' || source?.kind === 'text') return { piece: { source, config: cfg }, origin: 'link' }
    throw new Error('This link has no source the terminal can play (uploaded images are not in share links; save the piece to a folder instead)')
  }

  if (text.startsWith('{')) return { piece: parse(text), origin: 'json' }

  const path = resolve(text === '-' ? '/dev/stdin' : text)
  let body: string
  try {
    body = readFileSync(path, 'utf8')
  } catch {
    throw new Error(`"${input}" is not a gallery key, studio link or readable file. Gallery: ${WORLD_PRESETS.map((p) => p.key).join(', ')}`)
  }
  return text === '-' ? { piece: parse(body), origin: 'json' } : { piece: parse(body), path, origin: 'file' }
}

function parse(text: string): Piece {
  const res = parsePiece(text)
  if ('error' in res) throw new Error(res.error)
  return res.piece
}

export interface OpenTerminalResult extends TerminalRenderer {
  /** Asset problems (missing images, …); the rest of the piece still renders. */
  errors: string[]
}

/** Builds a terminal renderer for any piece, loading canvas assets (images, text, presets) first. */
export async function openTerminalPiece(opened: OpenedPiece | Piece, opts: Omit<TerminalOptions, 'assets'>): Promise<OpenTerminalResult> {
  const { piece, path } = 'piece' in opened ? opened : { piece: opened, path: undefined }
  const cellAspect = opts.cellAspect ?? 2
  const assets = await loadPieceAssets(piece, { cols: opts.cols, rows: opts.rows, cellAspect, baseDir: path ? dirname(path) : undefined })
  return Object.assign(createTerminalRenderer(piece, { ...opts, cellAspect, assets }), { errors: assets.errors })
}
