# ohmyascii

Play [ohmyascii](../../README.md) pieces in any terminal: animated ASCII worlds, sculpted models, logos and text, in truecolor / 256 colours.

```bash
ohmyascii                         # browse the gallery
ohmyascii ./logo.ascii.json --watch
ohmyascii 'https://…/studio#s=…'  # studio → Terminal copies this
ohmyascii bake koi > koi.sh       # self-playing script
ohmyascii guide
```

```ts
import { openPiece, openTerminalPiece } from 'ohmyascii'
const r = await openTerminalPiece(openPiece('koi'), { cols: 80, rows: 24 })
process.stdout.write(r.frame(1.5).join('\n'))
```

Build: `pnpm terminal:build` from the repo root. Details: [docs/terminal.md](../../docs/terminal.md).
