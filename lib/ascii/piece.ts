import { DEFAULT_CONFIG, FONT_OPTIONS, diffFromDefaults, mergeConfig, type AsciiConfig, type FontKey } from './config'
import { parseScene, serializeScene, type MeshScene, type SerializedScene } from './scene'

// A "piece" is one studio composition saved as `<name>.ascii.json` in a watched folder. Agents
// write these by hand; the studio renders them and saves edits back. See docs/studio-folder.md.

export const PIECE_SUFFIX = '.ascii.json'
export const FRAME_SUFFIX = '.frame.txt'

export type PieceSource =
  | { kind: 'preset'; key: string }
  | { kind: 'text'; text: string; fontKey: FontKey; weight: number }
  /** Image file relative to the piece's own directory. */
  | { kind: 'image'; path: string }
  | { kind: 'scene'; scene: MeshScene }

export interface Piece {
  name?: string
  source: PieceSource
  config: AsciiConfig
}

export interface SerializedPiece {
  v: 1
  name?: string
  source:
    | Exclude<PieceSource, { kind: 'scene' }>
    | { kind: 'scene'; scene: SerializedScene }
  config: Partial<AsciiConfig>
}

const FONT_KEYS = new Set<string>(FONT_OPTIONS.map((f) => f.key))

/** Keeps known keys whose value has the default's type. */
function parseConfig(data: unknown): AsciiConfig {
  const out: Partial<Record<keyof AsciiConfig, unknown>> = {}
  if (data && typeof data === 'object') {
    for (const [k, v] of Object.entries(data)) {
      if (!(k in DEFAULT_CONFIG)) continue
      const key = k as keyof AsciiConfig
      if (typeof v !== typeof DEFAULT_CONFIG[key]) continue
      if (typeof v === 'number' && !Number.isFinite(v)) continue
      out[key] = v
    }
  }
  return mergeConfig(out as Partial<AsciiConfig>)
}

function parseSource(data: unknown): PieceSource | null {
  if (!data || typeof data !== 'object') return null
  const s = data as Record<string, unknown>
  switch (s.kind) {
    case 'preset':
      return typeof s.key === 'string' ? { kind: 'preset', key: s.key } : null
    case 'text':
      return typeof s.text === 'string'
        ? {
            kind: 'text',
            text: s.text,
            fontKey: typeof s.fontKey === 'string' && FONT_KEYS.has(s.fontKey) ? (s.fontKey as FontKey) : 'geist-mono',
            weight: typeof s.weight === 'number' ? s.weight : 700,
          }
        : null
    case 'image':
      return typeof s.path === 'string' && s.path ? { kind: 'image', path: s.path } : null
    case 'scene': {
      const scene = parseScene(s.scene)
      return scene ? { kind: 'scene', scene } : null
    }
    default:
      return null
  }
}

/** Parses piece JSON text. Returns an error message instead of throwing. */
export function parsePiece(text: string): { piece: Piece } | { error: string } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch (e) {
    return { error: `Invalid JSON: ${(e as Error).message}` }
  }
  if (!data || typeof data !== 'object') return { error: 'Piece must be a JSON object' }
  const d = data as Record<string, unknown>
  const source = parseSource(d.source)
  if (!source) return { error: 'Missing or invalid "source" (preset, text, image or scene)' }
  return {
    piece: {
      ...(typeof d.name === 'string' ? { name: d.name } : {}),
      source,
      config: parseConfig(d.config),
    },
  }
}

/** Stable, human-editable JSON: config only lists keys that differ from defaults. */
export function serializePiece(piece: Piece): string {
  const { source } = piece
  const out: SerializedPiece = {
    v: 1,
    ...(piece.name ? { name: piece.name } : {}),
    source: source.kind === 'scene' ? { kind: 'scene', scene: serializeScene(source.scene) } : source,
    config: diffFromDefaults(piece.config),
  }
  return `${JSON.stringify(out, null, 2)}\n`
}

/** `art/logo.ascii.json` → `art/logo`. */
export function pieceStem(path: string): string {
  return path.endsWith(PIECE_SUFFIX) ? path.slice(0, -PIECE_SUFFIX.length) : path.replace(/\.[^./]+$/, '')
}

/** Resolves `rel` against the directory holding `piecePath`. Null if it escapes the root. */
export function resolveRelative(piecePath: string, rel: string): string | null {
  const parts = piecePath.split('/').slice(0, -1)
  for (const seg of rel.replace(/^\.\//, '').split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (!parts.length) return null
      parts.pop()
    } else parts.push(seg)
  }
  return parts.join('/')
}

/** First free `untitled-N.ascii.json` at the root. */
export function nextPiecePath(existing: Iterable<string>, base = 'untitled'): string {
  const taken = new Set(existing)
  for (let i = 1; ; i++) {
    const path = `${base}-${i}${PIECE_SUFFIX}`
    if (!taken.has(path)) return path
  }
}

/** Path of folder-relative `target` as seen from the directory holding `piecePath`. */
export function relativeTo(piecePath: string, target: string): string {
  const from = piecePath.split('/').slice(0, -1)
  const to = target.split('/')
  let i = 0
  while (i < from.length && i < to.length - 1 && from[i] === to[i]) i++
  return [...Array(from.length - i).fill('..'), ...to.slice(i)].join('/')
}
