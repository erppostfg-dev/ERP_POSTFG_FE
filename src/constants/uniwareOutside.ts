/*
 * POs punched in Uniware outside POST_FG (2026-11-25, backend constants/uniware-outside.ts, API_REFERENCE "POs punched in
 * Uniware outside POST_FG"): a Uniware sale order under another code for a PO that is In Review, Rejected, or Processed and
 * not uploaded here. The tabs show a badge + a strip; the person rejects / takes Uniware's code / acknowledges / dismisses.
 */

export const UNIWARE_OUTSIDE_ENDPOINT = {
  STATUS: '/po-review/uniware-outside',
  CHECK: '/po-review/uniware-outside/check',
  RESOLVE: (id: string) => `/po-review/uniware-outside/${encodeURIComponent(id)}/resolve`,
  LIVE: (id: string) => `/po-review/uniware-outside/${encodeURIComponent(id)}/live`,
  BULK_RESOLVE: '/po-review/uniware-outside/bulk-resolve',
} as const

export type OutsideKind = 'review' | 'rejected' | 'processed'
export type OutsideAction = 'reject' | 'use_code' | 'acknowledge' | 'dismiss'

/** The filter key on the three tabs (rows carry inUniware Yes / No). */
export const OUTSIDE_FILTER_KEY = 'inUniware'
export const OUTSIDE_YES = 'Yes'
export const OUTSIDE_NO = 'No'
export const OUTSIDE_REMARK_MAX = 500

export const OUTSIDE_TEXT = {
  FILTER: 'In Uniware (outside POST_FG)',
  BADGE: (code: string) => `In Uniware: ${code}`,
  BADGE_HINT: 'Uniware already has a sale order for this PO under another code (punched outside POST_FG). Click to check and decide.',
  STRIP: (n: number, where: string) => `${n} PO${n === 1 ? '' : 's'} ${where} ${n === 1 ? 'is' : 'are'} already in Uniware under another code (punched outside POST_FG).`,
  WHERE: { review: 'in review', rejected: 'rejected here', processed: 'processed here and not uploaded' } as Record<OutsideKind, string>,
  SHOW_ONLY: 'Show only these',
  SHOW_ALL: 'Show all',
  CHECK_NOW: 'Check Uniware now',
  CHECKING: 'Checking…',
  CHECK_HINT: 'Reads Uniware\'s B2B sale orders (read-only). The server also checks every 2 hours; one click per 30 min for the whole team.',
  LAST: (ago: string) => `Uniware checked ${ago}`,
  NEVER: 'Uniware not checked yet',
  NEXT_AT: (t: string) => `again at ${t}`,
  STARTED: 'Checking Uniware: findings show here in a minute.',
  TITLE: 'Already in Uniware',
  SUB: (po: string) => `PO ${po} has a sale order in Uniware that was not made by POST_FG.`,
  FIELDS: { created: 'Created in Uniware', seen: 'found by POST_FG' },
  MORE: (n: number) => `${n} more Uniware code${n === 1 ? '' : 's'} for this PO (shown after this one).`,
  DONE: {
    reject: (po: string, code: string) => `${po} rejected: punched in Uniware as ${code}.`,
    use_code: (po: string, code: string) => `${po} now uses Uniware's ${code} and is marked uploaded.`,
    acknowledge: (po: string) => `${po}: noted.`,
    dismiss: (po: string) => `${po}: warning dismissed.`,
  },
  CANCEL: 'Cancel',
  // live read when the dialog opens (2026-11-25: no timer re-checks)
  LIVE_CHECKING: 'Checking this order in Uniware now…',
  LIVE_CLOSED: (status: string | null) => `This order is ${status ? status.toLowerCase() : 'no longer'} in Uniware: the warning is closed.`,
  LIVE_FAILED: (msg: string) => `Could not read Uniware now (${msg}); showing what was found earlier.`,
  LIVE_OTHERS: (codes: string[]) => `Uniware also has ${codes.join(', ')} for this PO.`,
  CLOSE: 'Close',
  // 2026-11-25 (user: button texts ran outside the buttons): choices as cards in the dialog, one Confirm
  QUESTION: 'What should POST_FG do?',
  NOW: 'now',
  CHOICE: {
    use_code: (code: string) => `Use ${code}`,
    reject: () => 'Reject this PO',
    acknowledge: () => 'Mark as noted',
    dismiss: () => 'Not the same order',
  } as Record<OutsideAction, (code: string) => string>,
  CHOICE_HINT: {
    use_code: 'The PO takes this code and is marked uploaded; it shows in PO Overview and its Uniware status is followed. Our erp_ code is not used.',
    reject: 'Rejected here with the reason "Punched in Uniware outside POST_FG". No second sale order is made.',
    acknowledge: 'The PO stays rejected; the warning closes.',
    dismiss: 'This Uniware order is a different one. The warning closes; say why.',
  } as Record<OutsideAction, string>,
  CONFIRM: { use_code: 'Use code', reject: 'Reject PO', acknowledge: 'Mark noted', dismiss: 'Close warning' } as Record<OutsideAction, string>,
  WHY: 'Why is it not the same order?',
  BULK_LABEL: { use_code: 'Use Uniware codes', reject: 'Reject POs', acknowledge: 'Mark noted', dismiss: 'Not the same' } as Record<OutsideAction, string>,
  // many at once (2026-11-25)
  BULK_INFO: (n: number) => `${n} ticked PO${n === 1 ? '' : 's'} already in Uniware:`,
  BULK_REMARK: 'Remark (required for Not the same order)',
  BULK_RESULT: (done: number, skipped: number) => `${done} done${skipped ? `, ${skipped} skipped` : ''}.`,
  BULK_MAX: 200,
} as const
