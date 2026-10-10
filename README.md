# ohmyascii

Turn any photo, SVG, logo or text — a 3D shape you model, sculpt and paint yourself, or a whole animated 2D / 3D scene you compose (or describe to an AI) — into a rotatable, animated ASCII render. The home page is a chat: describe a scene and watch it render live, then continue in the studio. Ships as a studio app and as shadcn registry items.

## Run

```bash
pnpm install
pnpm dev            # pass -p <port> if 3000 is taken
pnpm test           # vitest: modelling, worlds (animation, geometry, fields, renderer), AI reply parsing
```

## The site

- **`/`** — a chat-first landing. The composer is a launcher: describe a scene and the studio opens with the AI art director already building it; keep chatting there to refine it ("make it snow").
- **Gallery** — under the home composer, 28 tuned scenes, the 7 built-in marks and type examples each render as a live card; clicking one opens the studio on it.
- **`/studio`** — the full studio (everything below), where the AI chat lives. Deep links: `/studio?q=<prompt>` starts a fresh AI scene, `/studio#w=<preset key>` (e.g. `#w=orrery`) opens a gallery creation, `/studio#s=…` share links restore config + source + world.

AI scene generation (optional) has two engines:

- **Claude Code (local)** — when the studio runs on localhost and `claude` is installed and logged in, the chat uses your own Claude Code (`claude -p`, no API key, tools disabled), keeping one Claude session per chat. `OHMYASCII_CLAUDE_MODEL` picks a model. Never available on a deployed site.
- **AI Gateway** — set `AI_GATEWAY_API_KEY`, or run `vercel env pull .env.local` in a linked project to get an OIDC token. `OHMYASCII_AI_MODEL` overrides the model (default `anthropic/claude-sonnet-5.5`).

## Install with the shadcn CLI

The registry is served from `public/r/` by this app (rebuilt on every `pnpm build`, or `pnpm registry:build`).

```bash
# Just the component (components/ohmyascii.tsx + lib/ascii/*)
npx shadcn@latest add https://ohmyascii.vercel.app/r/ohmyascii.json

# Full editor (component + studio UI + presets)
npx shadcn@latest add https://ohmyascii.vercel.app/r/ohmyascii-studio.json
```

Locally: `http://localhost:<port>/r/ohmyascii.json`.

Items are defined in `registry.json`. Fonts are read from the CSS variables `--font-geist-mono`, `--font-jetbrains`, `--font-space`, `--font-plex`; missing variables fall back to the system monospace font.

## Use

```tsx
import { OhMyAscii } from '@/components/ohmyascii'

<OhMyAscii
  source="/logo.svg"
  config={{ shape: 'extrude', thickness: 0.4, charset: ' .:-=+*#%@' }}
  className="h-[640px] w-full"
/>
```

`source` is a URL, `{ kind: 'text', text, fontKey, weight }`, `{ kind: 'scene', scene }` with a scene exported from the studio's modeller, or `{ kind: 'world', world }` with a composed world (see below). Drag rotates 360°, pinch zooms on touch and trackpad, arrow keys rotate the focused canvas (`+`/`-` zoom, `0` resets), `wheelZoom` enables scroll zoom, double-click resets. All config keys live in `lib/ascii/config.ts`; the studio's "Copy code" button emits only the keys you changed.

## Model, sculpt & paint

Source → **Model, sculpt & paint in 3D** switches the canvas to a scene you build yourself.

- **Shapes** — add sphere / box / cylinder / torus / cone, then move, rotate, scale and colour the selected one. Shapes melt into one surface (**Blend between shapes**); set a shape to **Cut away** to carve it out of the others.
- **Canvas tools** — `o` orbit · `v` select (click a shape) · `b` paint · `g` clay (build up) · `e` carve. `[` / `]` resize the brush, alt-drag orbits while a brush is active, `d` / `⌫` duplicate / delete the selected shape. Each stroke is one undo step.
- **Paint** shows in Color → Image mode (switched on automatically when you pick the brush).
- **Import** OBJ or STL (up to 250k triangles); it becomes a shape you can transform and paint. Scene JSON files load back in the same way.
- **Export** — Scene JSON (everything, including paint and imported meshes) and a PLY point cloud for Blender / MeshLab. Share links carry shapes and sculpting; paint and imported meshes stay local.

Use an exported scene in your own app:

```tsx
import { OhMyAscii } from '@/components/ohmyascii'
import type { SerializedScene } from '@/lib/ascii/scene'
import scene from './scene.json'

<OhMyAscii source={{ kind: 'scene', scene: scene as SerializedScene }} className="h-[640px] w-full" />
```

How it works: every shape and sculpt dab is a signed distance function; the scene samples each shape's surface, keeps samples on the blended surface and projects them onto it (`lib/ascii/scene.ts`). Strokes and shape tweaks only resample the region that changed. Details in `docs/mesh-editor.md`.

## Compose worlds — whole animated 2D / 3D scenes

Source → **Compose a 2D / 3D scene** switches to a *world*: many objects, each with its own geometry, colours, glyphs and animation, over generative backgrounds, seen through an animated camera.

- **Gallery** — 28 tuned scenes to start from: Orrery, Ocean sunset, Koi pond (2D), Aurora peaks, Galaxy, Double helix, Campfire, Warp tunnel, Zen garden, Neon rain, Lotus mandala (2D), Jellyfish, Synthwave, Lighthouse storm, Black hole, Firefly grove, Winter village, Earthrise, Balloon dawn, Glyph rain, Volcano, Ringed giant, Atom, Lava lamp, Desert night, Snow summit, Torus knot, Heartbeat.
- **Objects** — solids, 2D shapes (circle, ring, star, polygon, heart, moon, petal…, with pillow bevels), text, images, tubes along curves (helix, knot, lissajous, spiral), terrain (hills, mountains, dunes, a live ocean), particles (stars, snow, rain, fireflies, embers, galaxy, planetary ring, dust) and anything built in the modeller (**+ Modelled object**).
- **Material** — lit and shadow colour, per-object glyph ramp, self-lit amount, colour by height (sunsets, flames).
- **Animation** — spin, orbit, bob, pulse, sway, drift, keyframes, plus wave / twist deformers; stack as many as you like. **Arrays** repeat an object in rings, rows and spirals with staggered timing (`phase`) and random heights (`jitter`).
- **Backgrounds** — gradient, plasma, noise, waves, ripples, glyph rain, fire, aurora, tunnel, vortex, stars, metaballs, rings, retro grid; behind objects or in front of them.
- **Camera** — tilt / turn / roll, perspective (0 = flat 2D), zoom, pan and its own animation. Drag orbits, click an object to select it, `d` / `⌫` duplicate / delete. Video export records exactly one loop.
- Worlds save to the session, share links (local images excepted), folder pieces and **Export** (`*.world.json`).

```tsx
import { OhMyAscii } from '@/components/ohmyascii'
import type { SerializedWorld } from '@/lib/ascii/world'
import world from './sunset.world.json'

<OhMyAscii source={{ kind: 'world', world: world as SerializedWorld }} className="h-[640px] w-full" />
```

### Generate with AI

The **Generate with AI** section is a chat with an art director: describe a scene ("a lighthouse on a cliff in a storm") and it streams back a world and look, applied as one undo step. Follow-ups ("make it snow", "add a second moon") edit the scene on screen. The home page's chat speaks the same protocol with the same engines. Pick **Claude Code (local)** or **AI Gateway** at the top of the section. **Copy for Claude Code in your terminal** copies a handoff prompt instead ("Use the ohmyascii-studio skill…" + the open piece or the scene JSON + your request) for an agent that edits piece files while the studio renders them — the robocn pattern, see `docs/local-claude.md`. `app/api/generate/route.ts` streams from the AI Gateway; `lib/ascii/world-prompt.ts` holds the instructions and the tolerant reply parser. Details: `docs/worlds.md`.

## Build with an agent (folder mode)

The studio can hold a folder on disk (Folder → **Open folder**, desktop Chrome / Edge, via [`use-fs`](https://use-fs.com)). Every `*.ascii.json` file in it is a *piece* — source (preset, text, image, modelled scene or world) + config as plain JSON:

```json
{ "v": 1, "source": { "kind": "text", "text": "HI" }, "config": { "charset": " .:-=+*#%@", "colorMode": "mono" } }
```

- An agent (Claude Code, etc.) writes or edits pieces; the studio renders the active one live (a new piece opens automatically).
- Your slider tweaks save back to the same file; uploads are copied into the folder so the piece can reference them (`{ "kind": "image", "path": "logo.svg" }`).
- After each change the rendered frame is written next to the piece as `<name>.frame.txt`, so the agent can read what it made and iterate.
- The folder is remembered; after a browser restart click **Reconnect**.

**MCP server** — `.mcp.json` registers `ohmyascii-studio` (`pnpm mcp`) for Claude Code started in this repo: `studio_guide`, `list_gallery`, `get_gallery_piece`, `validate_piece`, `render_piece` (headless ASCII frames of worlds / modelled scenes at chosen times, no browser), `list_pieces`, `read_piece` (with the studio's `.frame.txt`), `write_piece` (validate, normalise, save, preview). It works in `OHMYASCII_STUDIO_DIR` or the working directory; see `docs/local-claude.md` to point it at another folder.

The `ohmyascii-studio` skill (`skills/ohmyascii-studio/SKILL.md`) teaches agents the format, every config key and scene modelling. `pnpm install` mirrors `skills/` into `.claude/skills/` and `.agents/skills/` (or run `pnpm skills:sync`). Details: `docs/studio-folder.md`.

## Studio extras

- **Share link** (Export → Share link, or `s`) encodes the config and preset/text source in the URL hash. Uploaded files aren't included.
- **Copy text** (Export → Copy text, or `t`) copies the current frame as plain-text ASCII. `OhMyAsciiHandle.getText()` exposes the same for your own code.
- **Video** (Export → Video) records a 5-second WebM of the canvas (worlds: exactly one loop, up to 30 s).
- **Paste** an image or image URL anywhere, or drag an image in from another tab, to convert it.
- **Shortcuts** (modeller keys above): `space` pause · `r` replay · `u` upload · `x` randomize look · `c` copy code · `s` share · `t` copy text · `f` fullscreen · `⌘Z`/`⇧⌘Z` undo/redo · `?` help.
- **Copy PNG** puts the current frame on the clipboard. Downloads are named after the source (`logo.svg` → `logo-ascii.png`).
- **Sliders:** double-click to reset to default, click the number to type a value; a dot marks changed values.
- **Session** is saved to `localStorage` and restored on reload (a share link in the URL wins).
