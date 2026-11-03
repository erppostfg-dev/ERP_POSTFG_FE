import { FILE_VIEWER } from '../constants/poReview'

/*
 * Turns a file's contents into plain tables for the in-app viewer (components/FileViewer, 2026-10-21, user: "if it's
 * in JSON show it as the CSV").
 *   Sheets: one table per sheet (SheetJS 0.20.3, loaded only when a sheet is opened), Excel-style A B C columns.
 *   JSON:   every list of records becomes its own table (columns = all keys, nested objects as "a.b" columns, a list
 *           inside a record becomes a table of its own with an "↑ row" column pointing back), and the single values
 *           go to one "Details" table (field, value). Works for processed.json, corrected.json and the API's raw JSON.
 */

export type ViewTable = {
  name: string
  columns: string[]
  rows: string[][]
  /** Sheets: show Excel-style column letters and row numbers instead of a header row. */
  sheet?: boolean
}

type Rec = Record<string, unknown>

/** Column pointing a nested table's row back to its parent row number. */
const PARENT_COL = '↑ row'

const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const isRecList = (v: unknown): v is Rec[] => Array.isArray(v) && v.length > 0 && v.every(isRec)
const text = (v: unknown): string =>
  v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)

export function jsonTables(root: unknown): ViewTable[] {
  const tables = new Map<string, { columns: string[]; rows: Rec[] }>()
  const details: string[][] = []

  const addTable = (name: string, list: Rec[], parentRow?: number) => {
    const t = tables.get(name) ?? { columns: [], rows: [] }
    tables.set(name, t)
    const addCol = (c: string) => { if (!t.columns.includes(c)) t.columns.push(c) }
    for (const rec of list) {
      const row: Rec = {}
      if (parentRow !== undefined) { addCol(PARENT_COL); row[PARENT_COL] = parentRow }
      t.rows.push(row)
      const rowNo = t.rows.length
      const flatten = (obj: Rec, prefix: string) => {
        for (const [k, v] of Object.entries(obj)) {
          const key = prefix ? `${prefix}.${k}` : k
          if (isRec(v)) { flatten(v, key); continue }
          addCol(key)
          if (isRecList(v)) {
            addTable(`${name}.${key}`, v, rowNo)
            row[key] = { rows: v.length }
          } else row[key] = Array.isArray(v) ? v.map(text).join(', ') : v
        }
      }
      flatten(rec, '')
    }
  }

  const walk = (v: unknown, path: string) => {
    if (isRecList(v)) addTable(path || 'Rows', v)
    else if (isRec(v)) for (const [k, child] of Object.entries(v)) walk(child, path ? `${path}.${k}` : k)
    else if (Array.isArray(v)) details.push([path || 'Value', v.map(text).join(', ')])
    else details.push([path || 'Value', text(v)])
  }
  walk(root, '')

  const out: ViewTable[] = [...tables].map(([name, t]) => ({
    name,
    columns: t.columns,
    rows: t.rows.map((r) => t.columns.map((c) => {
      const v = r[c]
      return isRec(v) && typeof v.rows === 'number' ? `${v.rows} →` : text(v)
    })),
  }))
  if (details.length) out.push({ name: FILE_VIEWER.DETAILS, columns: ['Field', 'Value'], rows: details })
  return out
}

/** Every sheet of a workbook (xlsx, xls, csv, ods …) as text rows, exactly as Excel shows the values. */
export async function sheetTables(bytes: ArrayBuffer): Promise<ViewTable[]> {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(new Uint8Array(bytes), { type: 'array', cellDates: true, dense: true })
  return wb.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: false, defval: '', blankrows: false })
      .map((r) => r.map(text))
    const width = Math.min(FILE_VIEWER.MAX_COLS, rows.reduce((m, r) => Math.max(m, r.length), 0))
    return {
      name,
      sheet: true,
      columns: Array.from({ length: width }, (_, i) => XLSX.utils.encode_col(i)),
      rows: rows.map((r) => Array.from({ length: width }, (_, i) => r[i] ?? '')),
    }
  })
}
