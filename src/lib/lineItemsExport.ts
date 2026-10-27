/*
 * Line items download (2026-10-26): the rows of POST /po-review/line-items saved as CSV or Excel, same columns in both.
 * CSV: UTF-8 with a BOM (Excel then shows ₹ / Hindi names right), CRLF. Excel: codes kept as text, numbers as numbers.
 */
import type { LineItemRow } from '../api/poReview'
import { downloadExcel } from './excelExport'
import { LINE_ITEMS } from '../constants/poReview'
import { istDateTime } from './time'

const COLS: [string, (r: LineItemRow) => string | number | null | undefined][] = [
  ['PO Number', (r) => r.poNumber], ['PO Date', (r) => r.poDate], ['Channel', (r) => r.channel], ['Location', (r) => r.location],
  ['Facility', (r) => r.facility], ['Sale Order', (r) => r.saleOrderCode], ['Processed At', (r) => (r.processedAt ? istDateTime(r.processedAt) : '')],
  ['Sr No', (r) => r.srNo], ['Line No', (r) => r.lineNo], ['PEP SKU Code', (r) => r.pepSkuCode], ['Channel SKU Code', (r) => r.channelSkuCode],
  ['EAN', (r) => r.ean], ['SKU Name', (r) => r.skuName], ['Description (PO)', (r) => r.description], ['Brand', (r) => r.brand], ['HSN', (r) => r.hsn],
  ['Qty', (r) => r.qty], ['Free Qty', (r) => r.freeQty], ['Channel MRP', (r) => r.channelMrp], ['Our MRP', (r) => r.ourMrp], ['Our Rate', (r) => r.ourRate],
  ['Landing Rate', (r) => r.landingRate], ['Unit Cost', (r) => r.unitCost], ['GST %', (r) => r.gstPercent], ['Line Total', (r) => r.lineTotal],
  ['Margin', (r) => r.margin], ['GMV', (r) => r.gmv], ['PO Value', (r) => r.poValue], ['Is Verified', (r) => (r.isVerified ? 'True' : 'False')],
]

/** Columns that are codes: always text in Excel, so no digit or leading zero is lost. */
const TEXT_COLS = new Set(['PO Number', 'Sale Order', 'Sr No', 'Line No', 'PEP SKU Code', 'Channel SKU Code', 'EAN', 'HSN'])

const header = COLS.map((c) => c[0])
const cells = (r: LineItemRow) => COLS.map(([name, get]) => {
  const v = get(r)
  if (v === null || v === undefined) return ''
  return TEXT_COLS.has(name) ? String(v) : v
})

const stamp = () => new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')

export function downloadLineItemsCsv(rows: LineItemRow[]) {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = `﻿${[header, ...rows.map(cells)].map((r) => r.map(esc).join(',')).join('\r\n')}\r\n`
  const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }))
  const a = document.createElement('a')
  a.href = url
  a.download = `${LINE_ITEMS.FILE}_${stamp()}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

export const downloadLineItemsExcel = (rows: LineItemRow[]) =>
  downloadExcel(`${LINE_ITEMS.FILE}_${stamp()}`, [{ name: LINE_ITEMS.SHEET, header, rows: rows.map(cells) }])
