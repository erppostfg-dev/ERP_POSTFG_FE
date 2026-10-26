/*
 * What a reviewer may change on a PO in review (user, 2026-10-22): only the values that show an error, unless their
 * role has "PO Review: edit all fields" (Roles tab; admin / developer always). The same table as the backend
 * (POST_FG modules/po-review/review-edit-rules.ts), which checks it again on submit.
 *   Location not mapped -> delivery location · SKU not mapped (line) -> our SKU · MRP / Price / Qty mismatch (line) ->
 *   that field · Total mismatch -> qty + rate of every line · OCR problem (line) -> that line; (PO) -> everything.
 */

export const CAPABILITY = { PO_REVIEW_EDIT_ALL: 'po-review:edit-all' } as const

export type LineField = 'pep' | 'qty' | 'mrp' | 'rate'
const ALL: LineField[] = ['pep', 'qty', 'mrp', 'rate']

export interface EditRules { location: boolean; everyLine: Set<LineField>; lines: Map<string, Set<LineField>> }

export const editRules = (open: { type: string; lineNo: number | null }[]): EditRules => {
  const r: EditRules = { location: false, everyLine: new Set(), lines: new Map() }
  const line = (n: number, ...f: LineField[]) => {
    const key = String(n)
    if (!r.lines.has(key)) r.lines.set(key, new Set())
    for (const x of f) r.lines.get(key)!.add(x)
  }
  for (const i of open) {
    const n = i.lineNo
    if (i.type === 'LOCATION_NOT_MAPPED') r.location = true
    else if (i.type === 'SKU_NOT_MAPPED' && n !== null) line(n, 'pep')
    else if (i.type === 'MRP_MISMATCH' && n !== null) line(n, 'mrp')
    else if (i.type === 'PRICE_MISMATCH' && n !== null) line(n, 'rate')
    else if (i.type === 'QTY_MISMATCH') { if (n !== null) line(n, 'qty'); else r.everyLine.add('qty') }
    else if (i.type === 'TOTAL_MISMATCH') { r.everyLine.add('qty'); r.everyLine.add('rate') }
    else if (i.type === 'OCR_ISSUE') { if (n !== null) line(n, ...ALL); else { r.location = true; for (const f of ALL) r.everyLine.add(f) } }
  }
  return r
}

export const fieldOpen = (r: EditRules, lineNo: string, f: LineField) => r.everyLine.has(f) || !!r.lines.get(lineNo)?.has(f)

export const REVIEW_EDIT_TEXT = {
  LOCKED: 'No error on this value: only values with an error can be changed (an admin can give your role "PO Review: edit all fields").',
  EDIT_ALL: 'Your role can change every value on this PO.',
  ONLY_ERRORS: 'You can change only the values that show an error; the rest are locked.',
} as const
