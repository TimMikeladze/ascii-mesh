# ascii/mesh

Turn any photo, SVG, logo or text — or a 3D shape you model, sculpt and paint yourself — into a rotatable, animated 3D ASCII render. Ships as a studio app and as shadcn registry items.

## Run

```bash
pnpm install
pnpm dev            # pass -p <port> if 3000 is taken
pnpm test           # vitest: scene modelling / sampling / import / serialisation
```

## Install with the shadcn CLI

The registry is served from `public/r/` by this app (rebuilt on every `pnpm build`, or `pnpm registry:build`).

```bash
# Just the component (components/ascii-mesh.tsx + lib/ascii/*)
npx shadcn@latest add https://ascii-mesh.vercel.app/r/ascii-mesh.json

# Full editor (component + studio UI + presets)
npx shadcn@latest add https://ascii-mesh.vercel.app/r/ascii-studio.json
```

Locally: `http://localhost:<port>/r/ascii-mesh.json`.

Items are defined in `registry.json`. Fonts are read from the CSS variables `--font-geist-mono`, `--font-jetbrains`, `--font-space`, `--font-plex`; missing variables fall back to the system monospace font.

## Use

```tsx
import { AsciiMesh } from '@/components/ascii-mesh'

<AsciiMesh
  source="/logo.svg"
  config={{ shape: 'extrude', thickness: 0.4, charset: ' .:-=+*#%@' }}
  className="h-[640px] w-full"
/>
```

`source` is a URL, `{ kind: 'text', text, fontKey, weight }`, or `{ kind: 'scene', scene }` with a scene exported from the studio's modeller (see below). Drag rotates 360°, pinch zooms on touch and trackpad, arrow keys rotate the focused canvas (`+`/`-` zoom, `0` resets), `wheelZoom` enables scroll zoom, double-click resets. All config keys live in `lib/ascii/config.ts`; the studio's "Copy code" button emits only the keys you changed.

## Model, sculpt & paint

Source → **Model, sculpt & paint in 3D** switches the canvas to a scene you build yourself.

- **Shapes** — add sphere / box / cylinder / torus / cone, then move, rotate, scale and colour the selected one. Shapes melt into one surface (**Blend between shapes**); set a shape to **Cut away** to carve it out of the others.
- **Canvas tools** — `o` orbit · `v` select (click a shape) · `b` paint · `g` clay (build up) · `e` carve. `[` / `]` resize the brush, alt-drag orbits while a brush is active, `d` / `⌫` duplicate / delete the selected shape. Each stroke is one undo step.
- **Paint** shows in Color → Image mode (switched on automatically when you pick the brush).
- **Import** OBJ or STL (up to 250k triangles); it becomes a shape you can transform and paint. Scene JSON files load back in the same way.
- **Export** — Scene JSON (everything, including paint and imported meshes) and a PLY point cloud for Blender / MeshLab. Share links carry shapes and sculpting; paint and imported meshes stay local.

Use an exported scene in your own app:

```tsx
import { AsciiMesh } from '@/components/ascii-mesh'
import type { SerializedScene } from '@/lib/ascii/scene'
import scene from './scene.json'

<AsciiMesh source={{ kind: 'scene', scene: scene as SerializedScene }} className="h-[640px] w-full" />
```

How it works: every shape and sculpt dab is a signed distance function; the scene samples each shape's surface, keeps samples on the blended surface and projects them onto it (`lib/ascii/scene.ts`). Strokes and shape tweaks only resample the region that changed. Details in `docs/mesh-editor.md`.

## Studio extras

- **Share link** (Export → Share link, or `s`) encodes the config and preset/text source in the URL hash. Uploaded files aren't included.
- **Copy text** (Export → Copy text, or `t`) copies the current frame as plain-text ASCII. `AsciiMeshHandle.getText()` exposes the same for your own code.
- **Video** (Export → Video) records a 5-second WebM of the canvas.
- **Paste** an image or image URL anywhere, or drag an image in from another tab, to convert it.
- **Shortcuts** (modeller keys above): `space` pause · `r` replay · `u` upload · `x` randomize look · `c` copy code · `s` share · `t` copy text · `f` fullscreen · `⌘Z`/`⇧⌘Z` undo/redo · `?` help.
- **Copy PNG** puts the current frame on the clipboard. Downloads are named after the source (`logo.svg` → `logo-ascii.png`).
- **Sliders:** double-click to reset to default, click the number to type a value; a dot marks changed values.
- **Session** is saved to `localStorage` and restored on reload (a share link in the URL wins).
