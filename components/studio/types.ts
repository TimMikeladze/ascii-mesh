import type { FontKey } from '@/lib/ascii/config'

export type SourceState =
  | { kind: 'preset'; key: string }
  | { kind: 'upload'; url: string; name: string }
  | { kind: 'text'; text: string; fontKey: FontKey; weight: number }
