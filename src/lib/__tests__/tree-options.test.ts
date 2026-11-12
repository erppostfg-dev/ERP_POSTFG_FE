import { describe, expect, it } from 'vitest'
import { treeRows, type TreeOption } from '../treeOptions'
import { marginStatusLabel, MARGIN_TEXT } from '../../constants/poReview'

// Bulk Orders warehouse picker (2026-11-12): main (mother) warehouses, children folded under them, search over all.
const WH: TreeOption[] = [
  { value: 'MUM_WAREHOUSE2', label: 'MUM_WAREHOUSE2', sub: 'Bhiwandi', parent: null },
  { value: 'MUM_Warehouse2', label: 'MUM_Warehouse2', sub: 'Bhiwandi B2C', parent: 'MUM_WAREHOUSE2' },
  { value: 'MUM_Returns', label: 'MUM_Returns', sub: 'Returns', parent: 'MUM_WAREHOUSE2' },
  { value: 'GGN_WAREHOUSE', label: 'GGN_WAREHOUSE', sub: 'Gurgaon', parent: null },
  { value: 'BLR_child', label: 'BLR_child', sub: 'Bangalore', parent: 'BLR_CLOSED' }, // its main is not in the list
]
const shape = (search: string) => treeRows(WH, search).map((r) => ({ main: r.main.value, kids: r.children.map((c) => c.value), total: r.total, open: r.childHit }))

describe('warehouse tree', () => {
  it('lists only main warehouses at the top, children under them; a child whose main is missing shows on top', () => {
    expect(shape('')).toEqual([
      { main: 'MUM_WAREHOUSE2', kids: ['MUM_Warehouse2', 'MUM_Returns'], total: 2, open: false },
      { main: 'GGN_WAREHOUSE', kids: [], total: 0, open: false },
      { main: 'BLR_child', kids: [], total: 0, open: false },
    ])
  })
  it('search on a child shows its main, opened, with only the matching child', () => {
    expect(shape('returns')).toEqual([{ main: 'MUM_WAREHOUSE2', kids: ['MUM_Returns'], total: 2, open: true }])
  })
  it('search on a main shows all its children (closed); search by name works; no match = nothing', () => {
    expect(shape('gurgaon')).toEqual([{ main: 'GGN_WAREHOUSE', kids: [], total: 0, open: false }])
    expect(shape('bhiwandi')).toEqual([{ main: 'MUM_WAREHOUSE2', kids: ['MUM_Warehouse2', 'MUM_Returns'], total: 2, open: true }])
    expect(shape('zzz')).toEqual([])
  })
})

describe('margin approval texts (no "layer" on screen)', () => {
  it('a new SKU has one approval; a change has two steps', () => {
    expect(marginStatusLabel('pending_l1', 1)).toBe('Waiting for approval')
    expect(marginStatusLabel('pending_l2', 1)).toBe('Waiting for approval') // an add asked before 10 Nov
    expect(marginStatusLabel('applied', 1)).toBe('Added')
    expect(marginStatusLabel('pending_l1', 2)).toBe('Waiting for Operations Manager (step 1 of 2)')
    expect(marginStatusLabel('pending_l2', 2)).toBe('Waiting for Admin (step 2 of 2)')
    expect(marginStatusLabel('applied', 2)).toBe('Applied')
    const all = [...['pending_l1', 'pending_l2', 'applied', 'rejected'].flatMap((s) => [marginStatusLabel(s, 1), marginStatusLabel(s, 2)]),
      ...Object.values(MARGIN_TEXT).filter((v): v is string => typeof v === 'string'), MARGIN_TEXT.WAITING_SUMMARY(1, 2, 3), MARGIN_TEXT.APPROVED_L1('1'), MARGIN_TEXT.APPLIED('1')]
    expect(all.filter((t) => /layer/i.test(t))).toEqual([])
  })
})
