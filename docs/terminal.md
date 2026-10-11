# Terminal

Every studio piece plays in a terminal: gallery worlds, modelled scenes, and image / text / preset pieces, in full colour. There's a CLI, a library, and a Terminal button in the studio.

## Use it

```bash
pnpm cli                                   # browse the gallery (in this repo)
pnpm terminal:link                         # build + `npm link` → `ohmyascii` on your PATH
ohmyascii koi                              # gallery key
ohmyascii ./logo.ascii.json --watch        # piece file; reloads when the studio / an agent saves it
ohmyascii 'http://localhost:3000/studio#s=…'   # studio link (studio → Terminal copies this)
cat piece.json | ohmyascii play -          # stdin
ohmyascii render koi --cols 80 --rows 24 --color none   # one frame
ohmyascii bake koi --seconds 8 > koi.sh    # self-playing sh script (also --format json | ans)
ohmyascii guide                            # embedding guide
```

Keys: ←/→ scene · w a s d orbit · 0 reset camera · space pause · +/- speed · c colour mode · g gallery · q quit.

Studio → Export → **Terminal** copies one of:
- `ohmyascii play './<piece>.ascii.json' --watch` when a folder is held. Run it in that folder and studio edits show live.
- `ohmyascii play '<share link>'` otherwise. Uploaded images can't go in a link; hold a folder for those.

## Embed it

`packages/terminal` is the `ohmyascii` package: the bin plus a typed library, bundled by tsup (`pnpm terminal:build`). It's private and not published yet.

```ts
import { openPiece, openTerminalPiece } from 'ohmyascii'

const r = await openTerminalPiece(openPiece('./logo.ascii.json'), { cols: process.stdout.columns, rows: process.stdout.rows })
const t0 = Date.now()
setInterval(() => process.stdout.write('\x1b[H' + r.frame((Date.now() - t0) / 1000).join('\n')), 1000 / 30)
```

`frame(t, { userX, userY })` returns one ANSI line per row; the optional view orbits the camera, in radians. `r.errors` lists assets that failed to load (for example a missing image) and `r.skipped` lists objects not drawn. Everything else still renders.

No JavaScript in your app? Use `bake --format json` (`{ fps, cols, rows, frames[] }`) or `--format ans`.

## How it works

- **Same renderers.** `lib/ascii/headless.ts` `createHeadlessPlayer` builds a piece once and renders frames into any 2D context. `lib/ascii/terminal.ts` passes a *recording* context: each `fillText(glyph, x, y)` lands in a cell grid tagged with the current `fillStyle`. So terminal colours equal canvas colours.
- **Canvas in Node.** `lib/ascii/node-canvas.ts` shims `document.createElement('canvas')`, `Image`, `document.fonts` and `getComputedStyle` with `@napi-rs/canvas`. The browser loaders (`source.ts`, `model.ts`, `world-assets.ts`) then run unchanged. `lib/ascii/assets.ts` `loadPieceAssets` pre-builds image / text / preset sources and text / image world objects. Relative image paths resolve against the piece file's folder.
- **Inputs.** `lib/ascii/terminal-node.ts` `openPiece` accepts a gallery key, a file path, a studio link (`#s=` / `#w=`), raw JSON, or `-`.
- **Terminal cells are tall.** Pieces are tuned for square cells, so `cellAspect` defaults to 2 (CLI `--aspect`).
- **Background.** Each line is painted in the piece's `bg` (CLI `--bg off` to skip). Dim fields are tuned to vanish against it and would otherwise show up as stripes on a grey terminal theme.
- Colour depth: `truecolor`, `256` (xterm cube + grey ramp) or `none`. Auto-detected from `NO_COLOR`, `COLORTERM` and `TERM`. An escape code is emitted only when the colour changes.
- The MCP `render_piece` / `write_piece` preview uses the same path, so agents can preview every kind of piece.

## Limits

- `blob:` image URLs exist only in the browser tab that made them. Uploads must be saved to a folder first.
- Fonts: text uses system monospace (Menlo / DejaVu …). The web fonts (Geist, JetBrains …) aren't bundled.
- Frame cost is the renderer's own. Most scenes take under 30 ms at 160×45. `ufo` takes about 200 ms because its cornfield terrain is rebuilt every frame, the same as in the browser.
