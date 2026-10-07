import type { FontKey } from '@/lib/ascii/config'

export type SourceState =
  | { kind: 'preset'; key: string }
  /** `path`: folder-relative file it came from, when loaded from (or saved to) the held folder. */
  | { kind: 'upload'; url: string; name: string; path?: string }
  | { kind: 'text'; text: string; fontKey: FontKey; weight: number }
  /** The studio's modelled scene (held separately so it shares undo history with the config). */
  | { kind: 'scene' }

export type SceneTool = 'orbit' | 'select' | 'paint' | 'sculpt-add' | 'sculpt-carve'

export interface BrushSettings {
  radius: number
  color: string
}
