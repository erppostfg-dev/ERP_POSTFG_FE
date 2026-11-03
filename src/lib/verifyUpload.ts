import { VERIFY_UPLOAD } from '../constants/poVerify'

/*
 * Bulk verify from a file (2026-11-02, user): the Processed POs download (Excel / CSV) with "Verified" typed in its Check
 * column, uploaded back. Read in the browser; only the matching upload ids go to the server (POST /po-verify/verify).
 * A file row is matched to a listed PO by its Sale order code (unique per saved PO), else by PO Number + Channel.
 */

export interface ListedPo { id: string; saleOrder: string; poNumber: string; channel: string; toVerify: boolean; verified: boolean }

export interface VerifyMatch {
  /** File rows that say Verified in the Check column. */
  marked: number
  /** Upload ids to verify now (listed, still to verify). */
  ids: string[]
  alreadyVerified: number
  /** Listed but not waiting for a check (in Uniware, check switched off). */
  notNeeded: number
  /** Sale order / PO number of marked rows that are not in the Processed list. */
  notFound: string[]
  /** Other values typed in the Check column (neither Verified nor one of the column's own states): told, not acted on. */
  unclear: string[]
}

const norm = (s: string) => s.trim().toLowerCase()

/** Edit distance (insert / delete / change one letter), for spelling slips. */
const distance = (a: string, b: string): number => {
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j)
  for (let i = 1; i <= a.length; i++) {
    const cur = [i]
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[b.length]
}
/** "Verified", any case, or a slip of at most 2 letters ("Verifed", "Varified", "verfied"). */
const isMark = (v: string): boolean => {
  const x = norm(v).replace(/[^a-z]/g, '')
  return x === norm(VERIFY_UPLOAD.MARK) || (x.length >= 6 && distance(x, norm(VERIFY_UPLOAD.MARK)) <= 2)
}
/** Values the download itself writes in the Check column (not a person's mark). */
const OWN_STATES = new Set(VERIFY_UPLOAD.OWN_STATES.map(norm))

/** The header row (first one with a Check column) and the rows below it; null when the file has no Check column. */
const headerOf = (rows: string[][]): { at: number; col: (name: string) => number } | null => {
  const at = rows.findIndex((r) => r.some((c) => norm(c) === norm(VERIFY_UPLOAD.COL_CHECK)))
  if (at < 0) return null
  const head = rows[at].map(norm)
  return { at, col: (name) => head.indexOf(norm(name)) }
}

export const matchVerified = (rows: string[][], listed: ListedPo[]): VerifyMatch | null => {
  const h = headerOf(rows)
  if (!h) return null
  const [check, so, po, ch] = [VERIFY_UPLOAD.COL_CHECK, VERIFY_UPLOAD.COL_SALE_ORDER, VERIFY_UPLOAD.COL_PO, VERIFY_UPLOAD.COL_CHANNEL].map(h.col)
  const bySo = new Map(listed.filter((p) => p.saleOrder).map((p) => [norm(p.saleOrder), p]))
  const byPo = new Map(listed.map((p) => [`${norm(p.poNumber)}|${norm(p.channel)}`, p]))
  const out: VerifyMatch = { marked: 0, ids: [], alreadyVerified: 0, notNeeded: 0, notFound: [], unclear: [] }
  const seen = new Set<string>()
  for (const r of rows.slice(h.at + 1)) {
    const value = (r[check] ?? '').trim()
    if (!isMark(value)) {
      if (value && !OWN_STATES.has(norm(value)) && !out.unclear.includes(value)) out.unclear.push(value)
      continue
    }
    out.marked++
    const p = (so >= 0 && bySo.get(norm(r[so] ?? ''))) || (po >= 0 && byPo.get(`${norm(r[po] ?? '')}|${norm(ch >= 0 ? r[ch] ?? '' : '')}`)) || undefined
    if (!p) { out.notFound.push((so >= 0 && r[so]) || (po >= 0 && r[po]) || '?'); continue }
    if (seen.has(p.id)) continue
    seen.add(p.id)
    if (p.verified) out.alreadyVerified++
    else if (p.toVerify) out.ids.push(p.id)
    else out.notNeeded++
  }
  return out
}

/** The ids in chunks the server takes in one call. */
export const chunks = <T,>(xs: T[], size: number): T[][] => Array.from({ length: Math.ceil(xs.length / size) }, (_, i) => xs.slice(i * size, i * size + size))
