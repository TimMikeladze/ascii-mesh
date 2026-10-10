// A folder grant that survives a reload. The handle is structured-cloneable, so IndexedDB keeps
// it; the permission is not persisted, so after a browser restart it is offered as Reconnect.
// Everything fails soft (private mode, missing IndexedDB) as "no stored handle".

type PermissionAwareHandle = FileSystemDirectoryHandle & {
  queryPermission?: (descriptor?: { mode?: 'read' | 'readwrite' }) => Promise<PermissionState>
}

const DATABASE = 'ohmyascii-fs'
const STORE = 'handles'
const KEY = 'folder'

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') return reject(new Error('No IndexedDB'))
    const req = indexedDB.open(DATABASE, 1)
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE)
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}

async function transact<T>(mode: IDBTransactionMode, run: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await open()
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE))
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => reject(req.error)
    })
  } finally {
    db.close()
  }
}

export async function rememberHandle(handle: FileSystemDirectoryHandle): Promise<void> {
  try {
    await transact('readwrite', (s) => s.put(handle, KEY))
  } catch {}
}

export async function recallHandle(): Promise<FileSystemDirectoryHandle | null> {
  try {
    return (await transact<FileSystemDirectoryHandle | undefined>('readonly', (s) => s.get(KEY))) ?? null
  } catch {
    return null
  }
}

export async function forgetHandle(): Promise<void> {
  try {
    await transact('readwrite', (s) => s.delete(KEY))
  } catch {}
}

/** `granted` = usable now; `prompt` = needs a user gesture first (usual after a restart). */
export async function handleState(handle: FileSystemDirectoryHandle): Promise<PermissionState> {
  const aware = handle as PermissionAwareHandle
  if (typeof aware.queryPermission !== 'function') return 'granted'
  try {
    return await aware.queryPermission({ mode: 'readwrite' })
  } catch {
    return 'prompt'
  }
}
