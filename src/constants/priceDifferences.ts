/*
 * Price check + Price differences (user, 2026-10-30; backend POST_FG routes/price-differences.routes.ts, API #91-94).
 * In review a price / MRP mismatch is decided by a click: ours or the channel's. Lines kept at OUR value are listed on the
 * Price differences tab (per PO / per channel) with an email draft to copy and send to the channel; Mark as sent.
 */

export const PRICE_DIFFS_ENDPOINT = '/price-differences'

export const PRICE_CHOICE = { OURS: 'ours', CHANNEL: 'channel' } as const
export type PriceChoice = (typeof PRICE_CHOICE)[keyof typeof PRICE_CHOICE]

export const PRICE_DIFF_VIEWS = ['po', 'channel'] as const
export type PriceDiffView = (typeof PRICE_DIFF_VIEWS)[number]
export const PRICE_DIFF_STATUSES = ['open', 'sent', 'all'] as const
export type PriceDiffStatus = (typeof PRICE_DIFF_STATUSES)[number]

/** The PO total may differ by 0.02% of the value, at least Rs 10 (same as the backend's default). */
export const TOTAL_TOLERANCE = { MIN: 10, PERCENT: 0.02 } as const

export const PRICE_CHECK_TEXT = {
  TITLE: (n: number) => `Price check · ${n} line${n === 1 ? '' : 's'} differ`,
  HINT: 'Pick what the sale order uses for each SKU (MRP and price together). Ours: the channel is told on the Price differences tab. Channel: this PO only, unless you also update our master.',
  ALL_OURS: 'Use ours for all',
  ALL_CHANNEL: 'Use channel for all',
  OURS: 'Ours',
  CHANNEL: 'Channel',
  LINE: (n: string) => `Line ${n}`,
  DIFFERS: (what: string) => `Channel differs: ${what}`,
  UPDATE_MASTER: 'Also update our master',
  FIELD: { price: 'Price', mrp: 'MRP' } as Record<string, string>,
  UPDATE_TIP: 'Update master: on approval our channel SKU takes the channel\'s MRP / price (Masters History keeps it)',
  TOTALS: (po: string, chosen: string) => `PO lines total ${po} · with your choices ${chosen}`,
  TOTAL_EXPLAINED: (ours: string) => `kept at our price: ${ours} (goes on Price differences)`,
  TOTAL_LEFT: (left: string) => `Still off by ${left} beyond the line choices: tick Accept on the total in Other checks and write why in the remark`,
  TOTAL_REMARK: 'Write a remark: why the PO total can be accepted',
} as const

/** The Approvals panel: what the reviewer decided on each mismatch. */
export const APPROVAL_PRICE_TEXT = {
  TITLE: (n: number) => `Price check (${n})`,
  COLS: ['Where', 'What', 'Ours', 'Channel', 'Sale order uses', 'Master'],
  USES: { ours: 'Ours', channel: 'Channel (this PO)' } as Record<string, string>,
  WILL_UPDATE: (field: string, from: string, to: string) => `Will update master: ${field} ${from} -> ${to}`,
} as const

export const PRICE_DIFF_TEXT = {
  TAB: 'Price differences',
  TITLE: 'Price differences (to tell the channel)',
  SUB: 'Approved PO lines where we kept our price or MRP although the channel\'s PO said otherwise. Open a PO or a channel for the email to send them, then mark it sent.',
  VIEW: { po: 'By PO', channel: 'By channel' } as Record<string, string>,
  STATUS: { open: 'Not sent', sent: 'Sent', all: 'All' } as Record<string, string>,
  EMPTY: 'Nothing here.',
  LOADING: 'Loading…',
  LINES: 'Lines',
  EMAIL: 'Email to the channel',
  TO: 'To',
  TO_LATER: 'the channel\'s address (kept in the masters later)',
  SUBJECT: 'Subject',
  BODY: 'Body',
  ATTACHMENT: 'Attachment',
  COPY: 'Copy',
  COPY_ALL: 'Copy all',
  COPIED: 'Copied',
  EXCEL: 'Excel',
  CSV: 'CSV',
  MARK_SENT: (n: number) => `Mark as sent (${n})`,
  MARKED: (n: number) => `${n} line${n === 1 ? '' : 's'} marked as sent.`,
  NOTHING_OPEN: 'Everything here is already sent.',
  VIEW_ONLY: 'View only: marking as sent needs editor access.',
  BACK: 'Back',
  OPEN_SINCE: (d: string) => `oldest not sent: ${d}`,
} as const
