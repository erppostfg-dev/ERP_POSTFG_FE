import type { Num } from '../api/poReview'

/**
 * A rate the channel prints BEFORE GST (a unit cost, no landing rate; Nykaa, Reliance ...): the GST % the backend added to
 * compare it with our with-GST rate (poUnitPrice = unitCost x (1 + GST)), so the review screen can say
 * "on PO 247.31 + 18% GST = 291.83" instead of setting 247.31 next to our 291.72 (2026-11-23, ND226208). null when the PO
 * already prints the price with tax, or there is nothing to work it out from.
 */
export function gstOnPo(printed: { unitCost: Num; landingRate: Num }, poUnitPrice: Num): number | null {
  const cost = printed.unitCost
  if (cost === '' || printed.landingRate !== '' || poUnitPrice === '' || Number(cost) <= 0) return null
  const pct = Math.round((Number(poUnitPrice) / Number(cost) - 1) * 1000) / 10
  return pct >= 0.5 ? pct : null
}
