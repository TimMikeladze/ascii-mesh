# ascii/mesh

Turn any photo, SVG, logo or text into a rotatable, animated 3D ASCII render. Ships as a studio app and as shadcn registry items.

## Run

```bash
pnpm install
pnpm dev            # pass -p <port> if 3000 is taken
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

`source` is a URL or `{ kind: 'text', text, fontKey, weight }`. Drag rotates 360°, pinch zooms on touch, `wheelZoom` enables scroll zoom, double-click resets. All config keys live in `lib/ascii/config.ts`; the studio's "Copy code" button emits only the keys you changed.
