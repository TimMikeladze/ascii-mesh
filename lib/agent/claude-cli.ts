import { execFile, spawn } from 'node:child_process'
import { tmpdir } from 'node:os'

// Runs the user's own Claude Code (`claude -p`) as a plain text generator: no tools, no MCP, no
// settings, no session file, in the OS temp dir. Text deltas from `--output-format stream-json`
// are re-emitted as a plain text stream. Server-only; callers must check isLocalRequest first.

export interface ClaudeStatus {
  installed: boolean
  version?: string
}

let cached: { at: number; status: ClaudeStatus } | null = null

/** `claude --version`, cached for 30s. */
export function claudeStatus(): Promise<ClaudeStatus> {
  if (cached && Date.now() - cached.at < 30_000) return Promise.resolve(cached.status)
  return new Promise((resolve) => {
    execFile('claude', ['--version'], { timeout: 5000 }, (err, stdout) => {
      const status: ClaudeStatus = err ? { installed: false } : { installed: true, version: stdout.trim().split(/\s+/)[0] }
      cached = { at: Date.now(), status }
      resolve(status)
    })
  })
}

export type ClaudeEvent = { text: string } | { error: string } | { done: true } | null

/** One stream-json line → a text delta, an error, completion, or nothing worth forwarding. */
export function parseClaudeLine(line: string): ClaudeEvent {
  let d: Record<string, unknown>
  try {
    d = JSON.parse(line)
  } catch {
    return null
  }
  if (d.type === 'stream_event') {
    const ev = d.event as { type?: string; delta?: { type?: string; text?: string } } | undefined
    if (ev?.type === 'content_block_delta' && ev.delta?.type === 'text_delta' && ev.delta.text) return { text: ev.delta.text }
    return null
  }
  if (d.type === 'result') {
    if (d.is_error || d.subtype !== 'success') return { error: typeof d.result === 'string' && d.result ? d.result : `Claude Code stopped (${String(d.subtype)})` }
    return { done: true }
  }
  return null
}

export interface ClaudeRun {
  instructions: string
  prompt: string
  model?: string
  signal?: AbortSignal
  /**
   * Conversation continuity: start a session with this UUID, or resume it (send only the new
   * message). Without it the run keeps no session file.
   */
  session?: { id: string; resume: boolean }
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function isSessionId(id: unknown): id is string {
  return typeof id === 'string' && UUID.test(id)
}

/** argv for one `claude -p` run (exported for tests). */
export function claudeArgs({ instructions, model, session }: Omit<ClaudeRun, 'prompt' | 'signal'>): string[] {
  const sessionArgs = !session ? ['--no-session-persistence'] : session.resume ? ['--resume', session.id] : ['--session-id', session.id]
  return [
    '-p',
    '--output-format',
    'stream-json',
    '--verbose',
    '--include-partial-messages',
    '--tools',
    '',
    '--strict-mcp-config',
    '--setting-sources',
    '',
    ...sessionArgs,
    '--system-prompt',
    instructions,
    ...(model ? ['--model', model] : []),
  ]
}

/** Streams Claude Code's answer as text. Errors are appended as a final line prefixed with ⚠. */
export function streamClaude({ instructions, prompt, model, signal, session }: ClaudeRun): ReadableStream<Uint8Array> {
  if (session && !isSessionId(session.id)) throw new Error('Invalid session id')
  const args = claudeArgs({ instructions, model, session })
  const enc = new TextEncoder()
  return new ReadableStream<Uint8Array>({
    start(controller) {
      const child = spawn('claude', args, { cwd: tmpdir(), stdio: ['pipe', 'pipe', 'pipe'] })
      let buf = ''
      let stderr = ''
      let finished = false
      const finish = (error?: string) => {
        if (finished) return
        finished = true
        if (error) controller.enqueue(enc.encode(`\n⚠ ${error}`))
        controller.close()
      }
      const onAbort = () => {
        child.kill('SIGTERM')
        finish()
      }
      signal?.addEventListener('abort', onAbort, { once: true })
      child.stdout.on('data', (chunk: Buffer) => {
        buf += chunk.toString('utf8')
        let i: number
        while ((i = buf.indexOf('\n')) >= 0) {
          const ev = parseClaudeLine(buf.slice(0, i))
          buf = buf.slice(i + 1)
          if (!ev || finished) continue
          if ('text' in ev) controller.enqueue(enc.encode(ev.text))
          else if ('error' in ev) finish(ev.error)
          else finish()
        }
      })
      child.stderr.on('data', (c: Buffer) => (stderr = (stderr + c.toString('utf8')).slice(-2000)))
      child.on('error', (e: NodeJS.ErrnoException) => finish(e.code === 'ENOENT' ? 'Claude Code is not installed (no `claude` on PATH).' : e.message))
      child.on('close', (code) => {
        signal?.removeEventListener('abort', onAbort)
        finish(code ? stderr.trim().split('\n').pop() || `claude exited with code ${code}` : undefined)
      })
      child.stdin.end(prompt)
    },
  })
}
