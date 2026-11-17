/*
 * Bulk Orders price maths, the same as the backend (POST_FG modules/bulk-orders priceAfterDiscount): the screen shows
 * what the server will save. MRP x (100 - discount %) = price in paise, rounded half up.
 */

export const priceAfterDiscount = (mrp: number, discountPct: number): number =>
  Math.round(Number((mrp * (100 - discountPct)).toFixed(6))) / 100

export const round2 = (n: number): number => Math.round((n + Number.EPSILON) * 100) / 100

/** Unit price: a type's fixed price (Marketing ₹1, constants BULK_FIXED_PRICE) or MRP less discount %. */
export const unitPrice = (mrp: number, discountPct: number, fixed?: number): number => fixed ?? priceAfterDiscount(mrp, discountPct)

export const lineTotal = (mrp: number, discountPct: number, qty: number, fixed?: number): number => round2(unitPrice(mrp, discountPct, fixed) * qty)

/** A discount the server accepts: 0-100, at most 2 decimals. */
export const validDiscount = (d: number): boolean => Number.isFinite(d) && d >= 0 && d <= 100 && round2(d) === d

const INR = new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 })
export const rupees = (n: number): string => INR.format(n)

/** "+91 98765-43210" -> "9876543210"; null when not 10 digits (as the backend). */
export const normalPhone = (v: string): string | null => {
  let d = v.replace(/[\s\-().]/g, '')
  if (d.startsWith('+91')) d = d.slice(3)
  else if (d.length === 12 && d.startsWith('91')) d = d.slice(2)
  else if (d.length === 11 && d.startsWith('0')) d = d.slice(1)
  return /^\d{10}$/.test(d) ? d : null
}
