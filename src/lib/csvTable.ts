import { getCsvTable, isPreview, previewCsvPage, csvTableUrl, type CsvPage, type CsvTarget } from '../api/intransit'
import { pageOf, parseTable, type Table } from './csvTableCore'
import { getCached, putCached, type FileInfo } from './snapshotCache'

/*
 * The table viewer's tables, worked out in this browser (user, 2026-10-27: "cache everything needed on the user's
 * side"; the server kept the last three tables in its memory, ~450 MB). A file is read whole once (gzip on the wire),
 * kept in IndexedDB by its ETag (snapshotCache), parsed in a Web Worker, which also pages and searches it: the page's
 * thread only ever holds one page of rows. A later visit asks the server only whether the file changed (304).
 */

// ---- the worker ----------------------------------------------------------------------------------------------------

type Reply = { id: number; error?: string; columns?: string[]; totalRows?: number; rows?: string[][]; total?: number }

let worker: Worker | null = null
let seq = 0
/** Without a Worker (tests): the same work on this thread. */
const local = new Map<string, Table>()

function ask(msg: { op: 'load'; key: string; text: string } | { op: 'page'; key: string; offset: number; limit: number; q: string }): Promise<Reply> {
  if (typeof Worker === 'undefined') {
    if (msg.op === 'load') {
      const t = parseTable(msg.text)
      local.set(msg.key, t)
      return Promise.resolve({ id: 0, columns: t.header, totalRows: t.body.length })
    }
    const t = local.get(msg.key)
    return Promise.resolve(t ? { id: 0, ...pageOf(t, msg.offset, msg.limit, msg.q) } : { id: 0, error: 'not-loaded' })
  }
  worker ??= new Worker(new URL('./csvTable.worker.ts', import.meta.url), { type: 'module' })
  const w = worker
  const id = ++seq
  return new Promise((resolve) => {
    const onMessage = (e: MessageEvent<Reply>) => {
      if (e.data.id !== id) return
      w.removeEventListener('message', onMessage)
      resolve(e.data)
    }
    w.addEventListener('message', onMessage)
    w.postMessage({ id, ...msg })
  })
}

// ---- loading -------------------------------------------------------------------------------------------------------

/** A file is asked about again (If-None-Match) after this long; in between its loaded table is used as it is. */
const RECHECK_MS = 60_000

interface Loaded { tableKey: string; name: string; info: FileInfo; columns: string[]; totalRows: number; at: number }
const loaded = new Map<string, Promise<Loaded>>()

async function load(t: CsvTarget, signal?: AbortSignal): Promise<Loaded> {
  const url = csvTableUrl(t)
  const cached = await getCached(url)
  const r = await getCsvTable(t, cached?.etag ?? null, signal)
  let etag: string
  let text: string
  let info: FileInfo
  if (r === 'not-modified' && cached) {
    etag = cached.etag
    text = cached.text
    info = cached.info ?? { size: cached.text.length, modified: new Date().toISOString() }
  } else if (r === 'not-modified') {
    throw new Error('The server said the file is unchanged, but this browser has no copy of it')
  } else {
    ;({ etag, text } = r)
    info = { size: r.size, modified: r.modified }
    await putCached(url, etag, text, info)
  }
  // the worker keeps the parsed table per file version
  const tableKey = `${url}|${etag}`
  const reply = await ask({ op: 'load', key: tableKey, text })
  if (reply.error) throw new Error(reply.error)
  return { tableKey, name: t.name, info, columns: reply.columns ?? [], totalRows: reply.totalRows ?? 0, at: Date.now() }
}

function loadOnce(t: CsvTarget, signal?: AbortSignal): Promise<Loaded> {
  const url = csvTableUrl(t)
  const hit = loaded.get(url)
  if (hit) {
    return hit.then((l) => (Date.now() - l.at < RECHECK_MS ? l : reload(t, signal)), () => reload(t, signal))
  }
  return reload(t, signal)
}

function reload(t: CsvTarget, signal?: AbortSignal): Promise<Loaded> {
  const url = csvTableUrl(t)
  const p = load(t, signal)
  loaded.set(url, p)
  p.catch(() => loaded.delete(url))
  return p
}

/** A page of the viewer's table: from this browser's copy of the whole file. */
export async function tablePage(t: CsvTarget, page: { offset: number; limit: number; q: string }, signal?: AbortSignal): Promise<CsvPage> {
  if (isPreview()) return previewCsvPage(t, page)
  let l = await loadOnce(t, signal)
  let reply = await ask({ op: 'page', key: l.tableKey, ...page })
  if (reply.error === 'not-loaded') {
    // the worker let it go (it keeps a few tables): load it again
    l = await reload(t, signal)
    reply = await ask({ op: 'page', key: l.tableKey, ...page })
  }
  if (reply.error) throw new Error(reply.error)
  return {
    name: l.name, size: l.info.size, modified: l.info.modified, columns: l.columns,
    rows: reply.rows ?? [], total: reply.total ?? 0, totalRows: l.totalRows, offset: page.offset, limit: page.limit,
  }
}
