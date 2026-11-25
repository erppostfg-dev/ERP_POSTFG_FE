import { describe, expect, it } from 'vitest'
import { BULK_FIXED_PRICE, BULK_PROCESS_TYPES, bulkHidesMoney, isMarketingLike, MARKETING_UNIT_PRICE } from '../../constants/bulkOrders'
import { formProblems } from '../bulkForm'
import { approvalWhy, lineTooSmall, lineTotal, normalPhone, priceAfterDiscount, sameAddress, unitPrice, validDiscount } from '../bulkPrice'

/* Bulk Orders price maths = the backend's (POST_FG test/api/bulk-orders.test.ts uses the same numbers). */
describe('bulk order prices', () => {
  it('MRP less the discount, in paise rounded half up', () => {
    expect(priceAfterDiscount(100, 30)).toBe(70)
    expect(priceAfterDiscount(349, 12.5)).toBe(305.38)
    expect(priceAfterDiscount(499, 0)).toBe(499)
    expect(priceAfterDiscount(499, 100)).toBe(0)
    expect(lineTotal(349, 12.5, 3)).toBe(916.14)
  })

  it('discounts the server accepts; phone numbers as the server cleans them', () => {
    expect([validDiscount(0), validDiscount(12.55), validDiscount(99.99), validDiscount(100), validDiscount(10.555), validDiscount(-1), validDiscount(101)]).toEqual([true, true, true, false, false, false, false]) // v2: 100% refused
    expect([normalPhone('+91 98765-43210'), normalPhone('098765 43210'), normalPhone('12345')]).toEqual(['9876543210', '9876543210', null])
  })
  it('Marketing / Head office: every unit at MARKETING_UNIT_PRICE (₹0.01, v2; was ₹1) whatever the MRP or discount; the portal hides amounts; our team can process it', () => {
    const fixed = BULK_FIXED_PRICE.marketing
    expect([fixed, BULK_FIXED_PRICE.head_office, MARKETING_UNIT_PRICE]).toEqual([0.01, 0.01, 0.01])
    expect([unitPrice(349, 30, fixed), lineTotal(349, 30, 10, fixed), unitPrice(349, 12.5), lineTotal(100, 30, 10)]).toEqual([0.01, 0.1, 305.38, 700])
    expect([bulkHidesMoney('marketing'), bulkHidesMoney('head_office'), bulkHidesMoney('institutional')]).toEqual([true, true, false])
    expect(BULK_PROCESS_TYPES).toEqual(expect.arrayContaining(['marketing', 'head_office', 'institutional']))
    expect(['marketing', 'head_office', 'institutional'].map(isMarketingLike)).toEqual([true, true, false])
  })
  it('v2 (2026-11-23): a priced line under ₹1 is flagged (the server refuses it); fixed-price lines never', () => {
    expect([lineTooSmall(0.5), lineTooSmall(1), lineTooSmall(0.99), lineTooSmall(0.13, MARKETING_UNIT_PRICE)]).toEqual([true, false, true, false])
    expect(lineTooSmall(lineTotal(100, 99.5, 1))).toBe(true)
    expect(lineTooSmall(lineTotal(100, 99.5, 2))).toBe(false)
  })
  it('v2 1c: approval needed when MORE units than the threshold, or Porter; null = never by size; same words as the backend', () => {
    const mkt = { overUnits: 100, modes: ['Porter'] }
    expect([approvalWhy(mkt, 100, 'Courier'), approvalWhy(mkt, 101, 'Courier'), approvalWhy(mkt, 5, 'Porter'), approvalWhy(mkt, 150, 'Porter')])
      .toEqual([[], ['101 units (over 100)'], ['Porter delivery'], ['150 units (over 100)', 'Porter delivery']])
    expect(approvalWhy({ overUnits: null, modes: [] }, 5000, null)).toEqual([])
    expect(approvalWhy(undefined, 5000, 'Porter')).toEqual([])
  })
  it('v2 1d form checks (same as the backend): Fast-track needs remarks + a date, Normal no date; phone 10 digits; never a past date', () => {
    const ok = { orderedBy: 'Brand team', receiverName: 'Ravi', receiverPhone: '+91 98765-43210', neededBy: '', priority: 'Normal', fastTrackRemarks: '' }
    expect(formProblems(ok, '2026-11-23')).toEqual({})
    expect(Object.keys(formProblems({ ...ok, priority: 'Fast-track' }, '2026-11-23')).sort()).toEqual(['fastTrackRemarks', 'neededBy'])
    expect(formProblems({ ...ok, priority: 'Fast-track', neededBy: '2026-11-24', fastTrackRemarks: 'Event Friday' }, '2026-11-23')).toEqual({})
    expect(Object.keys(formProblems({ ...ok, neededBy: '2026-11-22', receiverPhone: '12345', orderedBy: ' ' }, '2026-11-23')).sort()).toEqual(['neededBy', 'orderedBy', 'receiverPhone'])
  })
})

describe('sameAddress (2026-11-25: Head office orders to another address need approval)', () => {
  it('same pincode + same line letters / digits = same; anything else = another address', () => {
    const ho = { line: 'Boomerang, Chandivali Farm Road, Powai', pincode: '400072' }
    expect(sameAddress({ line: 'boomerang chandivali farm road powai', pincode: ' 400072' }, ho)).toBe(true)
    expect(sameAddress({ line: 'Boomerang, Chandivali Farm Road, Powai', pincode: '400076' }, ho)).toBe(false)
    expect(sameAddress({ line: 'Andheri East', pincode: '400072' }, ho)).toBe(false)
  })
})
