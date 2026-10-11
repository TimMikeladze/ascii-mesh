import { readFile } from 'node:fs/promises'
import { resolve } from 'node:path'

// Node stand-ins for the few DOM APIs the browser loaders use (source.ts / model.ts):
// document.createElement('canvas'), Image, document.fonts and getComputedStyle, backed by
// @napi-rs/canvas. With these installed, image / text / preset sources and text / image world
// objects build in Node exactly as they do in the studio. Node-only: never import from the app.

let installed: Promise<void> | null = null

/** Installs the shims once (relative image paths resolve against the cwd). Idempotent. */
export function installNodeCanvas(): Promise<void> {
  return (installed ??= install())
}

async function install() {
  if (typeof window !== 'undefined') return
  const napi = await import('@napi-rs/canvas')
  const g = globalThis as Record<string, unknown>
  const srcSetter = Object.getOwnPropertyDescriptor(napi.Image.prototype, 'src')?.set

  class NodeImage extends napi.Image {
    crossOrigin: string | null = null
    decoding = 'auto'
  }
  // Accepts data: URLs, http(s) URLs and file paths; the native setter wants bytes.
  Object.defineProperty(NodeImage.prototype, 'src', {
    set(this: InstanceType<typeof napi.Image>, value: string) {
      readSource(value).then(
        (buf) => srcSetter!.call(this, buf),
        (e) => (this.onerror as ((e: unknown) => void) | null)?.(e),
      )
    },
  })

  if (!g.document)
    g.document = {
      createElement: (tag: string) => {
        if (tag !== 'canvas') throw new Error(`node-canvas: <${tag}> is not supported`)
        return napi.createCanvas(300, 150)
      },
      fonts: { load: async () => [] },
      documentElement: {},
    }
  g.Image ??= NodeImage
  g.getComputedStyle ??= () => ({ getPropertyValue: () => '' })
}

async function readSource(src: string): Promise<Buffer> {
  if (src.startsWith('data:')) {
    const comma = src.indexOf(',')
    const meta = src.slice(5, comma)
    const body = src.slice(comma + 1)
    return meta.endsWith(';base64') ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body))
  }
  if (/^https?:\/\//.test(src)) {
    const res = await fetch(src)
    if (!res.ok) throw new Error(`Could not load image (${res.status})`)
    return Buffer.from(await res.arrayBuffer())
  }
  if (src.startsWith('blob:')) throw new Error('blob: images only exist in the browser session that made them')
  return readFile(resolve(src.replace(/^file:\/\//, '')))
}
