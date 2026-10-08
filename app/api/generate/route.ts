import { streamText, type ModelMessage } from 'ai'
import { isSessionId, streamClaude } from '@/lib/agent/claude-cli'
import { isLocalRequest } from '@/lib/agent/local'
import { buildInstructions } from '@/lib/ascii/world-prompt'

// AI scene generator: a short chat turns a description into a world. Streams plain text — one
// sentence, then a ```json block the studio parses with parseAiReply (lib/ascii/world-prompt.ts).
// Engines: the Vercel AI Gateway (AI_GATEWAY_API_KEY, or the project's OIDC token via `vercel env pull`),
// or — local dev over loopback only — the user's own Claude Code (`claude -p`, docs/local-claude.md).

export const maxDuration = 120

const MODEL = process.env.ASCII_AI_MODEL || 'anthropic/claude-sonnet-5.5'
const MAX_TURNS = 12
const MAX_CHARS = 60_000

interface Body {
  messages?: { role: 'user' | 'assistant'; content: string }[]
  /** The studio's current world + config (JSON), so follow-ups edit it instead of starting over. */
  current?: string
  engine?: 'gateway' | 'claude'
  /** Claude Code engine: keep one session per chat (`resume` = send only the newest message). */
  session?: { id: string; resume: boolean }
}

export async function POST(req: Request) {
  let body: Body
  try {
    body = (await req.json()) as Body
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const turns = (body.messages ?? [])
    .filter((m) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
    .slice(-MAX_TURNS)
  if (!turns.length || turns[turns.length - 1].role !== 'user') {
    return Response.json({ error: 'Send at least one user message' }, { status: 400 })
  }
  const messages: ModelMessage[] = turns.map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS) }))
  // The current scene rides along with the latest request so edits apply to what's on screen.
  if (body.current) {
    const last = messages[messages.length - 1]
    last.content = `Current scene on screen:\n\`\`\`json\n${body.current.slice(0, MAX_CHARS)}\n\`\`\`\n\n${last.content as string}`
  }

  if (body.engine === 'claude') {
    if (!isLocalRequest(req)) return Response.json({ error: 'Claude Code is only available when the studio runs locally (pnpm dev).' }, { status: 403 })
    // With a session, Claude Code keeps the conversation: a resumed run gets only the new message.
    // Without one (or on the first turn), earlier turns go in as a transcript.
    const session = body.session && isSessionId(body.session.id) ? { id: body.session.id, resume: !!body.session.resume } : undefined
    const prompt = session?.resume
      ? (messages[messages.length - 1].content as string)
      : messages.map((m) => (m.role === 'user' ? `USER:\n${m.content as string}` : `ASSISTANT:\n${m.content as string}`)).join('\n\n')
    return new Response(streamClaude({ instructions: buildInstructions(), prompt, model: process.env.ASCII_CLAUDE_MODEL || undefined, signal: req.signal, session }), {
      headers: { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store' },
    })
  }

  if (!process.env.AI_GATEWAY_API_KEY && !process.env.VERCEL_OIDC_TOKEN) {
    return Response.json(
      { error: 'AI is not configured: set AI_GATEWAY_API_KEY, or run `vercel env pull` to get an OIDC token.' },
      { status: 503 },
    )
  }

  const result = streamText({
    model: MODEL,
    instructions: buildInstructions(),
    messages,
    maxOutputTokens: 16_000,
    abortSignal: req.signal,
    onError: ({ error }) => console.error('[generate]', error),
  })
  return result.toTextStreamResponse()
}
