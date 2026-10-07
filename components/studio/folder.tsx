'use client'

// The folder the studio is holding: one `useFs` watching `*.ascii.json` pieces and images on
// disk, so an agent's edits show up live and studio edits save back. See docs/studio-folder.md.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createFilter, ensurePermission, getDirectoryPicker, useFs, type FilterFn } from 'use-fs'
import { PIECE_SUFFIX } from '@/lib/ascii/piece'
import { forgetHandle, handleState, recallHandle, rememberHandle } from '@/lib/fs/handles'

const IMAGE_EXT = /\.(svg|png|jpe?g|webp|gif)$/i
const SKIP_DIRS = new Set(['node_modules', '.next', 'dist', 'build', 'out', 'coverage'])

const folderFilter: FilterFn = createFilter({
  shouldProcessDirectory: ({ name, relativePath }) =>
    relativePath === '' || (!name.startsWith('.') && !SKIP_DIRS.has(name) && relativePath.split('/').length <= 4),
  shouldIncludeFile: ({ name }) => name.endsWith(PIECE_SUFFIX) || IMAGE_EXT.test(name),
})

export interface StudioFolder {
  supported: boolean
  /** Name of the held folder, or null. */
  root: string | null
  /** A remembered folder that needs a click to reuse (permission lapsed). */
  pending: string | null
  /** Watched text files, keyed relative to the folder. */
  files: Map<string, string>
  /** Piece paths, sorted. */
  pieces: string[]
  error: string | null
  connect: () => Promise<void>
  reconnect: () => Promise<void>
  disconnect: () => Promise<void>
  write: (path: string, data: string | Blob) => Promise<void>
  /** An image in the folder as a File (binary-safe; the content map is text). */
  readFile: (path: string) => Promise<File | null>
}

export function useStudioFolder(): StudioFolder {
  const filters = useMemo(() => [folderFilter], [])
  const [pending, setPending] = useState<string | null>(null)
  const [failure, setFailure] = useState<string | null>(null)
  const { files: watched, handles, directories, isBrowserSupported, error, addDirectory, onClear, writeFile } = useFs({
    filters,
    mode: 'readwrite',
    pollInterval: 500,
  })
  const root = directories[0] ?? null

  const files = useMemo(() => {
    const out = new Map<string, string>()
    if (!root) return out
    for (const [path, text] of watched) if (path.startsWith(`${root}/`)) out.set(path.slice(root.length + 1), text)
    return out
  }, [root, watched])
  const pieces = useMemo(() => [...files.keys()].filter((p) => p.endsWith(PIECE_SUFFIX)).sort(), [files])

  // Restore last folder. A ref, not state: StrictMode runs effects twice and a second
  // `addDirectory` would watch the same folder again under a ` (2)` name.
  const restored = useRef(false)
  useEffect(() => {
    if (restored.current) return
    restored.current = true
    void (async () => {
      const handle = await recallHandle()
      if (!handle) return
      if ((await handleState(handle)) === 'granted') await addDirectory(handle)
      else setPending(handle.name)
    })()
  }, [addDirectory])

  const hold = useCallback(
    async (handle: FileSystemDirectoryHandle) => {
      if (!(await ensurePermission(handle, 'readwrite'))) throw new Error('Write access was declined')
      await rememberHandle(handle)
      onClear()
      await addDirectory(handle)
      setPending(null)
    },
    [addDirectory, onClear],
  )

  const guard = useCallback(async (run: () => Promise<void>) => {
    setFailure(null)
    try {
      await run()
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return
      setFailure(cause instanceof Error ? cause.message : 'That did not work')
    }
  }, [])

  const connect = useCallback(
    () =>
      guard(async () => {
        const picker = getDirectoryPicker()
        if (!picker) throw new Error('This browser has no directory picker')
        await hold(await picker({ id: 'ascii-mesh-folder', mode: 'readwrite' }))
      }),
    [guard, hold],
  )

  const reconnect = useCallback(
    () =>
      guard(async () => {
        const handle = await recallHandle()
        if (!handle) {
          setPending(null)
          throw new Error('That folder is no longer remembered — open it again')
        }
        await hold(handle)
      }),
    [guard, hold],
  )

  const disconnect = useCallback(
    () =>
      guard(async () => {
        onClear()
        await forgetHandle()
        setPending(null)
      }),
    [guard, onClear],
  )

  const write = useCallback(
    async (path: string, data: string | Blob) => {
      if (!root) throw new Error('No folder is open')
      await writeFile(`${root}/${path}`, data)
    },
    [root, writeFile],
  )

  const readFile = useCallback(
    async (path: string) => {
      const handle = root ? handles.get(`${root}/${path}`) : undefined
      try {
        return handle ? await handle.getFile() : null
      } catch {
        return null
      }
    },
    [root, handles],
  )

  return {
    supported: isBrowserSupported,
    root,
    pending,
    files,
    pieces,
    error: failure ?? error?.message ?? null,
    connect,
    reconnect,
    disconnect,
    write,
    readFile,
  }
}
