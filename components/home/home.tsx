'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { ArrowRight, ArrowUp } from 'lucide-react'
import { OhMyAscii } from '@/components/ohmyascii'
import { getSourcePresets } from '@/lib/ascii/presets'
import { cn } from '@/lib/utils'
import { Gallery } from './gallery'

// The site's chat-first landing. The composer is a launcher: submitting a prompt opens the studio
// with `?q=<prompt>`, where the Generate with AI panel starts building the scene and the
// conversation continues. Below the hero, the gallery of tuned creations — also studio links.

type Engine = 'claude' | 'gateway'

interface AgentStatus {
  local: boolean
  claude: { installed: boolean; version?: string }
  gateway: boolean
}

const ENGINE_KEY = 'ohmyascii:ai-engine'
const MARK = getSourcePresets()[0].url
const MARK_CONFIG = { interactive: false }

const IDEAS = [
  'A lighthouse on a cliff in a storm, rain and crashing waves',
  'Bioluminescent jellyfish forest in the deep sea',
  'Floating islands with waterfalls above clouds',
  'A 2D Japanese ink painting: moon, cranes and pine',
  'Saturn rising over an icy moon',
  'A neon koi swimming through a vaporwave sunset',
]

const LINK_BUTTON =
  'flex h-8 items-center gap-1.5 px-3 text-xs tracking-widest uppercase text-foreground/90 transition-colors hover:bg-foreground hover:text-background focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:-outline-offset-4'

export function Home() {
  const router = useRouter()
  const [status, setStatus] = useState<AgentStatus | null>(null)
  const [engine, setEngine] = useState<Engine>('gateway')
  const [draft, setDraft] = useState('')

  // Prefer the user's own Claude Code when the site runs locally and `claude` is installed; the
  // choice is shared with the studio's AI panel through the same localStorage key.
  useEffect(() => {
    let alive = true
    fetch('/api/agent')
      .then((r) => r.json() as Promise<AgentStatus>)
      .then((s) => {
        if (!alive) return
        setStatus(s)
        let saved: string | null = null
        try {
          saved = localStorage.getItem(ENGINE_KEY)
        } catch {}
        const canClaude = s.local && s.claude.installed
        setEngine(saved === 'gateway' && s.gateway ? 'gateway' : canClaude ? 'claude' : 'gateway')
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const pickEngine = (e: Engine) => {
    setEngine(e)
    try {
      localStorage.setItem(ENGINE_KEY, e)
    } catch {}
  }

  // Initiating a chat opens the studio; the AI panel there sends the prompt once (fresh).
  const start = useCallback(
    (text: string) => {
      const prompt = text.trim()
      if (!prompt) return
      router.push(`/studio?q=${encodeURIComponent(prompt)}`)
    },
    [router],
  )

  const claudeOk = !!status?.local && !!status.claude.installed
  const gatewayOk = !!status?.gateway
  const engineNote =
    status && engine === 'claude' && !claudeOk
      ? status.local
        ? 'Claude Code is not installed. Install it (npm i -g @anthropic-ai/claude-code), run `claude` once to log in, then reload.'
        : 'Claude Code runs only when the site is served locally (pnpm dev on localhost). Use AI Gateway here.'
      : status && engine === 'claude' && claudeOk
        ? `Uses your local Claude Code ${status.claude.version} and its login — no API key, tools disabled.`
        : status && engine === 'gateway' && !gatewayOk
          ? 'AI is not configured: set AI_GATEWAY_API_KEY or run `vercel env pull`. Until then, start from the gallery below.'
          : null

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-dashed border-border px-4 sm:px-6">
        <Link
          href="/"
          className="text-sm font-medium tracking-wide transition-colors hover:text-muted-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:-outline-offset-4"
        >
          ohmyascii
        </Link>
        <nav aria-label="Site">
          <Link href="/studio" className={LINK_BUTTON}>
            Studio
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
        </nav>
      </header>

      <section aria-label="Describe a scene" className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-7 px-4 py-12 text-center">
        <div className="w-36 shrink-0 sm:w-44">
          <OhMyAscii source={MARK} config={MARK_CONFIG} className="h-36 w-full sm:h-44" label="Spinning ASCII starburst mark" />
        </div>
        <div className="space-y-2">
          <h1 className="text-lg font-medium sm:text-xl">What should we make?</h1>
          <p className="mx-auto max-w-md text-xs leading-relaxed text-muted-foreground sm:text-sm">
            Describe a scene — a lighthouse in a storm, a koi pond, Saturn rising over an icy moon. It opens in the studio, already
            building. Keep chatting there to refine it.
          </p>
        </div>
        <form
          className="w-full border border-border bg-background focus-within:border-foreground"
          onSubmit={(e) => {
            e.preventDefault()
            start(draft)
          }}
        >
          <label htmlFor="scene-prompt" className="sr-only">
            Describe a scene
          </label>
          <textarea
            id="scene-prompt"
            rows={2}
            value={draft}
            placeholder="A quiet harbour at dawn, boats bobbing…"
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault()
                start(draft)
              }
            }}
            className="max-h-44 min-h-14 w-full resize-y bg-transparent px-3 py-2.5 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
          />
          <div className="flex items-center justify-between gap-2 border-t border-dashed border-border px-2 py-2">
            <div role="radiogroup" aria-label="AI engine" className="flex items-center border border-border">
              {(
                [
                  ['claude', 'Claude Code', claudeOk],
                  ['gateway', 'AI Gateway', gatewayOk],
                ] as const
              ).map(([value, label, ok]) => (
                <button
                  key={value}
                  type="button"
                  role="radio"
                  aria-checked={engine === value}
                  onClick={() => pickEngine(value)}
                  className={cn(
                    'h-7 px-2 text-[10px] tracking-wider uppercase transition-colors',
                    engine === value ? 'bg-foreground text-background' : 'text-muted-foreground hover:text-foreground',
                    !ok && engine !== value && 'opacity-50',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <button
              type="submit"
              aria-label="Generate in studio"
              disabled={!draft.trim()}
              className="flex size-8 items-center justify-center bg-foreground text-background transition-opacity disabled:opacity-40"
            >
              <ArrowUp className="size-4" aria-hidden />
            </button>
          </div>
        </form>
        <div className="flex flex-wrap justify-center gap-1.5">
          {IDEAS.map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => start(idea)}
              className="border border-dashed border-border px-2.5 py-1.5 text-left text-[11px] leading-snug text-muted-foreground transition-colors hover:border-foreground hover:text-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:-outline-offset-2"
            >
              {idea}
            </button>
          ))}
        </div>
        {engineNote && <p className="text-[11px] leading-relaxed text-muted-foreground">{engineNote}</p>}
      </section>

      <Gallery />

      <footer className="border-t border-dashed border-border">
        <div className="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-8 text-[11px] text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <p>Turn any photo, SVG, logo, text or 3D scene into animated ASCII.</p>
          <p className="sm:text-right">
            Ships as a component:{' '}
            <code className="text-foreground">npx shadcn add https://ohmyascii.vercel.app/r/ohmyascii.json</code>
          </p>
        </div>
      </footer>
    </div>
  )
}
