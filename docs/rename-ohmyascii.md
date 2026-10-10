# Rename: ascii/mesh → ohmyascii

Full rebrand of the product, repo and every reference. Brand name is **lowercase `ohmyascii`** everywhere it is displayed; component identifiers use `OhMyAscii`.

## Mapping

| Old | New |
|---|---|
| `ascii/mesh`, `ASCII/MESH`, `ASCII Mesh` (brand display) | `ohmyascii` |
| `ascii-mesh` (package name, registry item) | `ohmyascii` |
| `AsciiMesh` component, `AsciiMeshProps/Handle/Stats` | `OhMyAscii`, `OhMyAsciiProps/Handle/Stats` |
| `components/ascii-mesh.tsx` | `components/ohmyascii.tsx` |
| `AsciiStudio` component | `OhMyAsciiStudio` |
| `components/studio/ascii-studio.tsx` | `components/studio/ohmyascii-studio.tsx` |
| `ascii-studio` (registry item, MCP server, skill) | `ohmyascii-studio` |
| `ascii-mesh.vercel.app` | `ohmyascii.vercel.app` |
| localStorage `ascii-mesh:session/scene/world/piece/section:*/ai-engine` | `ohmyascii:…` |
| IndexedDB `ascii-mesh-fs` | `ohmyascii-fs` |
| Folder picker id `ascii-mesh-folder` | `ohmyascii-folder` |
| Env vars `ASCII_AI_MODEL`, `ASCII_CLAUDE_MODEL`, `ASCII_STUDIO_DIR` | `OHMYASCII_AI_MODEL`, `OHMYASCII_CLAUDE_MODEL`, `OHMYASCII_STUDIO_DIR` |
| GitHub repo `TimMikeladze/ascii-mesh` | `TimMikeladze/ohmyascii` |
| Vercel project `ascii-animation-generator` | `ohmyascii` |
| Local directory `ascii-animation-generator` | `ohmyascii` |

Unchanged: generic terms — `lib/ascii/*`, `*.ascii.json` pieces, `AsciiConfig`, `AsciiRenderer`, `MeshScene`, `MeshHit`, `docs/mesh-editor.md`, download suffix `-ascii`.

## Pieces

1. `git mv` the three renamed paths (component, studio component, skill dir); edit every file in the grep list (`ascii-mesh|ascii/mesh|AsciiMesh|ascii-studio|AsciiStudio`).
2. Docs + README + `skills/ohmyascii-studio/SKILL.md` (frontmatter `name:` must equal the dir name — `lib/ascii/skills.test.ts` enforces it, and it checks that every repo path the skill names exists).
3. `pnpm skills:sync` re-mirrors `skills/` into `.claude/skills/` + `.agents/skills/` (replaces the old `ascii-studio` mirrors).
4. `pnpm registry:build` regenerates gitignored `public/r/` as `ohmyascii.json` + `ohmyascii-studio.json`.
5. `gh repo rename ohmyascii` and update the git remote.
6. Rename the Vercel project via the REST API (CLI has no rename command); update `.vercel/project.json` `projectName`.
7. Rename the local directory.

## Notes

- localStorage keys change, so previously saved sessions/scenes in a browser are dropped (one-time cost of the rebrand).
- Registry consumers must switch URLs to `https://ohmyascii.vercel.app/r/ohmyascii.json` / `r/ohmyascii-studio.json`.
- The MCP server name changes (`ascii-studio` → `ohmyascii-studio`): Claude Code sessions in this repo re-approve the new server name; `claude mcp add` snippets in docs use the new name + `OHMYASCII_STUDIO_DIR`.

## Verify

`pnpm typecheck`, `pnpm test`, `pnpm registry:build`, dev server + browser check (header, title, `/r/ohmyascii.json`), `gh repo view`, Vercel API project name.
