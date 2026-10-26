/*
 * The browser's copy of the Daily Snapshot CSVs (user, 2026-10-26: "cache it so future visits take no time"). IndexedDB
 * database intransit-snapshots: `files` holds each CSV's text by its S3 key with its ETag; `meta` its size and last use.
 * An S3 key never changes content (one folder per build), so a cached file is used as it is; the ETag only confirms.
 * Kept: the last MAX_FILES files and at most MAX_BYTES, least recently used dropped first. Anything failing here
 * (private window, storage full) just means no cache.
 */

const DB = 'intransit-snapshots'
const FILES = 'files'
const META = 'meta'
/** 6 snapshots of 3 files. */
const MAX_FILES = 18
const MAX_BYTES = 400 * 1024 * 1024

interface FileRow { key: string; etag: string; text: string }
interface MetaRow { key: string; size: number; usedAt: number }

let opening: Promise<IDBDatabase | null> | null = null

const open = (): Promise<IDBDatabase | null> => (opening ??= new Promise((resolve) => {
  try {
    const req = indexedDB.open(DB, 1)
    req.onupgradeneeded = () => {
      const db = req.result
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES, { keyPath: 'key' })
      if (!db.objectStoreNames.contains(META)) db.createObjectStore(META, { keyPath: 'key' })
    }
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => resolve(null)
    req.onblocked = () => resolve(null)
  } catch {
    resolve(null)
  }
}))

const done = (tx: IDBTransaction): Promise<void> => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve()
  tx.onerror = () => reject(tx.error)
  tx.onabort = () => reject(tx.error)
})

const request = <T>(req: IDBRequest<T>): Promise<T> => new Promise((resolve, reject) => {
  req.onsuccess = () => resolve(req.result)
  req.onerror = () => reject(req.error)
})

/** The cached text of an S3 key, or null. Marks it as just used. */
export async function getCached(key: string): Promise<{ etag: string; text: string } | null> {
  const db = await open()
  if (!db) return null
  try {
    const row = await request(db.transaction(FILES).objectStore(FILES).get(key)) as FileRow | undefined
    if (!row) return null
    const tx = db.transaction(META, 'readwrite')
    tx.objectStore(META).put({ key, size: row.text.length * 2, usedAt: Date.now() } satisfies MetaRow)
    await done(tx).catch(() => undefined)
    return { etag: row.etag, text: row.text }
  } catch {
    return null
  }
}

/** Keep a file's text, then drop the least recently used past the limits. */
export async function putCached(key: string, etag: string, text: string): Promise<void> {
  const db = await open()
  if (!db) return
  try {
    const tx = db.transaction([FILES, META], 'readwrite')
    tx.objectStore(FILES).put({ key, etag, text } satisfies FileRow)
    tx.objectStore(META).put({ key, size: text.length * 2, usedAt: Date.now() } satisfies MetaRow)
    await done(tx)
    await evict(db)
  } catch {
    /* no room: simply not cached */
  }
}

async function evict(db: IDBDatabase): Promise<void> {
  const metas = (await request(db.transaction(META).objectStore(META).getAll())) as MetaRow[]
  metas.sort((a, b) => b.usedAt - a.usedAt)
  let bytes = 0
  const drop: string[] = []
  metas.forEach((m, i) => {
    bytes += m.size
    if (i >= MAX_FILES || bytes > MAX_BYTES) drop.push(m.key)
  })
  if (!drop.length) return
  const tx = db.transaction([FILES, META], 'readwrite')
  for (const k of drop) {
    tx.objectStore(FILES).delete(k)
    tx.objectStore(META).delete(k)
  }
  await done(tx)
}

/** The keys cached now (tests, and the page's "cached" hint). */
export async function cachedKeys(): Promise<string[]> {
  const db = await open()
  if (!db) return []
  return ((await request(db.transaction(META).objectStore(META).getAllKeys())) as IDBValidKey[]).map(String)
}

/** Tests: forget the open database (fake-indexeddb is reset between tests). */
export function resetCacheForTests(): void {
  opening = null
}
