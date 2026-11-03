import { pageOf, parseTable, type Table } from './csvTableCore'

/* The table viewer's tables, parsed, paged and searched off the page's thread (the big ones are tens of MB). */

/** Tables kept here, most recent last. */
const KEEP = 3
const tables = new Map<string, Table>()

type Msg = { id: number } & ({ op: 'load'; key: string; text: string } | { op: 'page'; key: string; offset: number; limit: number; q: string })

self.onmessage = (e: MessageEvent<Msg>) => {
  const m = e.data
  try {
    if (m.op === 'load') {
      const t = tables.get(m.key) ?? parseTable(m.text)
      tables.delete(m.key)
      tables.set(m.key, t)
      while (tables.size > KEEP) tables.delete(tables.keys().next().value as string)
      self.postMessage({ id: m.id, columns: t.header, totalRows: t.body.length })
      return
    }
    const t = tables.get(m.key)
    if (!t) {
      self.postMessage({ id: m.id, error: 'not-loaded' })
      return
    }
    self.postMessage({ id: m.id, ...pageOf(t, m.offset, m.limit, m.q) })
  } catch (err) {
    self.postMessage({ id: m.id, error: err instanceof Error ? err.message : String(err) })
  }
}
