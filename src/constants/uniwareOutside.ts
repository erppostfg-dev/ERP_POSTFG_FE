/*
 * POs punched in Uniware outside POST_FG (2026-11-25, backend constants/uniware-outside.ts, API_REFERENCE "POs punched in
 * Uniware outside POST_FG"): a Uniware sale order under another code for a PO that is In Review, Rejected, or Processed and
 * not uploaded here. The tabs show a badge + a strip; the person rejects / takes Uniware's code / acknowledges / dismisses.
 */

export const UNIWARE_OUTSIDE_ENDPOINT = {
  STATUS: '/po-review/uniware-outside',
  CHECK: '/po-review/uniware-outside/check',
  RESOLVE: (id: string) => `/po-review/uniware-outside/${encodeURIComponent(id)}/resolve`,
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
  FIELDS: { code: 'Uniware sale order', channel: 'Uniware channel', status: 'Status in Uniware', created: 'Created in Uniware', seen: 'Found by POST_FG' },
  MORE: (n: number) => `${n} more Uniware code${n === 1 ? '' : 's'} for this PO (shown after this one).`,
  REMARK: 'Remark (required to dismiss)',
  ACTION: {
    reject: 'Reject here (punched outside)',
    use_code: 'Use Uniware\'s code',
    acknowledge: 'Noted',
    dismiss: 'Not the same order',
  } as Record<OutsideAction, string>,
  ACTION_HINT: {
    reject: 'Rejects this PO in POST_FG with the reason "Punched in Uniware outside POST_FG as <code>". No sale order is made here.',
    use_code: 'The saved PO takes Uniware\'s sale order code and is marked uploaded, so PO Overview and the Uniware status follow the real order. Our erp_ code is noted as not used.',
    acknowledge: 'The PO stays rejected; the warning is closed.',
    dismiss: 'Closes the warning: this Uniware order is not this PO (say why).',
  } as Record<OutsideAction, string>,
  DONE: {
    reject: (po: string, code: string) => `${po} rejected: punched in Uniware as ${code}.`,
    use_code: (po: string, code: string) => `${po} now uses Uniware's ${code} and is marked uploaded.`,
    acknowledge: (po: string) => `${po}: noted.`,
    dismiss: (po: string) => `${po}: warning dismissed.`,
  },
  CANCEL: 'Cancel',
} as const
