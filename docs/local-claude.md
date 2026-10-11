# Local Claude integration

What `../robocn` does and what this repo takes from it.

## robocn: handoff, not integration

robocn ships **no runtime bridge** to Claude. No Agent SDK, no `claude` spawn, no MCP server, no
API key. On purpose: "the agent is already editing the repository". It has three local links:

1. **Filesystem loop** — the user runs `claude` in a second terminal; the app watches files
   (Fast Refresh, or `use-fs` folder polling) and shows what the agent wrote.
2. **Handoff prompts** — buttons copy a ready prompt ("Use the build-robot skill. Edit <file>…
   current pose… request: …") to paste into the agent.
3. **Skills** — `skills/*/SKILL.md` mirrored to `.claude/skills` + `.agents/skills` on
   `postinstall`, with a test that frontmatter is valid and every path a skill names exists.

Process-spawning routes there are dev-only: refuse in production, refuse non-loopback `Host`, fixed
argv, nothing from the request in the command.

## This repo

Already had (1) folder mode with `*.ascii.json` pieces + `.frame.txt` feedback and (3) the
`ohmyascii-studio` skill mirror. Added:

| Piece | What |
|---|---|
| **Handoff** `lib/ascii/handoff.ts` | `agentPrompt()` — "Use the ohmyascii-studio skill…", piece path (or the scene JSON when no folder is held), the `.frame.txt` loop, the user's request. **Copy for Claude Code in your terminal** button in the *Generate with AI* section. |
| **Local Claude engine** `lib/agent/claude-cli.ts` | The AI chat can run on the user's own Claude Code (`claude -p`, their subscription, no key). Spawned with fixed argv: `--output-format stream-json --include-partial-messages --tools "" --strict-mcp-config --setting-sources "" --system-prompt <instructions>` plus `--session-id` / `--resume` (see Sessions), prompt on stdin, cwd = OS temp dir. Text deltas are re-streamed as plain text, so the panel and `parseAiReply` don't care which engine answered. |
| **Guard** `lib/agent/local.ts` | Local engine only when `NODE_ENV !== 'production'` and the `Host` is loopback (robocn's scan-route rule) and the `Origin`, if sent, is the same host. |
| **Status** `GET /api/agent` | `{ local, claude: { installed, version } , gateway }` — `claude --version` with a 5s timeout, cached 30s. The panel picks *Claude Code (local)* when available, else *AI Gateway*, and explains how to enable either. |
| **Skill test** `lib/ascii/skills.test.ts` | Frontmatter `name`/`description` present; every repo path the skill names exists; its world example parses. |
| **MCP server** `scripts/mcp-server.ts`, `lib/mcp/studio.ts`, `.mcp.json` | stdio server `ohmyascii-studio` (`pnpm mcp`), root = `OHMYASCII_STUDIO_DIR` or the working directory. Tools: `studio_guide` (format spec = the AI chat's instructions), `list_gallery`, `get_gallery_piece`, `validate_piece` (what the studio would drop + "nothing animates"), `render_piece` (headless text frames at chosen times — no browser), `list_pieces`, `read_piece` (+ the studio's `.frame.txt` and its age), `write_piece` (validate → normalise → save → preview frame). Paths are confined to the root; only `*.ascii.json` is written. |
| **Headless render** `lib/ascii/headless.ts` | Every piece renders to text in Node. Worlds and modelled scenes are built synchronously; image / text / preset sources and text / image world objects rasterise via `@napi-rs/canvas` (`lib/ascii/assets.ts`, `node-canvas.ts`). See `docs/terminal.md`. |
| **Sessions** | The Claude Code engine keeps one session per chat: first turn `--session-id <uuid>` (client-generated), later turns `--resume <uuid>` with only the new message. A failed turn drops the session; the next turn starts fresh with the transcript. *New chat* starts a new session. |

Why spawn the CLI, not the Agent SDK: zero new dependencies, uses whatever login Claude Code
already has, and tools are disabled — it is a text generator here, not an agent with file access.
The *agent with file access* path stays the robocn one: run `claude` in the repo and use folder
mode + the handoff prompt.

## Using it from Claude Code

`.mcp.json` registers the server for this repo — start `claude` in the repo and approve
`ohmyascii-studio`. To work on another folder (the one the studio holds), point it there:

```bash
claude mcp add ohmyascii-studio -e OHMYASCII_STUDIO_DIR=/path/to/pieces -- /path/to/ohmyascii/node_modules/.bin/tsx /path/to/ohmyascii/scripts/mcp-server.ts
```

Loop: `studio_guide` → `get_gallery_piece` / compose → `write_piece` (preview comes back) → the
studio, holding the same folder, renders it live and writes `.frame.txt` → `read_piece`.

Verified: a headless `claude -p --mcp-config .mcp.json` run listed the gallery and rendered the
campfire through the tools.
