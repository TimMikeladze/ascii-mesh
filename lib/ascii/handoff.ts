// Prompts the studio copies for a coding agent running in the user's terminal (Claude Code,
// Codex, opencode) — robocn's "handoff, not integration". The agent edits a piece file; folder
// mode renders it live and writes `<name>.frame.txt` back. See docs/local-claude.md.

export interface HandoffInput {
  /** What the user wants. */
  request: string
  /** Folder-relative piece path when a folder is held and a piece is open. */
  piecePath?: string | null
  /** Name of the held folder, if any. */
  folderName?: string | null
  /** Serialized piece JSON of what's on screen, sent when there is no file to point at. */
  pieceJson?: string | null
  /** Studio URL, so the agent can tell the user where to look. */
  studioUrl?: string
}

export function agentPrompt({ request, piecePath, folderName, pieceJson, studioUrl }: HandoffInput): string {
  const ask = request.trim() || 'Make this more beautiful and more alive: richer composition, depth and motion that loops.'
  const lines = ['Use the ohmyascii-studio skill.', '']
  if (piecePath) {
    const frame = piecePath.replace(/\.ascii\.json$/, '') + '.frame.txt'
    lines.push(
      `The studio${studioUrl ? ` (${studioUrl})` : ''} is holding the folder${folderName ? ` "${folderName}"` : ''} and showing the piece \`${piecePath}\`.`,
      `Edit that file in place (re-read it first — I may have changed it from the studio). After each edit wait ~2s and read \`${frame}\` to check what rendered, then refine.`,
    )
  } else {
    lines.push(
      `The studio${studioUrl ? ` (${studioUrl})` : ''} is not holding a folder yet. Ask me which folder to use (I'll open it under Folder → Open folder), then write the piece below there as \`<slug>.ascii.json\` — a new piece opens automatically — and iterate by reading \`<slug>.frame.txt\`.`,
    )
  }
  if (pieceJson) lines.push('', 'Current piece:', '```json', pieceJson.trim(), '```')
  lines.push('', `Request: ${ask}`)
  return lines.join('\n')
}
