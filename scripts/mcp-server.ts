import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { StudioFiles, galleryList, galleryPiece, renderPieceText, studioGuide, validatePiece } from '../lib/mcp/studio'

// ohmyascii-studio MCP server (stdio). Lets Claude Code compose, validate, preview and save pieces in
// the folder the studio holds. Root: OHMYASCII_STUDIO_DIR, else the working directory.
// Registered for this repo in .mcp.json; see docs/local-claude.md.

const files = new StudioFiles(process.env.OHMYASCII_STUDIO_DIR || process.cwd())
const server = new McpServer({ name: 'ohmyascii-studio', version: '0.1.0' })

const text = (t: string) => ({ content: [{ type: 'text' as const, text: t }] })
const fail = (e: unknown) => ({ content: [{ type: 'text' as const, text: `Error: ${(e as Error).message}` }], isError: true })
const run = (fn: () => string) => {
  try {
    return text(fn())
  } catch (e) {
    return fail(e)
  }
}

const frameOpts = {
  times: z.array(z.number().min(0).max(120)).max(6).optional().describe('Seconds into the loop, one frame each (default [0, 2])'),
  cols: z.number().int().min(20).max(240).optional().describe('Frame width in glyphs (default 96)'),
  rows: z.number().int().min(10).max(120).optional().describe('Frame height in glyphs (default 40)'),
}

server.registerTool(
  'studio_guide',
  { title: 'Studio format guide', description: 'The full world / piece format, craft rules and two example worlds. Read this before composing a scene.', annotations: { readOnlyHint: true } },
  async () => text(studioGuide()),
)

server.registerTool(
  'list_gallery',
  { title: 'List gallery scenes', description: 'Curated example worlds (orrery, ocean sunset, koi pond, campfire, synthwave…).', annotations: { readOnlyHint: true } },
  async () => text(JSON.stringify(galleryList(), null, 2)),
)

server.registerTool(
  'get_gallery_piece',
  { title: 'Get a gallery scene', description: 'A gallery world as complete piece JSON — a good starting point to copy and change.', inputSchema: { key: z.string() }, annotations: { readOnlyHint: true } },
  async ({ key }) => run(() => galleryPiece(key)),
)

server.registerTool(
  'validate_piece',
  { title: 'Validate a piece', description: 'Parse piece JSON the way the studio does; returns errors, what would be dropped, and the normalised piece.', inputSchema: { piece: z.string().describe('Piece JSON text') }, annotations: { readOnlyHint: true } },
  async ({ piece }) =>
    run(() => {
      const r = validatePiece(piece)
      return JSON.stringify({ ok: !!r.piece, errors: r.errors, warnings: r.warnings }, null, 2)
    }),
)

server.registerTool(
  'render_piece',
  {
    title: 'Render a piece to text',
    description: 'Headless ASCII render of a world or modelled-scene piece at chosen times — preview composition, density and motion without the browser. Pass `piece` JSON or a `path` in the studio folder.',
    inputSchema: { piece: z.string().optional(), path: z.string().optional(), ...frameOpts },
    annotations: { readOnlyHint: true },
  },
  async ({ piece, path, ...opts }) =>
    run(() => {
      const json = piece ?? (path ? files.readPiece(path).text : null)
      if (!json) throw new Error('Pass `piece` (JSON) or `path`')
      return renderPieceText(json, opts)
    }),
)

server.registerTool(
  'list_pieces',
  { title: 'List pieces', description: `Every *.ascii.json piece under the studio folder (${files.root}), with kind and whether the studio has written a rendered frame.`, annotations: { readOnlyHint: true } },
  async () => run(() => JSON.stringify(files.listPieces(), null, 2)),
)

server.registerTool(
  'read_piece',
  { title: 'Read a piece', description: "A piece's JSON plus the studio's latest rendered frame (<name>.frame.txt) and its age.", inputSchema: { path: z.string() }, annotations: { readOnlyHint: true } },
  async ({ path }) =>
    run(() => {
      const r = files.readPiece(path)
      return `${r.text}\n--- studio frame${r.frame === null ? ': none yet (open the piece in the studio)' : ` (${r.frameAgeSeconds}s old)`} ---\n${r.frame ?? ''}`
    }),
)

server.registerTool(
  'write_piece',
  {
    title: 'Write a piece',
    description: 'Validate, normalise and save a piece in the studio folder (path must end with .ascii.json). The studio renders it live; returns warnings and a headless preview frame.',
    inputSchema: { path: z.string(), piece: z.string().describe('Piece JSON text') },
    annotations: { destructiveHint: false, idempotentHint: true },
  },
  async ({ path, piece }) =>
    run(() => {
      const { written, report } = files.writePiece(path, piece)
      let preview = ''
      try {
        preview = `\n\nPreview:\n${renderPieceText(written, { times: [1], cols: 80, rows: 32 })}`
      } catch {}
      return `Saved ${path}.${report.warnings.length ? `\nWarnings:\n- ${report.warnings.join('\n- ')}` : ''}${preview}`
    }),
)

server.connect(new StdioServerTransport()).catch((e) => {
  console.error('[ohmyascii-studio mcp]', e)
  process.exit(1)
})
