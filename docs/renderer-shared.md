# Shared raster helpers — `lib/ascii/raster.ts`

## Problem

`AsciiRenderer` and `WorldRenderer` copy-paste the same low-level code: `hash`, `parseHex`,
the light-vector block, the tone pipeline (contrast → scan → clamp → gamma → invert → charset
index → shimmer), `toText`, the grid-dots cache and the counting-sort + `fillText` draw loop.
Fixes already drift (world's `parseHex` has a NaN guard the model renderer lacks). The two
`render()` loops stay separate — their differences (instance matrices, slots, fields, pan,
fit-normalised fov, behind-camera rejection vs. a clamped denominator) are intentional.

## Change

New `lib/ascii/raster.ts`, pure helpers + two small stateful classes:

| Export | Replaces | Notes |
|---|---|---|
| `hash`, `parseHex`, `mixRGB` | per-file copies | `parseHex` keeps the `\|\| 0` NaN guard everywhere |
| `lightVector(cfg, px, py)` | identical 15-line blocks | normalised, pointer or azimuth/elevation |
| `shadeToCharIndex(v, id, row, rows, t, cfg, nChars)` | tone pipeline | scan phase / shimmer buckets computed inside (pure in `t`) |
| `visibleText(visCell, visChar, glyphs, cols, rows, vis)` | both `toText` | identical trimming logic |
| `GridLayer` | `gridCache`/`gridKey` + draw code | offscreen canvas cache, `invalidate()` |
| `GlyphPlotter` | `order`/`counts` + sort/draw loops | counting sort by bucket, `styleFor(bucket)` callback resolves the fill style |

Both renderers delegate; `render()` methods, projection, z-buffers and buffers (`zbuf`, `ibuf`,
`sbuf`, `visCell`…) stay where they are. No behaviour change intended.

## Verification

- Before/after diff of `renderHeadless` text frames for all gallery worlds + a scene piece,
  default and tone-heavy configs, `t ∈ {0, 1.37, 2.71}` — must be byte-identical.
- New `lib/ascii/raster.test.ts` for the pure helpers (shimmer/scan branches aren't covered
  headlessly); existing `world.test.ts` render tests cover the plotter end to end.
