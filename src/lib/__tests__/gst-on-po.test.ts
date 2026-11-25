import { describe, expect, it } from 'vitest'
import { gstOnPo } from '../gstOnPo'

// Real lines of Nykaa ND226208 (2026-11-23): Nykaa prints Unit Cost before GST; the backend compares cost + GST with ours.
describe('gstOnPo: the GST % added to a price printed before GST', () => {
  it('18% (HYPHE00000001: 247.31 -> 291.83) and 5% (Mcaf404 after the GST cut: 274.75 -> 288.49)', () => {
    expect(gstOnPo({ unitCost: 247.31, landingRate: '' }, 291.83)).toBe(18)
    expect(gstOnPo({ unitCost: 274.75, landingRate: '' }, 288.49)).toBe(5)
    expect(gstOnPo({ unitCost: 1112.21, landingRate: '' }, 1312.41)).toBe(18)
  })

  it('nothing when the PO prints the price with tax, has no cost, or adds no GST', () => {
    expect(gstOnPo({ unitCost: 247.31, landingRate: 291.83 }, 291.83)).toBeNull()
    expect(gstOnPo({ unitCost: '', landingRate: 360 }, 360)).toBeNull()
    expect(gstOnPo({ unitCost: 100, landingRate: '' }, 100)).toBeNull()
    expect(gstOnPo({ unitCost: 0, landingRate: '' }, 10)).toBeNull()
    expect(gstOnPo({ unitCost: 100, landingRate: '' }, '')).toBeNull()
  })
})
