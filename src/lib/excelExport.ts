/*
 * Excel downloads made in the browser with SheetJS (the same xlsx 0.20.3 the file viewer uses, loaded only when needed).
 * Every cell is written as given: codes stay text (a SKU like 0012345 or a long number keeps every digit).
 */

export interface ExcelSheet {
  name: string
  header: string[]
  rows: (string | number)[][]
  /** A dropdown on a column (Excel data validation): the person picks one of `values` instead of typing it. */
  lists?: { col: number; values: string[]; prompt?: string }[]
}

const xmlText = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
/** Sheet XML parts that Excel wants AFTER dataValidations: the dropdowns go before the first one found. */
const AFTER_VALIDATIONS = ['<hyperlinks', '<printOptions', '<pageMargins', '<pageSetup', '<headerFooter', '<rowBreaks', '<colBreaks', '<ignoredErrors', '<drawing', '<legacyDrawing', '<tableParts', '<extLst', '</worksheet>']

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
  const name = `${fileName.replace(/[\\/:*?"<>|]+/g, ' ').trim()}.xlsx`
  if (!sheets.some((s) => s.lists?.length)) { XLSX.writeFile(book, name); return }

  // Dropdowns (2026-11-02): SheetJS does not write data validation, so it goes into the sheet XML of the finished file
  // (an .xlsx is a zip, read and written with SheetJS's own CFB).
  const zip = XLSX.CFB.read(new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer), { type: 'array' })
  XLSX.CFB.utils.cfb_del(zip, '\u0001Sh33tJ5') // SheetJS's own marker entry, added on read: not part of the workbook
  sheets.forEach((s, n) => {
    if (!s.lists?.length) return
    const i = zip.FullPaths.findIndex((p: string) => p.endsWith(`xl/worksheets/sheet${n + 1}.xml`))
    if (i < 0) return
    const last = Math.max(2, s.rows.length + 1)
    const rules = s.lists.map((l) => {
      const col = XLSX.utils.encode_col(l.col)
      const prompt = l.prompt ? ` showInputMessage="1" prompt="${xmlText(l.prompt.slice(0, 255))}"` : ''
      return `<dataValidation type="list" allowBlank="1" showErrorMessage="1"${prompt} sqref="${col}2:${col}${last}"><formula1>"${xmlText(l.values.join(','))}"</formula1></dataValidation>`
    })
    let xml = new TextDecoder().decode(zip.FileIndex[i].content as Uint8Array)
    const at = Math.min(...AFTER_VALIDATIONS.map((t) => xml.indexOf(t)).filter((x) => x >= 0))
    xml = `${xml.slice(0, at)}<dataValidations count="${rules.length}">${rules.join('')}</dataValidations>${xml.slice(at)}`
    zip.FileIndex[i].content = new TextEncoder().encode(xml)
  })
  const bytes = XLSX.CFB.write(zip, { fileType: 'zip', type: 'array' }) as number[]
  const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }))
  const a = Object.assign(document.createElement('a'), { href: url, download: name })
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
