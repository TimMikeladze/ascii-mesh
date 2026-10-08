---
name: ascii-studio
description: Build ASCII animations for the ascii/mesh studio by writing `*.ascii.json` piece files into a folder the studio is holding — logos, 3D models, and whole animated 2D/3D worlds (many objects, generative backgrounds, camera moves). Use when asked to make, tweak or model an ASCII render/animation/logo/scene/world, or when the user mentions the ascii/mesh studio, pieces, or `.frame.txt`.
---

# ascii-studio

The studio (this repo's app, `pnpm dev`) can **hold a folder** (Folder section → Open folder,
desktop Chrome/Edge). Every `*.ascii.json` in it is a *piece*. You write pieces with plain file
edits; the studio renders the active one live within ~0.5s, saves the user's slider tweaks back
to the same file, and writes what it rendered to `<name>.frame.txt` next to it.

## MCP tools (if the `ascii-studio` server is connected)

Prefer them over raw file edits: `studio_guide` (full format), `get_gallery_piece` (tuned examples),
`validate_piece`, `render_piece` (headless text frames at any time `t` — check composition and motion
without the studio), `list_pieces`, `read_piece` (includes the studio's latest `.frame.txt`),
`write_piece` (validates, normalises, saves, returns a preview). Server: `scripts/mcp-server.ts`.

## Loop

1. Ask which folder the studio holds if unknown (any folder works; a project's `ascii/` is typical).
2. Write `<slug>.ascii.json`. A new piece is auto-opened when no other piece is active;
   otherwise tell the user to click it under Folder.
3. Wait ~2s, then read `<slug>.frame.txt` — the plain-text glyph grid of the current frame.
   Check silhouette, density and framing from it. It is a snapshot mid-animation.
4. Edit the piece (or the SVG/image it references — that reloads too) and re-read the frame. **Re-read the piece before each edit**: the user may
   have changed it from the studio (studio saves rewrite the file, config as a diff).

## Piece format

```json
{
  "v": 1,
  "name": "Optional label",
  "source": { "kind": "preset", "key": "rings" },
  "config": { "charset": " .:-=+*#%@", "colorMode": "mono", "fg": "#f2f2f2" }
}
```

`config` lists only keys that differ from defaults; unknown keys or wrong types are dropped
silently. An invalid file shows an error toast in the studio and keeps the last good render.

### Sources

| kind | fields |
|---|---|
| `preset` | `key`: `starburst` `spiral` `rings` `bolt` `heart` `hexagon` `star` |
| `text` | `text` (≤6 lines, `\n`), `fontKey`?: `geist-mono` `jetbrains` `space` `plex` `system`, `weight`? 300–900 |
| `image` | `path` relative to the piece: `.svg` `.png` `.jpg` `.webp` `.gif` inside the folder. You can write an SVG yourself — white shapes on transparent extrude best |
| `scene` | `scene`: a 3D model, below |
| `world` | `world`: a whole animated scene — many objects, backgrounds, camera. Below |

Images/text: `shape: "extrude"` (logos, silhouettes; `thickness`) or `"relief"` (photos;
`reliefDepth`, usually with `maskMode: "none"`, `shade: "both"`).

### Scene source (3D modelling)

```json
{ "kind": "scene", "scene": {
  "v": 1, "blend": 0.12,
  "prims": [
    { "type": "sphere", "op": "add", "pos": [0, 0.22, 0], "rot": [0, 0, 0], "scale": [0.9, 0.9, 0.9], "color": "#e4e4e4" },
    { "type": "cylinder", "op": "subtract", "pos": [0, 0.22, 0], "rot": [90, 0, 0], "scale": [0.36, 1.4, 0.36], "color": "#8a8a8a" }
  ],
  "dabs": [ { "p": [0.3, 0.5, 0.2], "r": 0.08, "op": "add", "color": "#ff6a3d" } ]
} }
```

- `type`: `sphere box cylinder torus cone`. Unit shapes centred on the origin (sphere diameter
  1 at scale 1); keep the model within roughly ±1. `rot` is Euler degrees (X, then Y, then Z).
- `op: "subtract"` carves. `blend` = smooth-union radius (0 = hard CSG, 0.05–0.2 organic).
- `dabs` are sculpt blobs (sphere radius `r`), for small bumps/details.
- Colours show only with `"colorMode": "source"`. `id` is optional (generated).

### World source (whole 2D / 3D scenes)

```json
{ "kind": "world", "world": {
  "name": "Moonrise", "duration": 12, "fit": 1.2,
  "camera": { "rot": [-12, 0, 0], "zoom": 1, "fov": 0.3, "pan": [0, 0.1], "anim": [{ "type": "sway", "axis": "y", "amp": 8, "speed": 0.083 }] },
  "fields": [
    { "type": "gradient", "layer": "back", "charset": " .·:", "colors": ["#05040f", "#2a1a50"], "angle": 90 },
    { "type": "stars", "layer": "back", "charset": " .·+*", "colors": ["#3a4060", "#ffffff"] }
  ],
  "objects": [
    { "name": "Moon", "geom": { "kind": "shape", "type": "sphere" }, "pos": [0.6, 0.5, -1], "scale": [0.5, 0.5, 0.5],
      "color": "#fff4d6", "shadow": "#1a1830", "anim": [{ "type": "bob", "axis": "y", "amp": 0.05, "speed": 0.083 }] },
    { "name": "Sea", "geom": { "kind": "terrain", "type": "ocean", "amp": 0.04, "freq": 5, "speed": 1 },
      "pos": [0, -0.45, 0], "scale": [6, 1, 4], "color": "#9fb8ff", "shadow": "#05040f", "charset": ".·-~=≈" }
  ]
} }
```

- **Camera**: `rot` [tilt, turn, roll] — negative tilt looks down. `fov` 0 = flat 2D (use flat shapes on
  z-layers), 0.25–0.4 for 3D. `fit` = world half-height visible. Y up, +Z toward the viewer.
- **Objects**: `geom.kind` `shape` (sphere box cylinder torus cone) · `flat` (circle ring rect star polygon heart
  moon petal cross triangle; `bevel` pillow shading) · `text` · `curve` (helix knot lissajous spiral circle, `tube`) ·
  `terrain` (hills mountains dunes ocean; scale x/z to widen) · `particles` (stars snow rain fireflies embers galaxy
  ring dust; `count`) · `sculpt` (a scene as above). Material: `color` (lit) → `shadow` (unlit), per-object
  `charset`, `emissive` 0–1, `tint: "height"` (ramp bottom→top: suns, flames), `source: true` (sculpt colours).
- **Animation** (`anim`, summed): `spin` (deg/s) · `orbit` (radius, deg/s, tilt, phase, plane xz|xy) · `bob` /
  `sway` / `pulse` (Hz) · `drift` (vel + wrap) · `keys` (looped keyframe offsets) · deformers `wave`, `twist`.
- **Array** (`array`): `count`, `offset`, `step`, `rot` (per copy), `grow`, `spin` (whole ring), `phase` (s delay
  per copy — staggered waves), `jitter` (random heights). Ring of 12: `offset [0.6,0,0]`, `rot [0,30,0]`.
- **Fields**: `gradient plasma noise waves ripples rain fire aurora tunnel vortex stars metaballs rings grid`;
  `layer` back (behind objects) | front (over them); `colors` 2–4 stops; `random: true` for glyph rain/stars.
- Keep it cheap: ≤ ~14 objects, particles ≤ 12000. The full spec the in-app AI uses is
  `buildInstructions()` in `lib/ascii/world-prompt.ts`; tuned examples are in `lib/ascii/worlds.ts`.
  Worlds ignore `motion`/`rotX…` config (the world camera moves); look keys (`bg`, `charset`, light) still apply.

## Config keys (defaults → useful range)

- **Glyphs**: `charset` `" .·:▴▲"` (dark→bright ramp; first char usually space) ·
  `fontKey` · `fontWeight` 500 (300–800) · `cellSize` 7 (4–24 px) · `cellAspect` 1 (0.6–2.4) · `glyphScale` 1.1.
  Ramps: `" .:-=+*#%@"`, `" ░▒▓█"`, `" 01"`, `" ⠁⠃⠇⡇⣇⣧⣷⣿"`, `" ·.:∙•●"`.
- **Colour**: `colorMode` `gradient` | `mono` | `depth` | `source` · `fg` `#e4e4e4` · `fg2` `#6a6a6a` · `bg` `#0f0f0f` · `transparentBg` false.
- **Light/tone**: `shade` `light` | `image` | `both` · `lightAzimuth` -35 (±180) · `lightElevation` 35 (±90) ·
  `ambient` 0.22 · `brightness` 0.08 (±0.5) · `contrast` 1.15 (0.3–3) · `gamma` 1 · `invert` · `depthFade` 0.25 · `pointerLight`.
- **Geometry (images/text)**: `shape` `extrude` | `relief` · `thickness` 0.22 (0–0.8) · `reliefDepth` 0.35 ·
  `maskMode` `auto` `alpha` `luma` `luma-invert` `none` · `threshold` 0.5 · `smooth` 1 (0–4) · `invertMask`.
- **Motion**: `motion` `spin` | `sway` | `static` · `spinX/Y/Z` 0/22/0 (deg/s, ±180) · `swayX` 8, `swayY` 28 (0–90) · `swaySpeed` 0.8 ·
  `rotX/Y/Z` -24/32/0 base pose · `zoom` 1 (0.3–2) · `perspective` 0.35 (0–1.1) · `offsetX/Y` (±0.5) · `interactive` · `inertia` · `wheelZoom`.
- **Effects**: `waveAmp` 0 (0–0.3), `waveFreq` 6, `waveSpeed` 1.5 · `shimmer` 0.04 · `scanStrength` 0, `scanSpeed` 0.25 · `intro` 1.2 s (0 = off).
- **Grid**: `gridDots` true · `gridChar` `·` · `gridColor` · `gridOpacity` 0.1.

Source of truth: `lib/ascii/config.ts` (`AsciiConfig`), `lib/ascii/piece.ts`, `lib/ascii/scene.ts`, `lib/ascii/world.ts`.

## Using a piece in an app

`<AsciiMesh source={...} config={piece.config} />` from `components/ascii-mesh.tsx`
(scene: `source={{ kind: 'scene', scene: piece.source.scene }}`; world: `source={{ kind: 'world', world: piece.source.world }}`; image: the file's URL).
