/*
 * PO verification before Uniware (user, 2026-10-22; backend constants/po-verify.ts). Every PO on the Processed tab is
 * checked side by side with its original before its sale order CSV can be downloaded; if something is wrong it is sent
 * back to In Review. Built to be removable later: this file, api/poVerify.ts, pages/ops/VerifyPanel.tsx and the
 * Verify column in POProcessing.tsx.
 */

export const PO_VERIFY_ENDPOINT = '/po-verify'
export const PO_VERIFY_SETTINGS_ENDPOINT = `${PO_VERIFY_ENDPOINT}/settings`

export const VERIFY_STATE = { VERIFIED: 'verified', TO_VERIFY: 'to_verify', NOT_NEEDED: 'not_needed', NOT_REQUIRED: 'not_required' } as const
export type VerifyState = (typeof VERIFY_STATE)[keyof typeof VERIFY_STATE]

export const VERIFY_REMARK_MAX = 500

export const VERIFY_TEXT = {
  // A PO priced before GST (Purplle, 2026-11-03): its own value is without GST, the sale order's with GST
  // Myntra STRs (2026-11-03): our rate + GST are used, the channel's own price is information only
  OUR_PRICE: 'Our price used (master margin + our GST)',
  OUR_PRICE_HINT: "The sale order uses our rate. What the channel's PO says is shown for information only; it is not checked and not used.",
  CHANNEL_SAYS: 'Channel PO says (with GST)',
  WE_USED: 'We used (sale order)',
  CHANNEL_RATE: (v: string, gst: number | null | undefined) => `Channel PO: ${v}${gst != null ? ` (GST ${gst}%)` : ''}; not used`,
  BEFORE_GST: 'This PO is priced before GST',
  BEFORE_GST_HINT: 'The PO value and net amount above are before GST. The sale order is with GST: compare it with the PO value with GST.',
  PO_BEFORE_GST: 'PO says (before GST)',
  PO_WITH_GST: 'PO with GST (worked out)',
  DIFFERENCE: 'Difference',
  RATE_BEFORE_GST: (v: string) => `Before GST ${v}; with GST shown`,
  COLUMN: 'Check',
  VERIFIED: 'Verified',
  TO_VERIFY: 'To verify',
  NOT_NEEDED: 'In Uniware',
  OPTIONAL: 'Optional',
  OPTIONAL_HINT: 'Verification is switched OFF for this channel: the CSV is not locked; you can still verify it.',
  VERIFY: 'Verify',
  VIEW: 'View check',
  TITLE: 'Verify PO against the original',
  INTRO: 'Left: the original PO. Right: what was saved and goes to Uniware. Tick each line once it matches, then verify. If anything is wrong, send it back to In Review.',
  LOADING: 'Loading the saved PO…',
  SAVED: 'Saved (goes to Uniware)',
  PO_SAYS: 'PO says',
  TOTALS: 'Totals',
  LINES: 'Lines',
  UNITS: 'Units',
  VALUE: 'Value',
  TICK_ALL: 'Tick all',
  CHECKED: (n: number, total: number) => `${n} of ${total} lines checked`,
  NOTE: 'Note (optional)',
  APPROVE: 'Verify & approve',
  SEND_BACK: 'Send back to review',
  SEND_BACK_PROMPT: 'What is wrong? (required; the reviewer sees it as an open issue)',
  SEND_BACK_CONFIRM: 'Send back',
  SEND_BACK_HINT: 'The saved PO and its sale order code are cancelled (kept in history, nothing deleted). After the fix and approval it gets a new sale order code and is checked again.',
  DONE_VERIFIED: (po: string) => `${po} verified: its Uniware CSV can be downloaded now.`,
  DONE_SENT_BACK: (po: string) => `${po} sent back to In Review.`,
  ALL_LINES_FIRST: 'Tick every line first',
  NOT_IN_PO: 'not in the PO',
  BLOCKED: (n: number) => `${n} ticked PO${n === 1 ? ' is' : 's are'} not verified yet: verify before downloading the CSV.`,
  TO_VERIFY_CHIP: (n: number) => `${n} to verify`,
  BY: (who: string | null, at: string) => `Verified by ${who ?? '—'} · ${at}`,
  LAST_SENT_BACK: (who: string | null, at: string, remark: string | null) => `Sent back earlier by ${who ?? '—'} · ${at}: ${remark ?? ''}`,
  TAB_JSON: 'processed.json',
  TAB_SAVED: 'Saved for Uniware',
  CLICK_HINT: 'Click any value: it is found and highlighted on the PO on the left (red = not on the PO: check it). Double-click: copy it (e.g. for the Masters search).',
  COPIED: ' · copied',
  HEADER: 'PO header',
  LINE_ITEMS: 'Line items',
  FOUND: (n: number) => `found ${n}×`,
  NOT_FOUND: 'not found on the PO',
  CANNOT_SEARCH: 'this file cannot be searched',
  SEARCHING: 'finding…',
  OURS: 'Filled by us from the master, not on the PO',
  QTY_DIFF: 'Quantity differs from the PO',
  RATE_DIFF: 'Rate differs from the PO by more than ₹2 (the rate comes from our master; check it is right)',
} as const

/**
 * Bulk verify from a file (2026-11-02): the Processed download with "Verified" typed in its Check column, uploaded back.
 * Column names = the download's (POProcessing PEXPORT); the server takes BULK_MAX ids per call (backend PO_VERIFY.BULK_MAX).
 */
export const VERIFY_UPLOAD = {
  BULK_MAX: 200,
  ACCEPT: '.xlsx,.xls,.csv',
  COL_CHECK: 'Check',
  COL_SALE_ORDER: 'Sale order',
  COL_PO: 'PO Number',
  COL_CHANNEL: 'Channel',
  MARK: 'Verified',
  /** The Check column's dropdown in the Excel download (CSV has none: small spelling slips are still read as Verified). */
  DROPDOWN: ['Verified', 'To verify'],
  /** What the download writes in Check by itself (VERIFY_TEXT's states): not a person's mark, never "not understood". */
  OWN_STATES: ['To verify', 'In Uniware', 'Optional'],
  DROPDOWN_PROMPT: 'Pick Verified for each PO you checked, then upload this file with Upload verified',
  UNCLEAR: (values: string[]) => `Not understood in the Check column (left as they are): ${values.slice(0, 5).map((v) => `"${v}"`).join(', ')}${values.length > 5 ? '…' : ''}`,
  BUTTON: 'Upload verified',
  BUTTON_HINT: 'Download the POs (Excel / CSV), type Verified in the Check column of the POs you checked, then upload that file here',
  READING: 'Reading the file…',
  NO_CHECK_COLUMN: 'This file has no Check column: upload the Processed POs download with Verified typed in its Check column.',
  NONE_MARKED: 'No row of this file says Verified in the Check column.',
  SUMMARY: (file: string, marked: number) => `${file}: ${marked} row${marked === 1 ? '' : 's'} marked Verified`,
  WILL: (n: number) => `${n} PO${n === 1 ? '' : 's'} will be verified`,
  ALREADY: (n: number) => `${n} already verified`,
  NOT_NEEDED: (n: number) => `${n} need no check (in Uniware / check off)`,
  NOT_FOUND: (list: string[]) => `${list.length} not in the Processed list: ${list.slice(0, 5).join(', ')}${list.length > 5 ? '…' : ''}`,
  CONFIRM: (n: number) => `Verify ${n}`,
  CANCEL: 'Cancel',
  VERIFYING: (done: number, total: number) => `Verifying… ${done} of ${total}`,
  REMARK: (file: string) => `Verified in ${file} (Processed download)`,
  DONE: (n: number, skipped: number) => `${n} PO${n === 1 ? '' : 's'} verified${skipped ? `, ${skipped} left as they were (changed meanwhile)` : ''}: their Uniware CSVs can be downloaded now.`,
} as const

/** processed.json fields shown in the Verify panel: [key, label, how to find it on the PO]. */
export type FieldKind = 'number' | 'date' | 'text'
export const VERIFY_HEADER_FIELDS: [string, string, FieldKind][] = [
  ['po_number', 'PO number', 'text'], ['po_date', 'PO date', 'date'], ['expiry_date', 'Expiry date', 'date'],
  ['expected_date', 'Expected date', 'date'], ['appointment_date', 'Appointment date', 'date'], ['po_type', 'PO type', 'text'],
  ['delivery_facility_code', 'Delivery location', 'text'], ['delivery_pincode', 'Pincode', 'text'], ['delivery_gstin', 'Delivery GSTIN', 'text'],
  ['vendor_gstin', 'Vendor GSTIN', 'text'], ['total_line_items', 'Line items', 'number'], ['total_qty', 'Total qty', 'number'],
  ['po_value', 'PO value', 'number'], ['cart_discount', 'Discount', 'number'], ['net_amount', 'Net amount', 'number'],
]
export const VERIFY_LINE_FIELDS: [string, string, FieldKind][] = [
  ['channel_sku_code', 'Channel SKU', 'text'], ['ean', 'EAN', 'text'], ['description', 'Description', 'text'], ['qty', 'Qty', 'number'],
  ['free_qty', 'Free qty', 'number'], ['channel_mrp', 'MRP', 'number'], ['landing_rate', 'Rate', 'number'], ['unit_cost', 'Unit cost', 'number'],
  ['line_total', 'Line total', 'number'], ['hsn', 'HSN', 'text'], ['gst', 'GST %', 'number'],
]
/** Filled by us from the master (not on the PO): shown greyed, not clickable. */
export const VERIFY_OUR_LINE_FIELDS: [string, string][] = [['pep_sku_code', 'Our SKU'], ['pep_mrp', 'Our MRP']]

/** Users & Roles -> Settings: the verify switch per channel (2026-10-22). */
export const VERIFY_SETTINGS_TEXT = {
  TAB: 'Settings',
  TITLE: 'Verify POs before the Uniware CSV',
  SUB: 'Per channel. ON: each processed PO must be checked against the original PO before its CSV can be downloaded. OFF: the CSV is not locked (verifying stays optional). Keep it ON for channels whose POs often need fixing.',
  CHANNEL: 'Channel',
  SWITCH: 'Verify before Uniware',
  VERIFIED: 'Verified',
  SENT_BACK: 'Sent back',
  CHANGED: 'Last changed',
  DEFAULT: (on: boolean) => `default (${on ? 'ON' : 'OFF'}, from the server setting)`,
  ON: 'ON',
  OFF: 'OFF',
  SAVED: (channel: string, on: boolean) => `${channel}: verification switched ${on ? 'ON' : 'OFF'}.`,
  LOADING: 'Loading channels…',
  SENT_BACK_HINT: 'POs sent back after checking: a high number means this channel needs the check',
} as const
