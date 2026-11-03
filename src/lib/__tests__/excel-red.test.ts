import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import { addRedStyle } from '../excelExport'

/* The In Review downloads' Issues columns are bold red (2026-11-03): one font + one cell style added to SheetJS's
   styles.xml; the sheet's cells of those columns then point to it (downloadExcel). */
describe('addRedStyle', () => {
  it('adds one bold red font and one cell style using it to the workbook SheetJS writes', () => {
    const book = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([['a', 'Issues'], ['1', 'SKU not mapped']]), 'S')
    const zip = XLSX.CFB.read(new Uint8Array(XLSX.write(book, { type: 'array', bookType: 'xlsx' }) as ArrayBuffer), { type: 'array' })
    const i = zip.FullPaths.findIndex((p: string) => p.endsWith('xl/styles.xml'))
    const before = new TextDecoder().decode(zip.FileIndex[i].content as Uint8Array)
    const { xml, style } = addRedStyle(before)
    const fonts = Number(/<fonts count="(\d+)"/.exec(before)![1])
    const xfs = Number(/<cellXfs count="(\d+)"/.exec(before)![1])
    expect(style).toBe(xfs)
    expect(xml).toContain(`<fonts count="${fonts + 1}"`)
    expect(xml).toContain(`<cellXfs count="${xfs + 1}"`)
    expect(xml).toContain('<color rgb="FFC00000"/>')
    expect(xml).toContain(`<xf numFmtId="0" fontId="${fonts}"`)
  })

  it('leaves a styles.xml it cannot read as it is', () => {
    expect(addRedStyle('<styleSheet/>')).toEqual({ xml: '<styleSheet/>', style: -1 })
  })
})
