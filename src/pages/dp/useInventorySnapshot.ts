import { useQuery } from '@tanstack/react-query'
import { ApiError } from '../../api/client'
import { getSnapshot, getSnapshotFile, type SnapshotView } from '../../api/intransit'
import { inventoryFromSheet35, type InventoryLine } from '../../lib/sheet35'
import { getCached, putCached } from '../../lib/snapshotCache'

/*
 * Inventory Calculation's data (user, 2026-10-26): the Daily Snapshot's manifest from the server, then Sheet35(2) from
 * this browser's cache when its ETag still matches (no download at all), else from the server (If-None-Match), worked
 * out into rows in a Web Worker. The server unreachable: the last manifest seen here, if its file is cached.
 */

const SHEET = 'Sheet35(2)'
const LAST_MANIFEST = 'intransit:lastSnapshot'

export type SnapshotManifest = SnapshotView & { offline?: boolean }

const remember = (m: SnapshotView): void => {
  try { localStorage.setItem(LAST_MANIFEST, JSON.stringify(m)) } catch { /* no storage: fine */ }
}
const recall = (): SnapshotView | null => {
  try { return JSON.parse(localStorage.getItem(LAST_MANIFEST) ?? 'null') as SnapshotView | null } catch { return null }
}

const unreachable = (err: unknown): boolean => err instanceof ApiError && (err.status === 0 || err.status >= 502)

async function manifest(day: string | undefined, signal: AbortSignal): Promise<SnapshotManifest> {
  try {
    const m = await getSnapshot(day, signal)
    if (m.shown) remember(m)
    return m
  } catch (err) {
    const last = recall()
    const key = last?.files.find((f) => f.name === SHEET)?.key
    if (unreachable(err) && last && key && (await getCached(key))) return { ...last, offline: true }
    throw err
  }
}

let worker: Worker | null = null
let seq = 0

/** Sheet35(2) -> rows, in a Web Worker (on the page's thread where there is none, e.g. tests). */
function compute(text: string): Promise<{ lines: InventoryLine[]; hidden: number }> {
  if (typeof Worker === 'undefined') return Promise.resolve(inventoryFromSheet35(text))
  worker ??= new Worker(new URL('../../lib/sheet35.worker.ts', import.meta.url), { type: 'module' })
  const w = worker
  const id = ++seq
  return new Promise((resolve, reject) => {
    const onMessage = (e: MessageEvent<{ id: number; lines?: InventoryLine[]; hidden?: number; error?: string }>) => {
      if (e.data.id !== id) return
      w.removeEventListener('message', onMessage)
      if (e.data.error) reject(new Error(e.data.error))
      else resolve({ lines: e.data.lines ?? [], hidden: e.data.hidden ?? 0 })
    }
    w.addEventListener('message', onMessage)
    w.postMessage({ id, text })
  })
}

/** The file's text: the browser's copy when current, else downloaded (and kept). */
export async function snapshotText(key: string, etag: string, signal?: AbortSignal, offline = false): Promise<string> {
  const cached = await getCached(key)
  if (cached && (cached.etag === etag || offline)) return cached.text
  const r = await getSnapshotFile(key, cached?.etag ?? null, signal)
  if (r === 'not-modified') return (cached as { text: string }).text
  await putCached(key, r.etag || etag, r.text)
  return r.text
}

export function useInventorySnapshot(day?: string) {
  const m = useQuery({ queryKey: ['intransit', 'snapshot', day ?? 'today'], queryFn: ({ signal }) => manifest(day, signal), retry: 1 })
  const sheet = m.data?.files.find((f) => f.name === SHEET)
  const rows = useQuery({
    queryKey: ['intransit', 'snapshot-rows', sheet?.key, sheet?.etag],
    enabled: !!sheet,
    // a build's file never changes: worked out once per visit
    staleTime: Infinity,
    gcTime: 30 * 60_000,
    queryFn: async ({ signal }) => compute(await snapshotText(sheet!.key, sheet!.etag, signal, !!m.data?.offline)),
  })
  return { manifest: m, rows }
}
