import { describe, expect, it } from 'vitest'
import { chunks, matchVerified, type ListedPo } from '../verifyUpload'

/* Bulk verify from the Processed download (2026-11-02): which file rows become verify calls. */

const po = (id: string, so: string, poNumber: string, over: Partial<ListedPo> = {}): ListedPo =>
  ({ id, saleOrder: so, poNumber, channel: 'BigBasket', toVerify: true, verified: false, ...over })
const listed = [
  po('1', 'erp_20261101001', 'IRA1'),
  po('2', 'erp_20261101002', 'IRA2'),
  po('3', 'erp_20261101003', 'IRA3', { verified: true, toVerify: false }),
  po('4', 'erp_20261101004', 'IRA4', { toVerify: false }), // in Uniware / check off
  po('5', '', 'IRA5'),
]
// The download: PO Number | Channel | ... | Sale order | Check | Uniware (any header row position, any case)
const file = (rows: string[][]) => [['Processed POs'], ['PO Number', 'Channel', 'Sale order', 'Check', 'Uniware'], ...rows]

describe('matchVerified', () => {
  it('takes the rows marked Verified (any case), by sale order or else PO number + channel; counts the rest', () => {
    const m = matchVerified(file([
      ['IRA1', 'BigBasket', 'erp_20261101001', 'Verified', ''],
      ['IRA2', 'BigBasket', 'erp_20261101002', 'To verify', ''], // not marked
      ['IRA3', 'BigBasket', 'erp_20261101003', ' verified ', ''],
      ['IRA4', 'BigBasket', 'erp_20261101004', 'VERIFIED', ''],
      ['IRA5', 'bigbasket', '', 'Verified', ''], // no sale order: PO number + channel
      ['IRA1', 'BigBasket', 'erp_20261101001', 'Verified', ''], // twice in the file
      ['IRA9', 'BigBasket', 'erp_20261101009', 'Verified', ''], // not in the list
    ]), listed)
    expect(m).toEqual({ marked: 6, ids: ['1', '5'], alreadyVerified: 1, notNeeded: 1, notFound: ['erp_20261101009'], unclear: [] })
  })

  it('spelling slips still count (Verifed, Varified, verfied.); other values are told back, the download\'s own states are not', () => {
    const m = matchVerified(file([
      ['IRA1', 'BigBasket', 'erp_20261101001', 'Verifed', ''],
      ['IRA2', 'BigBasket', 'erp_20261101002', 'varified', ''],
      ['IRA5', 'BigBasket', '', 'verfied.', ''],
      ['IRA3', 'BigBasket', 'erp_20261101003', 'done', ''],
      ['IRA4', 'BigBasket', 'erp_20261101004', 'In Uniware', ''],
      ['IRA9', 'BigBasket', 'erp_20261101009', 'Verify', ''], // 3 letters off: not guessed, told back
      ['IRA8', 'BigBasket', 'erp_20261101008', 'Ver', ''], // too short to guess
    ]), listed)
    expect(m?.ids).toEqual(['1', '2', '5'])
    expect(m?.unclear).toEqual(['done', 'Verify', 'Ver'])
    expect(m?.notFound).toEqual([])
  })

  it('null for a file without a Check column; zero marked when nothing says Verified', () => {
    expect(matchVerified([['PO Number', 'Channel'], ['IRA1', 'BigBasket']], listed)).toBeNull()
    expect(matchVerified(file([['IRA1', 'BigBasket', 'erp_20261101001', '', '']]), listed)?.marked).toBe(0)
  })
})

describe('chunks', () => {
  it('splits the ids into calls of at most n', () => {
    expect(chunks(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']])
    expect(chunks([], 200)).toEqual([])
  })
})
