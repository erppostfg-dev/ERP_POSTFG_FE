/*
 * Bulk Orders v2 piece 2 (2026-11-24): several receivers per Marketing / Head office order. Pure helpers for the order
 * form: read an uploaded receivers file (Excel / CSV: one row per receiver + SKU), the template, the error file. The
 * server checks the rows (POST /bulk-orders/receivers/check) and decides; nothing here is saved.
 */
import type { BulkReceiverRow } from '../api/bulkOrders'

/** Column names people may use (spaces, case, punctuation ignored) -> the field. */
const HEADERS: Record<string, keyof Omit<BulkReceiverRow, 'row'>> = {
  receivername: 'receiverName', name: 'receiverName', receiver: 'receiverName',
  receivernumber: 'receiverPhone', receiverphone: 'receiverPhone', number: 'receiverPhone', phone: 'receiverPhone', mobile: 'receiverPhone', phonenumber: 'receiverPhone', contact: 'receiverPhone',
  address: 'line', addressline: 'line', line: 'line', address1: 'line',
  city: 'city', state: 'state',
  pincode: 'pincode', pin: 'pincode', pinno: 'pincode', zip: 'pincode', postalcode: 'pincode',
  skucode: 'pepCode', sku: 'pepCode', pepcode: 'pepCode', code: 'pepCode',
  qty: 'qty', quantity: 'qty', units: 'qty',
}
const NEEDED: (keyof Omit<BulkReceiverRow, 'row'>)[] = ['receiverName', 'receiverPhone', 'line', 'city', 'state', 'pincode', 'pepCode', 'qty']
/** A sheet cell as text (numbers / booleans written out; anything else = ''). */
const cellText = (v: unknown): string => (typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : '')
const key = (h: unknown) => cellText(h).toLowerCase().replace(/[^a-z0-9]/g, '')

/** The template's columns (row 1 of the file), in order. */
export const RECEIVER_TEMPLATE_COLUMNS = ['Receiver name', 'Receiver number', 'Address', 'City', 'State', 'Pincode', 'SKU code', 'Qty'] as const

const csvCell = (v: unknown): string => {
  const s = cellText(v)
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}
export const toCsv = (rows: unknown[][]): string => rows.map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n'

/** The template file: the columns + one example row. */
export const receiverTemplateCsv = (): string =>
  toCsv([[...RECEIVER_TEMPLATE_COLUMNS], ['Ravi Kumar', '9876543210', '12, MG Road, Andheri East', 'Mumbai', 'Maharashtra', '400069', 'MCAF123', 2]])

/**
 * The rows of a sheet (a grid as read from the file: row 1 = column names, any order). `row` = the row number in the
 * file (header = 1). Empty rows are skipped. `missing` = needed columns not found (nothing is read then).
 */
export const rowsFromGrid = (grid: unknown[][]): { rows: BulkReceiverRow[]; missing: string[] } => {
  const head = grid.findIndex((r) => r.some((c) => cellText(c).trim() !== ''))
  if (head < 0) return { rows: [], missing: [...RECEIVER_TEMPLATE_COLUMNS] }
  const cols = new Map<keyof Omit<BulkReceiverRow, 'row'>, number>()
  grid[head].forEach((h, i) => {
    const f = HEADERS[key(h)]
    if (f && !cols.has(f)) cols.set(f, i)
  })
  const missing = NEEDED.filter((f) => !cols.has(f)).map((f) => RECEIVER_TEMPLATE_COLUMNS[NEEDED.indexOf(f)])
  if (missing.length) return { rows: [], missing }
  const rows: BulkReceiverRow[] = []
  for (let i = head + 1; i < grid.length; i += 1) {
    const r = grid[i]
    if (!r.some((c) => cellText(c).trim() !== '')) continue
    const cell = (f: keyof Omit<BulkReceiverRow, 'row'>) => r[cols.get(f)!]
    const text = (f: keyof Omit<BulkReceiverRow, 'row'>) => cellText(cell(f)).trim()
    const q = cell('qty')
    rows.push({
      row: i + 1, receiverName: text('receiverName'), receiverPhone: text('receiverPhone'), line: text('line'), city: text('city'), state: text('state'),
      pincode: text('pincode'), pepCode: text('pepCode'), qty: typeof q === 'number' ? q : cellText(q).trim(),
    })
  }
  return { rows, missing: [] }
}

/** Reads the first sheet of an Excel / CSV file into a grid (SheetJS, loaded only when a file is picked). */
export const readGrid = async (file: File): Promise<unknown[][]> => {
  const XLSX = await import('xlsx')
  const wb = XLSX.read(new Uint8Array(await file.arrayBuffer()), { type: 'array' })
  const ws = wb.Sheets[wb.SheetNames[0]]
  return ws ? XLSX.utils.sheet_to_json<unknown[]>(ws, { header: 1, raw: true, defval: '' }) : []
}

/** The error file: each bad row with its problem (and what it had), for fixing in the sheet. */
export const receiverErrorsCsv = (errors: { row: number; field: string; message: string }[], rows: BulkReceiverRow[]): string => {
  const byRow = new Map(rows.map((r) => [r.row, r]))
  return toCsv([
    ['Row', 'Receiver name', 'SKU code', 'Qty', 'Column', 'Problem'],
    ...errors.map((e) => {
      const r = byRow.get(e.row)
      return [e.row || '', r?.receiverName ?? '', r?.pepCode ?? '', r?.qty ?? '', e.field, e.message]
    }),
  ])
}

/** A qty box of a receiver: '' / 0 = this SKU does not go to them; a whole number 1+ = it does; anything else = wrong. */
export const receiverQty = (v: string): number | null => {
  const t = v.trim()
  if (t === '') return 0
  const n = Number(t)
  return Number.isInteger(n) && n >= 0 ? n : null
}
