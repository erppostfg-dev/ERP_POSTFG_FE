import { describe, expect, it } from 'vitest'
import { BULK_FIXED_PRICE, BULK_PROCESS_TYPES, bulkHidesMoney } from '../../constants/bulkOrders'
import { lineTotal, normalPhone, priceAfterDiscount, unitPrice, validDiscount } from '../bulkPrice'

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
    expect([validDiscount(0), validDiscount(12.55), validDiscount(100), validDiscount(10.555), validDiscount(-1), validDiscount(101)]).toEqual([true, true, true, false, false, false])
    expect([normalPhone('+91 98765-43210'), normalPhone('098765 43210'), normalPhone('12345')]).toEqual(['9876543210', '9876543210', null])
  })
  it('Marketing (2026-11-13): every unit ₹1 whatever the MRP or discount; the portal hides amounts; our team can process it', () => {
    const fixed = BULK_FIXED_PRICE.marketing
    expect(fixed).toBe(1)
    expect([unitPrice(349, 30, fixed), lineTotal(349, 30, 10, fixed), unitPrice(349, 12.5), lineTotal(100, 30, 10)]).toEqual([1, 10, 305.38, 700])
    expect([bulkHidesMoney('marketing'), bulkHidesMoney('institutional')]).toEqual([true, false])
    expect(BULK_PROCESS_TYPES).toEqual(expect.arrayContaining(['marketing', 'institutional']))
  })
})
