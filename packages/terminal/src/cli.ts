import { openSync, readFileSync, watch, type FSWatcher } from 'node:fs'
import { ReadStream } from 'node:tty'
import { serializePiece } from '../../../lib/ascii/piece'
import { detectColorDepth, type ColorDepth } from '../../../lib/ascii/terminal'
import { galleryPiece, openPiece, openTerminalPiece, type OpenedPiece, type OpenTerminalResult } from '../../../lib/ascii/terminal-node'
import { WORLD_PRESETS } from '../../../lib/ascii/worlds'

// ohmyascii in the terminal: browse the gallery, play / print / bake any studio piece.
// In this repo: `pnpm cli [command]`. Installed: `ohmyascii [command]`. See docs/terminal.md.

const HELP = `ohmyascii — animated ASCII pieces in your terminal

Usage
  ohmyascii                          browse the gallery (interactive)
  ohmyascii play <piece>             play a piece
  ohmyascii render <piece>           print one frame and exit (pipe-friendly)
  ohmyascii bake <piece> > out.sh    record frames: --format sh (self-playing script) | ans | json
  ohmyascii list                     list gallery scenes
  ohmyascii export <piece>           print a piece as *.ascii.json
  ohmyascii guide                    how to render pieces in your own terminal app

<piece> is any of
  koi                                a gallery key (see list)
  ./logo.ascii.json                  a piece file from the studio or an agent (any kind:
                                     world, model, image, text, preset)
  'https://…/studio#s=…'             a studio share link (Terminal / Share in the studio)
  -                                  piece JSON on stdin

Options
  --watch            reload the piece file whenever it is saved (play)
  --t <seconds>      frame time for render (default 1)
  --cols / --rows    size in characters (default: terminal size)
  --color <mode>     truecolor | 256 | none (default: auto, honours NO_COLOR)
  --fps <n>          frame rate for play / bake (default 30 / 15)
  --seconds <n>      bake length (default: the world's loop, else 6)
  --aspect <n>       character height ÷ width of your font (default 2)
  --bg off           keep the terminal's background instead of the piece's

Keys while playing
  ← / →  previous / next scene     w a s d  orbit the camera     0  reset camera
  space  pause                     + / -    speed                c  colour mode
  g      gallery list              q        quit
`

const GUIDE = `Rendering ohmyascii pieces in your own terminal app
===================================================

Every studio piece renders without a browser: worlds, modelled scenes, and image / text /
preset pieces (those rasterise through @napi-rs/canvas).

  import { openPiece, openTerminalPiece } from 'ohmyascii'

  // gallery key, *.ascii.json path, studio share link, or raw JSON
  const r = await openTerminalPiece(openPiece('./logo.ascii.json'), {
    cols: process.stdout.columns,
    rows: process.stdout.rows,
  })

  const start = Date.now()
  process.stdout.write('\\x1b[?25l\\x1b[2J')         // hide cursor, clear
  setInterval(() => {
    const lines = r.frame((Date.now() - start) / 1000)
    process.stdout.write('\\x1b[H' + lines.join('\\n'))
  }, 1000 / 30)

r.frame(t, { userX, userY }) returns one ANSI-coloured string per row; the optional view
orbits the camera (radians). Build once, call frame() every tick.

No JavaScript? Bake it:
  ohmyascii bake koi --seconds 8 > koi.sh && sh koi.sh        self-playing shell script
  ohmyascii bake koi --format json > koi.json                 { fps, cols, rows, frames[] }
  ohmyascii bake koi --format ans > koi.ans                   frames for cat / any player

From the studio: press Terminal to copy a ready command, or save to a folder and run
  ohmyascii play ./piece.ascii.json --watch
`

interface Args {
  cmd: string
  target?: string
  t: number
  cols?: number
  rows?: number
  depth: ColorDepth
  fps?: number
  seconds?: number
  aspect: number
  background: boolean
  watch: boolean
  format: 'sh' | 'ans' | 'json'
}

const COMMANDS = new Set(['browse', 'play', 'render', 'bake', 'list', 'export', 'guide', 'help'])

function parseArgs(argv: string[]): Args {
  const pos: string[] = []
  const flags: Record<string, string> = {}
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '-h' || a === '--help') flags.help = '1'
    else if (a === '--watch') flags.watch = '1'
    else if (a.startsWith('--')) flags[a.slice(2)] = argv[++i] ?? ''
    else pos.push(a)
  }
  const num = (k: string) => (flags[k] !== undefined && flags[k] !== '' && !Number.isNaN(+flags[k]) ? +flags[k] : undefined)
  const color = flags.color
  // `ohmyascii koi` / `ohmyascii ./x.ascii.json` are shorthand for play.
  const [first, second] = pos
  const cmd = flags.help ? 'help' : first === undefined ? 'browse' : COMMANDS.has(first) ? first : 'play'
  return {
    cmd,
    target: cmd === 'play' && !COMMANDS.has(first ?? '') ? first : second,
    t: num('t') ?? 1,
    cols: num('cols'),
    rows: num('rows'),
    depth: color === 'truecolor' || color === '256' || color === 'none' ? color : detectColorDepth(),
    fps: num('fps'),
    seconds: num('seconds'),
    aspect: num('aspect') ?? 2,
    background: flags.bg !== 'off',
    watch: flags.watch === '1',
    format: flags.format === 'ans' || flags.format === 'json' ? flags.format : 'sh',
  }
}

function fail(msg: string): never {
  process.stderr.write(`ohmyascii: ${msg}\n`)
  process.exit(1)
}

function open(target: string | undefined): OpenedPiece {
  if (!target) fail('Missing <piece>. Try `ohmyascii list`, a *.ascii.json path, or a studio link.')
  try {
    return openPiece(target)
  } catch (e) {
    fail((e as Error).message)
  }
}

function size(a: Args, reserve = 0) {
  return {
    cols: a.cols ?? Math.max(20, process.stdout.columns || 96),
    rows: a.rows ?? Math.max(8, (process.stdout.rows || 40) - reserve),
  }
}

async function build(a: Args, opened: OpenedPiece, depth: ColorDepth, reserve: number) {
  return openTerminalPiece(opened, { ...size(a, reserve), depth, cellAspect: a.aspect, background: a.background })
}

function warn(r: OpenTerminalResult) {
  for (const e of r.errors) process.stderr.write(`ohmyascii: ${e}\n`)
  if (r.skipped.length) process.stderr.write(`ohmyascii: not rendered: ${r.skipped.join(', ')}\n`)
}

async function render(a: Args) {
  const r = await build(a, open(a.target), a.depth, 1)
  warn(r)
  process.stdout.write(r.frame(a.t).join('\n') + '\n')
}

function list() {
  const w = Math.max(...WORLD_PRESETS.map((p) => p.key.length))
  for (const p of WORLD_PRESETS) process.stdout.write(`${p.key.padEnd(w)}  ${p.label} — ${p.blurb}\n`)
}

/** Length of one loop: the world's duration when it has one. */
function loopSeconds(opened: OpenedPiece, a: Args): number {
  if (a.seconds) return a.seconds
  const s = opened.piece.source
  return s.kind === 'world' && s.world.duration > 0 ? s.world.duration : 6
}

async function bake(a: Args) {
  const opened = open(a.target)
  const fps = Math.max(1, Math.min(60, a.fps ?? 15))
  const r = await build(a, opened, a.depth, 1)
  warn(r)
  const count = Math.max(1, Math.round(loopSeconds(opened, a) * fps))
  const frames = Array.from({ length: count }, (_, i) => r.frame(i / fps).join('\n'))
  const out = process.stdout
  if (a.format === 'json') return void out.write(JSON.stringify({ fps, cols: r.cols, rows: r.rows, frames }) + '\n')
  if (a.format === 'ans') return void out.write(frames.map((f) => '\x1b[H' + f).join(''))
  // Self-playing POSIX sh: quoted heredocs keep the escape bytes verbatim.
  const delay = (1 / fps).toFixed(3)
  const name = (opened.piece.name ?? a.target ?? 'piece').replace(/[^\w .-]/g, '')
  out.write(`#!/bin/sh\n# ${name} — baked by ohmyascii (${count} frames @ ${fps}fps). Run: sh ${'<this file>'}; ctrl-c to stop.\n`)
  out.write(`printf '\\033[?25l\\033[2J'\ntrap 'printf "\\033[0m\\033[?25h\\n"; exit 0' INT TERM\nwhile :; do\n`)
  frames.forEach((f, i) => out.write(`printf '\\033[H'\ncat <<'F${i}'\n${f}\nF${i}\nsleep ${delay}\n`))
  out.write('done\n')
}

const DEPTHS: ColorDepth[] = ['truecolor', '256', 'none']

interface Entry {
  opened: OpenedPiece
  label: string
  blurb?: string
}

async function play(a: Args, entries: Entry[], startIndex: number, showListAtStart: boolean) {
  const out = process.stdout
  let index = startIndex
  let showList = showListAtStart
  let listCursor = index
  let paused = false
  let speed = 1
  let t = 0
  let depth = a.depth
  let last = Date.now()
  let view = { userX: 0, userY: 0 }
  let renderer: OpenTerminalResult | null = null
  let message = ''
  let generation = 0
  let watcher: FSWatcher | null = null

  async function rebuild() {
    const gen = ++generation
    const entry = entries[index]
    try {
      const r = await build(a, entry.opened, depth, 2)
      if (gen !== generation) return
      renderer = r
      message = [...r.errors, ...(r.skipped.length ? [`not rendered: ${r.skipped.join(', ')}`] : [])].join(' · ')
    } catch (e) {
      if (gen !== generation) return
      renderer = null
      message = (e as Error).message
    }
    out.write('\x1b[2J')
  }
  function go(i: number) {
    index = (i + entries.length) % entries.length
    listCursor = index
    t = 0
    view = { userX: 0, userY: 0 }
    void rebuild()
  }

  // --watch: re-read the file on save (debounced; editors write in bursts).
  if (a.watch && entries.length === 1 && entries[0].opened.path) {
    const path = entries[0].opened.path
    let timer: NodeJS.Timeout | undefined
    watcher = watch(path, () => {
      clearTimeout(timer)
      timer = setTimeout(() => {
        try {
          entries[0] = { ...entries[0], opened: openPiece(path) }
          entries[0].label = entries[0].opened.piece.name ?? entries[0].label
          void rebuild()
        } catch (e) {
          message = `reload failed: ${(e as Error).message}`
        }
      }, 120)
    })
  }

  const plain = () => depth === 'none'
  const bold = (s: string) => (plain() ? s : `\x1b[1m${s}\x1b[0m`)
  const dim = (s: string) => (plain() ? s : `\x1b[2m${s}\x1b[0m`)
  const inv = (s: string) => (plain() ? `> ${s}` : `\x1b[7m ${s} \x1b[0m`)

  function frameLines(rows: number): string[] {
    if (showList) {
      const top = Math.max(0, Math.min(listCursor - Math.floor(rows / 2), entries.length - rows + 2))
      const lines = [bold('Gallery') + dim('  ↑/↓ choose · enter play · g/esc back'), '']
      for (let i = top; i < Math.min(entries.length, top + rows - 2); i++) {
        const e = entries[i]
        const label = `${String(i + 1).padStart(2)}. ${e.label}`
        lines.push(i === listCursor ? inv(label) + dim(`  ${e.blurb ?? ''}`) : `  ${label}`)
      }
      return lines
    }
    if (!renderer) return [message ? `ohmyascii: ${message}` : 'loading…']
    return renderer.frame(t, view)
  }

  function draw() {
    const now = Date.now()
    if (!paused && !showList) t += ((now - last) / 1000) * speed
    last = now
    const rows = size(a, 2).rows
    const body = frameLines(rows).map((l) => l + '\x1b[K')
    while (body.length < rows) body.push('\x1b[K')
    const e = entries[index]
    const watching = watcher ? ' · watching' : ''
    const status =
      bold(` ${e.label} `) +
      dim(` ${index + 1}/${entries.length} · ${paused ? 'paused' : `${speed}x`} · ${depth}${watching}`) +
      (message ? `  ${message}` : dim('  ←/→ scene · wasd orbit · space pause · +/- speed · c colour · g gallery · q quit'))
    out.write('\x1b[H' + body.join('\n') + '\n\x1b[K\n' + status + '\x1b[K')
  }

  // Keys come from the terminal itself, so `-` (piece on stdin) still gets a keyboard.
  const keys: NodeJS.ReadStream = process.stdin.isTTY ? process.stdin : (new ReadStream(openSync('/dev/tty', 'r')) as unknown as NodeJS.ReadStream)
  const restore = () => {
    out.write('\x1b[0m\x1b[?25h\x1b[?1049l')
    keys.setRawMode?.(false)
  }
  out.write('\x1b[?1049h\x1b[?25l\x1b[2J')
  keys.setRawMode?.(true)
  keys.resume()
  keys.setEncoding('utf8')

  if (!showList) await rebuild()
  else void rebuild()
  const timer = setInterval(draw, 1000 / Math.max(1, Math.min(60, a.fps ?? 30)))
  const quit = () => {
    clearInterval(timer)
    watcher?.close()
    restore()
    process.exit(0)
  }
  process.on('SIGINT', quit)
  process.on('SIGTERM', quit)
  out.on('resize', () => void rebuild())

  const ORBIT = 0.15
  keys.on('data', (key: string) => {
    if (key === 'q' || key === '\x03') return quit()
    if (showList) {
      if (key === '\x1b[A' || key === 'k') listCursor = Math.max(0, listCursor - 1)
      else if (key === '\x1b[B' || key === 'j') listCursor = Math.min(entries.length - 1, listCursor + 1)
      else if (key === '\r' || key === '\n') {
        showList = false
        go(listCursor)
      } else if (key === 'g' || key === '\x1b') showList = false
      out.write('\x1b[2J')
      return
    }
    if (key === '\x1b[C' || key === 'l' || key === 'n') go(index + 1)
    else if (key === '\x1b[D' || key === 'h' || key === 'p') go(index - 1)
    else if (key === ' ') paused = !paused
    else if (key === '+' || key === '=') speed = Math.min(8, speed * 2)
    else if (key === '-' || key === '_') speed = Math.max(0.125, speed / 2)
    else if (key === 'w') view = { ...view, userX: view.userX - ORBIT }
    else if (key === 's') view = { ...view, userX: view.userX + ORBIT }
    else if (key === 'a') view = { ...view, userY: view.userY - ORBIT }
    else if (key === 'd') view = { ...view, userY: view.userY + ORBIT }
    else if (key === '0') view = { userX: 0, userY: 0 }
    else if (key === 'c') {
      depth = DEPTHS[(DEPTHS.indexOf(depth) + 1) % DEPTHS.length]
      void rebuild()
    } else if (key === 'g') showList = true
    out.write('\x1b[2J')
  })
}

function galleryEntries(): Entry[] {
  return WORLD_PRESETS.map((p) => ({ opened: { piece: galleryPiece(p.key)!, origin: 'gallery' as const }, label: p.label, blurb: p.blurb }))
}

export async function main(argv = process.argv.slice(2)) {
  const a = parseArgs(argv)
  const tty = process.stdout.isTTY
  switch (a.cmd) {
    case 'help':
      return void process.stdout.write(HELP)
    case 'guide':
      return void process.stdout.write(GUIDE)
    case 'list':
      return list()
    case 'export':
      return void process.stdout.write(serializePiece(open(a.target).piece) + '\n')
    case 'render':
      return render(a)
    case 'bake':
      return bake(a)
    case 'play': {
      if (!tty) return render(a)
      const gallery = galleryEntries()
      const idx = WORLD_PRESETS.findIndex((p) => p.key === a.target)
      if (idx >= 0) return play(a, gallery, idx, false)
      const opened = open(a.target)
      return play(a, [{ opened, label: opened.piece.name ?? a.target ?? 'piece' }], 0, false)
    }
    default:
      if (!tty) return list()
      return play(a, galleryEntries(), 0, true)
  }
}

// Read a piece from stdin before the player takes over the terminal.
if (process.argv.includes('-') && !process.stdin.isTTY) {
  const json = readFileSync(0, 'utf8')
  main(process.argv.slice(2).map((x) => (x === '-' ? json : x))).catch((e) => fail((e as Error).message))
} else main().catch((e) => fail((e as Error).message))
