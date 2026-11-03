/*
 * Inventory Calculation's rows from a build's Sheet35(2).csv (user, 2026-10-26: the Daily Snapshot in S3, read and
 * worked out in the browser). Sheet35(2) is the report's stock at component level (after the combo split): one row per
 * Split2 SKU x location x channel x stock type, with Final Units.
 *   - rows marked Consider? = No are left out (user);
 *   - rows of SKUs not in the Sheet35 master stay, flagged "not in master" (user);
 *   - SOH and in-transit side by side per SKU x channel x channel type x location; a line with neither is left out.
 */

export interface InventoryLine {
  sku: string
  name: string
  channel: string
  type: string
  location: string
  soh: number
  inTransit: number
  available: number
  /** The SKU is not in the Sheet35 master (Found in Sheet35 Master = No). */
  notInMaster: boolean
  key: string
}

/** RFC 4180 CSV (quoted fields, "" escapes, CRLF or LF; a leading BOM dropped) into rows of fields. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  let i = text.charCodeAt(0) === 0xfeff ? 1 : 0
  for (; i < text.length; i++) {
    const c = text[i]
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i++ } else quoted = false
      } else field += c
    } else if (c === '"') quoted = true
    else if (c === ',') { row.push(field); field = '' }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++
      row.push(field); field = ''
      rows.push(row); row = []
    } else field += c
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row) }
  return rows
}

const COLS = {
  sku: 'Split2 SKU', name: 'SKU Name', channel: 'Channel Name', type: 'Channel type', location: 'Final Location',
  stock: 'Stock Type', units: 'Final Units', consider: 'Consider?', found: 'Found in Sheet35 Master',
} as const

/** The lines of Inventory Calculation from Sheet35(2).csv's text. Throws when a needed column is missing. */
export function inventoryFromSheet35(text: string): { lines: InventoryLine[]; hidden: number } {
  const [header = [], ...body] = parseCsv(text)
  const at = Object.fromEntries(Object.entries(COLS).map(([k, c]) => [k, header.indexOf(c)])) as Record<keyof typeof COLS, number>
  const missing = (['sku', 'channel', 'type', 'location', 'stock', 'units'] as const).filter((k) => at[k] < 0).map((k) => COLS[k])
  if (missing.length) throw new Error(`Sheet35(2) has no ${missing.join(', ')} column`)
  const cell = (r: string[], k: keyof typeof COLS): string => (at[k] < 0 ? '' : (r[at[k]] ?? '').trim())
  const by = new Map<string, InventoryLine>()
  let hidden = 0
  for (const r of body) {
    if (r.length === 1 && r[0] === '') continue
    if (cell(r, 'consider').toLowerCase() === 'no') { hidden++; continue }
    const sku = cell(r, 'sku')
    const channel = cell(r, 'channel')
    const type = cell(r, 'type')
    const location = cell(r, 'location')
    const key = `${sku}\u0001${channel}\u0001${type}\u0001${location}`
    let line = by.get(key)
    if (!line) {
      line = { sku, name: cell(r, 'name'), channel, type, location, soh: 0, inTransit: 0, available: 0, notInMaster: false, key }
      by.set(key, line)
    }
    if (!line.name) line.name = cell(r, 'name')
    if (cell(r, 'found').toLowerCase() === 'no') line.notInMaster = true
    const units = Number(cell(r, 'units')) || 0
    if (cell(r, 'stock') === 'Intransit') line.inTransit += units
    else line.soh += units
  }
  const lines: InventoryLine[] = []
  for (const l of by.values()) {
    if (l.soh === 0 && l.inTransit === 0) continue
    l.soh = Math.round(l.soh * 1000) / 1000
    l.inTransit = Math.round(l.inTransit * 1000) / 1000
    l.available = l.soh + l.inTransit
    lines.push(l)
  }
  return { lines, hidden }
}
