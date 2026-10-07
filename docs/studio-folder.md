# Studio folder — agents build, the studio previews

Mirrors robocn's checkout (`use-fs` over a picked directory). An agent (Claude Code) writes
plain JSON files on disk; the studio watches the folder and renders them live. Edits made in
the studio save back to the same file, and the studio writes the rendered frame next to it as
text so the agent can *read* what it made.

## File format — `*.ascii.json` (a "piece")

```jsonc
{
  "v": 1,
  "name": "Orbital logo",                       // optional label
  "source": { "kind": "preset", "key": "rings" } // or text / image / scene, below
  "config": { "charset": " .:-=+*#%@", "motion": "spin" } // AsciiConfig diff from defaults
}
```

Sources:
- `{ kind: 'preset', key }` — built-in mark (`starburst spiral rings bolt heart hexagon star`).
- `{ kind: 'text', text, fontKey?, weight? }`.
- `{ kind: 'image', path }` — image file in the folder, relative to the piece (`logo.svg`, `art/a.png`).
- `{ kind: 'scene', scene: SerializedScene }` — SDF prims / dabs / paint (`lib/ascii/scene.ts`).

`lib/ascii/piece.ts`: `parsePiece` (validates, drops unknown config keys, never throws) and
`serializePiece` (stable key order, config as diff). Pure, unit-tested.

## Watching — `components/studio/folder.tsx`

- One `useFs` (readwrite, 500ms poll). Filter: skip `node_modules`, dot-dirs, `.next`, `dist`;
  include `*.ascii.json` and images (`svg png jpg jpeg webp gif`). Images are loaded through
  `handles` → `getFile()` → object URL (the content map is text-only).
- Handle kept in IndexedDB (`lib/fs/handles.ts`); after restart it's offered as **Reconnect**.
- Paths are root-relative (use-fs prefixes the root name; stripped in one place).

## Studio wiring

- Panel section **Folder**: open / reconnect, list of pieces with the live one marked,
  **Save as new piece** (writes current state to `untitled-N.ascii.json`), close.
- Selecting a piece loads it (cfg + source + scene) as one undoable step.
- Disk change to the active piece, or to the image it references, → reload live, no intro
  replay, camera kept. New piece appearing on disk while nothing is active → auto-open it
  (agent "show me" flow); pieces found in the first 2s after holding a folder are existing
  contents and are not auto-opened. The active piece path is remembered across reloads.
- Studio edits → debounced (600ms) write to the active file. Echo guard: remember the last
  text written; a disk change equal to it is ignored.
- An upload while a piece is active is copied into the piece's directory (suffixed `-2`, `-3`…
  rather than overwriting an existing file) and the piece is rewritten to reference it in the
  same step.
- **Frame feedback**: after the active piece renders (debounced 1.5s), write
  `<stem>.frame.txt` = `AsciiMeshHandle.getText()` — the agent reads it to check its work.

## Agent skill — `skills/ascii-studio/SKILL.md`

Source of truth in `skills/`; `scripts/setup-skills.mjs` (postinstall) mirrors it into
`.claude/skills/` and `.agents/skills/` (gitignored), same as robocn. Covers: open the studio
+ connect a folder, the piece format, every config key with ranges, scene prims, the
write → read `.frame.txt` → refine loop.

## Browser support

Directory picker: desktop Chrome/Edge/Opera. Elsewhere the Folder section is hidden.
