/*
 * The ways a processed.json value may be written on the PO (Verify panel, 2026-10-22: click a value, find it on the
 * PO). The viewer looks for any of them as a whole word / number (components/FindBox findTerms).
 *   number  711.45 -> "711.45"; 17 -> "17", "17.0", "17.00"; 1234 -> "1234", "1,234", "1,234.00", "1234.00";
 *           123456 -> also the Indian "1,23,456" / "1,23,456.00"
 *           a 2-decimal value also as printed with one decimal (Blinkit prints 364.27 as "364.2")
 *   date    2026-10-18 -> 18/10/2026, 18-10-2026, 18.10.2026, 18/10/26, 18-Oct-2026, 18 Oct 2026, 18-Oct-26,
 *           October 18, 2026, Oct 18, 2026, 18 October 2026, 2026-10-18, 18/10/2026 without leading zeros
 *   text    the text itself, its first 2-4 words (long descriptions wrap over lines on a PDF), and for a long code
 *           its start up to a "-" / "/" (Zepto's 83d22c75-7883-4694-… wraps after "4694-")
 * Dates also as Blinkit writes them: "Sept. 21, 2026", "Oct. 2, 2026" (checked on real POs, 2026-10-22).
 */

export type ValueKind = 'number' | 'date' | 'text'

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
/** Words kept from a long text when its whole spelling may wrap on the PO. */
const FIRST_WORDS = [4, 3, 2]
/** A code longer than this without spaces is also looked for by its start (it may wrap on the PO). */
const LONG_CODE = 14

const uniq = (list: string[]) => [...new Set(list.map((x) => x.trim()).filter(Boolean))]

const numberTerms = (raw: string): string[] => {
  const n = Number(raw.replace(/,/g, ''))
  if (!Number.isFinite(n) || raw.trim() === '') return uniq([raw])
  const fixed2 = n.toFixed(2)
  const list = [raw, String(n), fixed2]
  if (Number.isInteger(n)) list.push(n.toFixed(1))
  else if (/\.\d\d$/.test(String(n))) list.push((Math.trunc(n * 10) / 10).toFixed(1), n.toFixed(1))
  for (const locale of ['en-IN', 'en-US']) {
    list.push(n.toLocaleString(locale, { maximumFractionDigits: 2 }))
    list.push(n.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
  }
  return uniq(list)
}

const dateTerms = (raw: string): string[] => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(raw)
  if (!m) return uniq([raw])
  const [, y, mm, dd] = m
  const d = String(Number(dd))
  const mo = String(Number(mm))
  const yy = y.slice(2)
  const full = MONTHS[Number(mm) - 1] ?? ''
  const mon = full.slice(0, 3)
  return uniq([
    `${dd}/${mm}/${y}`, `${dd}-${mm}-${y}`, `${dd}.${mm}.${y}`, `${d}/${mo}/${y}`, `${d}-${mo}-${y}`,
    `${dd}/${mm}/${yy}`, `${dd}-${mm}-${yy}`,
    `${dd}-${mon}-${y}`, `${d}-${mon}-${y}`, `${dd} ${mon} ${y}`, `${d} ${mon} ${y}`, `${dd}-${mon}-${yy}`, `${dd} ${mon}, ${y}`,
    `${full} ${d}, ${y}`, `${mon} ${d}, ${y}`, `${mon} ${dd}, ${y}`, `${d} ${full} ${y}`, `${dd} ${full} ${y}`,
    `${y}-${mm}-${dd}`, `${y}/${mm}/${dd}`,
    `${mon}. ${d}, ${y}`, `${full.slice(0, 4)}. ${d}, ${y}`,
  ])
}

const textTerms = (raw: string): string[] => {
  const t = raw.trim().replace(/\s+/g, ' ')
  const words = t.split(' ')
  const list = [t, ...FIRST_WORDS.filter((n) => words.length > n).map((n) => words.slice(0, n).join(' '))]
  // A wrapped word ends at its hyphen on the PO: "Ceramide-Peptide" -> "Ceramide-".
  for (const n of FIRST_WORDS) {
    if (words.length < n) continue
    const last = words[n - 1]
    if (last.includes('-')) list.push([...words.slice(0, n - 1), last.slice(0, last.indexOf('-') + 1)].join(' '))
  }
  if (!t.includes(' ') && t.length > LONG_CODE) {
    // Every place it could wrap: after each "-" / "/" from the 7th character on.
    for (let i = 6; i < t.length - 1; i++) if (t[i] === '-' || t[i] === '/') list.push(t.slice(0, i + 1))
  }
  return uniq(list)
}

/** Every spelling of `value` to look for; empty when there is nothing to find. */
export function termsFor(value: unknown, kind: ValueKind): string[] {
  if (value === null || value === undefined || value === '') return []
  const raw = String(value)
  return kind === 'number' ? numberTerms(raw) : kind === 'date' ? dateTerms(raw) : textTerms(raw)
}
