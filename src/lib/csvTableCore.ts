import { parseCsv } from './sheet35'

/* The table viewer's parsing and paging (csvTable.ts), without the page's modules: the Web Worker runs it too. */

/** A parsed table: the header and the data rows (blank lines skipped, as the server reads them). */
export interface Table { header: string[]; body: string[][]; lower?: string[] }

export function parseTable(text: string): Table {
  const [header = [], ...rows] = parseCsv(text)
  return { header, body: rows.filter((r) => !(r.length === 1 && r[0].trim() === '')) }
}

/** One page of the rows, after a search over every column (case-insensitive). */
export function pageOf(t: Table, offset: number, limit: number, q: string): { rows: string[][]; total: number } {
  const s = q.trim().toLowerCase()
  let rows = t.body
  if (s) {
    // one lower-cased line per row, made on the first search of this table
    t.lower ??= t.body.map((r) => r.join('\u0001').toLowerCase())
    const lower = t.lower
    rows = t.body.filter((_, i) => lower[i].includes(s))
  }
  return { rows: rows.slice(offset, offset + limit), total: rows.length }
}
