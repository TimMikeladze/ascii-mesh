# Site redesign — chat-first home, gallery, deep-linkable studio

## What we're building

- `/` is a **chat-first landing** (ChatGPT / Claude / opencode style): a big composer under a live
  ASCII mark, with idea chips and a gallery of creations below. The composer is a **launcher** —
  submitting a prompt (or clicking a chip / gallery card) **opens the studio**; the conversation
  itself lives in the studio's *Generate with AI* panel, which starts building the scene there.
- The home page never enters an active-chat state: no turns, no streaming — it hands off and stays
  a landing page.
- `/studio` is the full studio, where the AI chat continues: arriving with `?q=<prompt>` makes the
  AI panel send that prompt once (fresh — ignoring the session's current world) as soon as the
  engine status resolves, then strips the param so reloads don't re-send.

## Routes

| Route | Content |
| --- | --- |
| `/` | `components/home/home.tsx` — hero + composer + idea chips + gallery + small footer |
| `/studio` | `components/studio/ohmyascii-studio.tsx` — studio + AI chat |

## Deep links into the studio

- `?q=<prompt>` — from the home composer: the studio's AI panel sends it once, fresh. The param is
  removed from the URL right after it is read.
- `#s=<base64url>` — existing share links (config diff + source + world/scene payload).
- `#w=<preset key>` — opens the studio with a gallery preset applied (world + its tuned config,
  source switched to world). Wins over the saved session, like share links; also handled on
  `hashchange`. Implemented in the studio's existing restore effect.

Share encoding lives in `components/studio/share.ts` (pure functions) so any page can build
studio links without pulling in the studio component.

## Home page layout

```
┌──────────────────────────────────────────────┐
│ ohmyascii                      [Studio →]    │  header (h-14, dashed border)
├──────────────────────────────────────────────┤
│  hero: small live ASCII mark, greeting,      │
│  big composer (engine toggle · send),        │
│  idea chips → each opens /studio?q=…         │
├──────────────────────────────────────────────┤
│  Gallery — 20 scenes + 7 marks + 2 type,     │
│  grid 1/2/3 cols, click → /studio#w=<key>    │
├──────────────────────────────────────────────┤
│  footer: shadcn install one-liner            │
└──────────────────────────────────────────────┘
```

- The hero mark is `OhMyAscii` rendering the built-in Starburst (small, `interactive: false`) — the
  studio's default source, tying the brand together.
- Composer: textarea (Enter sends, Shift+Enter newline) + send button + compact engine toggle
  (Claude Code local vs AI Gateway, same `/api/agent` detection and `ohmyascii:ai-engine`
  localStorage preference as the studio's AI panel — they stay in sync).
- Gallery cards: `interactive: false` (so touch drags scroll the page), preset config with
  `gridDots` off, live animation; cards mount lazily via IntersectionObserver and `OhMyAscii`'s
  own observer skips rendering offscreen ones.

## Supporting notes

- `app/globals.css`: the desktop fixed app shell (`overflow: hidden`) is scoped to pages rendering
  the studio (`body:has(.studio-shell)`); the home page scrolls normally.
- The studio's AI panel grew an optional `autoPrompt` prop; its `send()` accepts a
  `{ fresh }` override so the handoff prompt ignores the session's current world.
- Registry: `components/studio/share.ts` is part of the `ohmyascii-studio` item.
