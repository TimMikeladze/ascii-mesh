'use client'

import { FolderOpen, Plus, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { StudioFolder } from './folder'

const BUTTON =
  'flex h-8 items-center justify-center gap-1.5 border border-border px-2 text-[11px] tracking-widest uppercase transition-colors hover:border-foreground hover:bg-foreground hover:text-background focus-visible:outline focus-visible:outline-1 focus-visible:outline-dashed focus-visible:outline-offset-2 disabled:pointer-events-none disabled:opacity-50'

interface FolderPanelProps {
  folder: StudioFolder
  active: string | null
  onOpen: (path: string) => void
  onNew: () => void
}

export function FolderPanel({ folder, active, onOpen, onNew }: FolderPanelProps) {
  if (!folder.root) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-xs leading-relaxed text-muted-foreground">
          Hold a folder on disk. <code>*.ascii.json</code> pieces in it render here live as an agent (or you) edits them; studio edits save back, and the rendered frame is written next to each piece as <code>.frame.txt</code>.
        </p>
        {folder.pending ? (
          <button type="button" className={BUTTON} onClick={folder.reconnect}>
            <FolderOpen aria-hidden className="size-3.5" /> Reconnect {folder.pending}
          </button>
        ) : null}
        <button type="button" className={BUTTON} onClick={folder.connect}>
          <FolderOpen aria-hidden className="size-3.5" /> Open folder
        </button>
        {folder.error && <p role="alert" className="text-xs text-destructive">{folder.error}</p>}
      </div>
    )
  }
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-2 text-xs">
        <span className="truncate" title={folder.root}>
          <span className="text-muted-foreground">holding </span>
          {folder.root}/
        </span>
        <button type="button" aria-label="Close folder" title="Close folder" className="text-muted-foreground hover:text-foreground" onClick={folder.disconnect}>
          <X aria-hidden className="size-3.5" />
        </button>
      </div>
      {folder.pieces.length ? (
        <ul aria-label="Pieces" className="flex max-h-56 flex-col overflow-y-auto border border-dashed border-border">
          {folder.pieces.map((path) => (
            <li key={path}>
              <button
                type="button"
                aria-current={path === active ? 'true' : undefined}
                onClick={() => onOpen(path)}
                className={cn(
                  'flex w-full items-center gap-2 px-2.5 py-1.5 text-left text-xs transition-colors',
                  path === active ? 'bg-foreground text-background' : 'text-muted-foreground hover:bg-accent/40 hover:text-foreground',
                )}
              >
                <span className="truncate">{path}</span>
                {path === active && <span className="ml-auto shrink-0 text-[10px] tracking-widest uppercase">live</span>}
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-muted-foreground">No <code>*.ascii.json</code> pieces yet. Save the current one, or ask your agent to write one.</p>
      )}
      <button type="button" className={BUTTON} onClick={onNew}>
        <Plus aria-hidden className="size-3.5" /> Save as new piece
      </button>
      {folder.error && <p role="alert" className="text-xs text-destructive">{folder.error}</p>}
    </div>
  )
}
