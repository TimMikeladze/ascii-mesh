// ohmyascii for terminals: render any studio piece (gallery world, *.ascii.json, studio link)
// as ANSI-coloured text. Node only. See README.md.

export { openPiece, openTerminalPiece, galleryPiece, type OpenedPiece, type OpenTerminalResult } from '../../../lib/ascii/terminal-node'
export { createTerminalRenderer, cellsToAnsi, detectColorDepth, parseColor, type ColorDepth, type TerminalOptions, type TerminalRenderer } from '../../../lib/ascii/terminal'
export { loadPieceAssets, needsAssets } from '../../../lib/ascii/assets'
export { createHeadlessPlayer, renderHeadless, type HeadlessView } from '../../../lib/ascii/headless'
export { parsePiece, serializePiece, type Piece } from '../../../lib/ascii/piece'
export { WORLD_PRESETS } from '../../../lib/ascii/worlds'
