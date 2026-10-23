/*
 * Excel downloads made in the browser with SheetJS (the same xlsx 0.20.3 the file viewer uses, loaded only when needed).
 * Every cell is written as given: codes stay text (a SKU like 0012345 or a long number keeps every digit).
 */

export interface ExcelSheet {
  name: string
  header: string[]
  rows: (string | number)[][]
}

/** Excel sheet names: at most 31 characters, none of : \ / ? * [ ], unique in the file. */
const sheetName = (name: string, used: Set<string>) => {
  const base = (name.replace(/[:\\/?*[\]]/g, ' ').trim() || 'Sheet').slice(0, 31)
  let out = base
  for (let n = 2; used.has(out.toLowerCase()); n++) out = `${base.slice(0, 31 - String(n).length - 1)} ${n}`
  used.add(out.toLowerCase())
  return out
}

export const downloadExcel = async (fileName: string, sheets: ExcelSheet[]) => {
  const XLSX = await import('xlsx')
  const book = XLSX.utils.book_new()
  const used = new Set<string>()
  for (const s of sheets) {
    const ws = XLSX.utils.aoa_to_sheet([s.header, ...s.rows])
    // Column widths from the longest value, so the file opens readable.
    ws['!cols'] = s.header.map((h, i) => ({ wch: Math.min(60, Math.max(h.length, ...s.rows.map((r) => String(r[i] ?? '').length)) + 2) }))
    XLSX.utils.book_append_sheet(book, ws, sheetName(s.name, used))
  }
  XLSX.writeFile(book, `${fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.xlsx`)
}
