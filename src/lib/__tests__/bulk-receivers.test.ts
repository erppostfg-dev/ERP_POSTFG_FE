import { describe, expect, it } from 'vitest'
import { receiverErrorsCsv, receiverQty, receiverTemplateCsv, rowsFromGrid, RECEIVER_TEMPLATE_COLUMNS } from '../bulkReceivers'

describe('bulk receivers file (v2 piece 2)', () => {
  it('reads rows by column name (any order / case / spacing), skips empty rows, keeps the file row number', () => {
    const grid = [
      [],
      ['Qty', 'SKU Code', 'PIN', 'state', 'City', 'Address', 'Phone', 'Receiver Name'],
      [2, 'MCAF1', 400069, 'Maharashtra', 'Mumbai', '12 MG Road', '+91 98765 43210', 'Ravi'],
      ['', '', '', '', '', '', '', ''],
      ['3', 'MCAF2', '411045', 'Maharashtra', 'Pune', '4 Hill Rd', 9988776655, ' Meera '],
    ]
    const { rows, missing } = rowsFromGrid(grid)
    expect(missing).toEqual([])
    expect(rows).toEqual([
      { row: 3, receiverName: 'Ravi', receiverPhone: '+91 98765 43210', line: '12 MG Road', city: 'Mumbai', state: 'Maharashtra', pincode: '400069', pepCode: 'MCAF1', qty: 2 },
      { row: 5, receiverName: 'Meera', receiverPhone: '9988776655', line: '4 Hill Rd', city: 'Pune', state: 'Maharashtra', pincode: '411045', pepCode: 'MCAF2', qty: '3' },
    ])
  })

  it('names the missing columns and reads nothing then; the template has every column', () => {
    expect(rowsFromGrid([['Name', 'Phone', 'Qty'], ['a', 'b', 1]])).toEqual({ rows: [], missing: ['Address', 'City', 'State', 'Pincode', 'SKU code'] })
    const head = receiverTemplateCsv().split('\r\n')[0].split(',')
    expect(head).toEqual([...RECEIVER_TEMPLATE_COLUMNS])
    expect(rowsFromGrid([head, ['x', '1', 'a', 'b', 'c', '400001', 'S', '1']]).missing).toEqual([])
  })

  it('error file lists each problem with the row it came from (commas quoted)', () => {
    const rows = rowsFromGrid([[...RECEIVER_TEMPLATE_COLUMNS], ['Ravi, Jr', '123', 'a', 'b', 'c', '400001', 'NOPE', 0]]).rows
    expect(receiverErrorsCsv([{ row: 2, field: 'receiverPhone', message: 'a 10-digit phone number' }], rows).split('\r\n')[1])
      .toBe('2,"Ravi, Jr",NOPE,0,receiverPhone,a 10-digit phone number')
  })

  it('a receiver qty box: empty / 0 = not for them, whole numbers only', () => {
    expect(['', ' 0 ', '5', '2.5', '-1', 'x'].map(receiverQty)).toEqual([0, 0, 5, null, null, null])
  })
})
