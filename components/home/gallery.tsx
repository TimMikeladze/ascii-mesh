'use client'

import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { OhMyAscii } from '@/components/ohmyascii'
import { LOOKS, mergeConfig, type AsciiConfig } from '@/lib/ascii/config'
import { getSourcePresets } from '@/lib/ascii/presets'
import type { SourceSpec } from '@/lib/ascii/source'
import { encodeShare } from '@/components/studio/share'
import { WORLD_PRESETS } from '@/lib/ascii/worlds'
import type { SourceState } from '@/components/studio/types'

// Gallery of creations under the home composer: every tuned world preset, every built-in mark
// (each with its own look) and a type sample — all live `OhMyAscii` cards. Cards build and mount
// only once scrolled near the viewport; `interactive: false` keeps touch drags scrolling the page.
// Clicking opens the studio: worlds via `#w=<key>`, marks and text via `#s=…` share links.

function useInView<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true)
          io.disconnect()
        }
      },
      { rootMargin: '300px' },
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  return [ref, inView] as const
}

interface CardSpec {
  href: string
  label: string
  blurb: string
  source: SourceSpec
  config: Partial<AsciiConfig>
}

function look(key: string): Partial<AsciiConfig> {
  return LOOKS.find((l) => l.key === key)?.patch ?? {}
}

// The built-in marks, each wearing a different tuned look; links restore source + look in the studio.
const MARK_CARDS: CardSpec[] = getSourcePresets().map((p) => {
  const tuned: Record<string, { config: Partial<AsciiConfig>; blurb: string }> = {
    starburst: { config: {}, blurb: 'The studio’s default mark — a sunburst, extruded and turning.' },
    spiral: { config: look('blueprint'), blurb: 'One swept line becomes a blueprint vortex.' },
    rings: { config: look('binary'), blurb: 'Concentric rings written in 0s and 1s, shaded by depth.' },
    bolt: { config: look('amber'), blurb: 'A logo silhouette on an amber CRT.' },
    heart: {
      config: { charset: ' .:-=+*#%@', colorMode: 'gradient', fg: '#ff6a8a', fg2: '#4a1230', bg: '#14050a', gridDots: false },
      blurb: 'A rose gradient, made for a 404 page.',
    },
    hexagon: {
      config: { charset: ' .·:+x#', colorMode: 'gradient', fg: '#b9a0ff', fg2: '#372a66', bg: '#0b0716', gridDots: false },
      blurb: 'Violet light on machined edges.',
    },
    star: { config: look('terminal'), blurb: 'Flat mono on black — a logo needs no color.' },
  }
  const t = tuned[p.key] ?? { config: {}, blurb: p.label }
  const cfg = mergeConfig(t.config)
  const source: SourceState = { kind: 'preset', key: p.key }
  return { href: `/studio#s=${encodeShare(cfg, source)}`, label: p.label, blurb: t.blurb, source: { kind: 'url', url: p.url, name: `${p.key}.svg` }, config: t.config }
})

const TYPE_CARDS: CardSpec[] = [
  (() => {
    const text = { text: 'ASCII', fontKey: 'jetbrains' as const, weight: 800 }
    return {
      href: `/studio#s=${encodeShare(mergeConfig(look('ink')), { kind: 'text', ...text })}`,
      label: 'Type · ASCII',
      blurb: 'Any word, any mono typeface, extruded — light mode included.',
      source: { kind: 'text', ...text },
      config: look('ink'),
    }
  })(),
  (() => {
    const text = { text: '404', fontKey: 'space' as const, weight: 700 }
    return {
      href: `/studio#s=${encodeShare(mergeConfig(look('amber')), { kind: 'text', ...text })}`,
      label: 'Type · 404',
      blurb: 'A big amber 404 — the other thing monospace was made for.',
      source: { kind: 'text', ...text },
      config: look('amber'),
    }
  })(),
]

function GalleryCard({ card }: { card: CardSpec }) {
  const [ref, inView] = useInView<HTMLDivElement>()
  return (
    <Link
      href={card.href}
      className="group block border border-border transition-colors hover:border-foreground focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:-outline-offset-4"
    >
      <div ref={ref} className="aspect-[16/10] w-full overflow-hidden border-b border-dashed border-border">
        {inView && <OhMyAscii source={card.source} config={{ ...card.config, interactive: false }} className="h-full w-full" label={`${card.label} — animated ASCII render: ${card.blurb}`} />}
      </div>
      <div className="flex flex-col gap-0.5 px-3 py-2.5">
        <span className="text-xs tracking-widest text-foreground uppercase">{card.label}</span>
        <span className="text-[11px] leading-snug text-muted-foreground">{card.blurb}</span>
      </div>
    </Link>
  )
}

export function Gallery() {
  // `world()` builds plain data objects (no sampling) — safe to hold at module level per mount.
  const worldCards = useMemo(
    () => WORLD_PRESETS.map((p) => ({ href: `/studio#w=${p.key}`, label: p.label, blurb: p.blurb, source: { kind: 'world', world: p.world() } as SourceSpec, config: p.config })),
    [],
  )
  const total = worldCards.length + MARK_CARDS.length + TYPE_CARDS.length
  return (
    <section aria-labelledby="gallery-heading" className="mx-auto w-full max-w-6xl px-4 pb-16 sm:px-6">
      <div className="mb-4 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-t border-dashed border-border pt-10">
        <h2 id="gallery-heading" className="text-sm tracking-widest uppercase">
          Start from a creation
        </h2>
        <p className="text-[11px] text-muted-foreground">{total} creations · click any to open the studio</p>
      </div>
      <h3 className="mb-3 text-[11px] tracking-widest text-muted-foreground uppercase">Scenes</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {worldCards.map((c) => (
          <GalleryCard key={c.href} card={c} />
        ))}
      </div>
      <h3 className="mt-8 mb-3 text-[11px] tracking-widest text-muted-foreground uppercase">Marks &amp; type</h3>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {MARK_CARDS.map((c) => (
          <GalleryCard key={c.href} card={c} />
        ))}
        {TYPE_CARDS.map((c) => (
          <GalleryCard key={c.href} card={c} />
        ))}
      </div>
    </section>
  )
}
