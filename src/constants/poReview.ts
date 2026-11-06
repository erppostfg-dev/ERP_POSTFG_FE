/* PO review API (POST_FG GET /po-review): statuses, limits and how the screens show its values. */

export const PO_REVIEW_ENDPOINT = '/po-review'
/** The PO's original file, streamed from S3 (opens in a browser tab: PDF, sheet, an API's JSON). */
export const PO_FILE_PATH = (uploadId: string) => `${PO_REVIEW_ENDPOINT}/${encodeURIComponent(uploadId)}/file`

/** po_uploads.status values the screens ask for. */
export const PO_STATUS = {
  NEEDS_REVIEW: 'needs_review',
  COMPLETED: 'completed',
  REJECTED: 'rejected',
  FAILED: 'failed',
  /** Submitted for approval (Approvals page). */
  PENDING_APPROVAL: 'pending_approval',
} as const

/**
 * Rejected & Failed tab (2026-11-02, user): the tag of a failed PO = the pipeline step that failed (POST_FG
 * PIPELINE_STEP, kept in po_uploads.error_details.step).
 */
export const FAIL_STEP_LABEL: Record<string, string> = {
  ocr: 'OCR failed',
  processing: 'Reading failed',
  save_po: 'Saving the PO failed',
  uniware_csv: 'Uniware CSV failed',
  release: 'Held PO not found',
}
export const FAIL_STEP_HINT: Record<string, string> = {
  ocr: 'The PO file could not be read (OCR / download of the PO file). Upload it again from Manual Upload, or ask to re-run it.',
  processing: 'The PO was read but could not be turned into the PO format (an unknown layout or a missing field).',
  save_po: 'Every check passed but saving the PO rows failed; it can be re-run.',
  uniware_csv: 'The PO is saved; only the Uniware CSV (S3) failed; it can be re-run.',
  release: 'A PO held by PO intake was released but its stored files were gone.',
}
export const REJECTED_FROM_LABEL: Record<'review' | 'approval', string> = { review: 'PO review (reviewer)', approval: 'Approvals (approver)' }
export const ENDED_TEXT = {
  TAB: 'Rejected & Failed',
  REJECTED: 'Rejected',
  FAILED: 'Failed',
  REJECTED_SUB: 'POs rejected by a reviewer (PO review) or an approver (Approvals): no PO and no sale order were made; their files are kept.',
  FAILED_SUB: 'POs the system could not finish, with the step that failed and why. Nothing was sent anywhere.',
  NO_REASON: 'no reason saved',
  OPEN_HINT: 'Click a rejected PO to see why it was rejected and reopen it for review.',
  WHY_TITLE: 'Why it was rejected',
  ERRORS_TITLE: 'Errors rejected with it',
  FIXES_TITLE: 'What the reviewer had changed (rejected by the approver)',
  REOPENS_TITLE: 'Reopened before',
  REOPEN: 'Reopen for review',
  REOPEN_HINT: 'It goes back to In Review: the checks run again against today\'s masters, then fix it there and submit it for approval (tagged Reopened).',
  REOPEN_REMARK: 'Why are you reopening it? (required)',
  REOPENED: (po: string, n: number) => `PO ${po} reopened: it is in In Review with ${n} issue(s) to check.`,
  TAG: 'Reopened',
} as const

/** The backend's largest page; the lists load every PO in pages of this size. */
export const PO_REVIEW_MAX_PAGE_SIZE = 500
/** Most pages one list load reads (500 x 40 = 20,000 POs), so a runaway loop can never hang the screen. */
export const PO_REVIEW_MAX_PAGES = 40

/** Rows per page on the Processed and In Review tables (user, 2026-10-26). */
export const LIST_PAGE_SIZE = 50

/** Processed tab (2026-10-26): every PO by default; the date range is in the Filters panel. */
export const PROCESSED_FILTER = {
  FROM: 'Processed from',
  TO: 'Processed to',
  NONE: 'No processed POs yet.',
} as const

/**
 * Processed + In Review lists (2026-10-29, user): Newest / Oldest first from the PO Date and Processed At headers (no
 * date ranges), and "Sort by" Channel in the Filters panel (all POs of a channel together, A-Z; the header's order, else
 * the list's own, inside each channel).
 */
export const LIST_FILTER = {
  /** The PO Date column, and its one from - to range field in the Filters panel (Processed + In Review, 2026-11-03). */
  PO_DATE: 'PO Date',
  PROCESSED_AT: 'Processed At',
  SORT: 'Sort by',
  SORT_CHANNEL: 'Channel (grouped, A–Z)',
  /** What '' means on each tab (the server's order). */
  SORT_DEFAULT_PROCESSED: 'Newest processed first',
  SORT_DEFAULT_REVIEW: 'Oldest first (as they came in)',
  /** The chip of a header sort. */
  DATE_SORT: 'Sorted',
  DATE_SORT_OPTIONS: [
    { value: 'poDate:newest', label: 'PO Date, newest first' }, { value: 'poDate:oldest', label: 'PO Date, oldest first' },
    { value: 'processedAt:newest', label: 'Processed At, newest first' }, { value: 'processedAt:oldest', label: 'Processed At, oldest first' },
  ],
} as const
export const LIST_SORT = { CHANNEL: 'channel' } as const

/** Dates and times are shown in Indian time. */
export const DISPLAY_TIME_ZONE = 'Asia/Kolkata'

/** po_uploads.source -> the label the design uses. */
export const SOURCE_LABELS: Record<string, 'API' | 'Webhook' | 'Email' | 'Manual'> = {
  api: 'API',
  email: 'Email',
  manual: 'Manual',
}

/** po_issues.status */
export const ISSUE_STATUS = { OPEN: 'open' } as const

/** An accepted Address Mismatch needs a remark (backend REMARK_REQUIRED_ISSUE_TYPES, 2026-11-06). */
export const ADDRESS_REMARK = 'Write a remark: why ship from another warehouse than the PO is billed to'

/** po_issues.issue_type -> what the reviewer reads. */
export const ISSUE_LABELS: Record<string, string> = {
  OCR_ISSUE: 'OCR problem',
  DUPLICATE_PO: 'Duplicate PO',
  LOCATION_NOT_MAPPED: 'Location not mapped',
  SKU_NOT_MAPPED: 'SKU not mapped',
  PRICE_MISMATCH: 'Price mismatch',
  MRP_MISMATCH: 'MRP mismatch',
  QTY_MISMATCH: 'Qty mismatch',
  TOTAL_MISMATCH: 'Total mismatch',
  PO_EXPIRED: 'PO expired',
  OTHER: 'Other',
  // billed to one of our warehouses (its GSTIN), location mapped to another (2026-11-06)
  ADDRESS_MISMATCH: 'Address Mismatch',
}

/** po_issues.field_name of header issues -> the review panel field they belong to. */
export const ISSUE_FIELD = {
  DELIVERY_LOCATION: 'delivery_location',
  PO_NUMBER: 'po_number',
  EXPIRY_DATE: 'expiry_date',
  PO_TYPE: 'po_type',
  PO_VALUE: 'po_value',
} as const

/** Error codes the review panel acts on (POST_FG constants/errors.ts). */
export const REVIEW_ERROR = {
  /** Corrections sent, but issues are still open: details.openIssues lists them. */
  INCOMPLETE: 'REVIEW_INCOMPLETE',
  /** Someone else already resubmitted or rejected this PO. */
  NOT_IN_REVIEW: 'UPLOAD_NOT_IN_REVIEW',
} as const

/**
 * File types the in-app viewer shows (components/FileViewer, 2026-10-21, user: view every file without downloading).
 * SHEET is read by SheetJS 0.20.3 (vendor/xlsx-0.20.3.tgz), which goes by the bytes, so a CSV saved as ".XLS" still
 * opens. JSON is shown as tables (CSV-like). The rest are offered as a download.
 */
export const PREVIEW_TYPES = {
  PDF: ['pdf'],
  SHEET: ['xlsx', 'xlsm', 'xlsb', 'xls', 'csv', 'tsv', 'ods'],
  JSON: ['json'],
  HTML: ['html', 'htm'],
  IMAGE: ['png', 'jpg', 'jpeg', 'gif', 'webp'],
  TEXT: ['txt', 'xml', 'log', 'eml'],
} as const

/** Sheet / JSON tables: at most this many rows and columns are drawn (the rest are counted, not shown). */
export const FILE_VIEWER = { MAX_ROWS: 2000, MAX_COLS: 100, DETAILS: 'Details', RAW: 'Raw JSON' } as const

/** In-app file viewer texts. */
export const FILE_VIEWER_TEXT = {
  LOADING: 'Loading the file…',
  FAILED: 'Could not read this file here. Download it to view it.',
  EMPTY: 'This sheet is empty.',
  NO_MATCH: 'No rows match.',
  FIND: 'Find in this table…',
  CAPPED: (shown: number, total: number) => `Showing the first ${shown.toLocaleString('en-IN')} of ${total.toLocaleString('en-IN')} rows.`,
  ROWS: (n: number) => `${n.toLocaleString('en-IN')} row${n === 1 ? '' : 's'}`,
  SAVE_CSV: 'Download this table as CSV',
  DOWNLOAD: 'Download the original file',
  OPEN_TAB: 'Open in a new tab',
  CLOSE: 'Close (Esc)',
  CHILD_ROWS: (n: number) => `${n} row${n === 1 ? '' : 's'} →`,
  FIND_PDF: 'Find in this PDF…',
  FIND_TEXT: 'Find in this file…',
  FIND_IMAGE: 'Images cannot be searched',
  PDF_NO_TEXT: 'No text to search (scanned PDF)',
  SEARCHING: 'Searching…',
  NO_MATCHES: 'No matches',
  MATCH: (n: number, total: number) => `${n} of ${total}`,
  PREV: 'Previous match (Shift+Enter)',
  NEXT: 'Next match (Enter)',
} as const

/**
 * The page-by-page PDF viewer: zoom steps are multiples of "fit to width" (1 = the page fills the box's width);
 * padding is the gap in px around the page.
 */
export const PDF_VIEWER = { ZOOM_STEPS: [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 2.5, 3, 4], FIT: 1, PADDING: 16 } as const

/** The full-screen "View" opens PDFs at 50% of fit-to-width, so the whole page shows at once (user, 2026-10-21). */
export const FULL_SCREEN_PDF_ZOOM = 0.5

/** Search in the viewer: waits this long after the last key before searching. */
export const FIND_DEBOUNCE_MS = 250

/** Review panel texts. */
export const REVIEW_TEXT = {
  INTRO: 'Check the parsed fields against the original, resolve every issue and fill every field, then submit it for approval.',
  VIEW_ONLY: 'View only: ask an admin for editor access to submit or reject POs.',
  SUBMIT: 'Submit for approval',
  REJECT: 'Reject PO',
  /** Under a line's Qty / MRP / Rate box: the PO's own value, click = find it on the PO + copy (2026-11-05). */
  ON_PO: 'on PO',
  /** Combos / gift kits / M_Tools go to Uniware with their _S code when our master has it (2026-10-30). */
  PUNCHED_AS: (code: string) => `Punched as ${code}`,
  PUNCHED_AS_TIP: 'Combos, gift kits and M_Tools are punched in Uniware with their _S code (sale order CSV + PO Overview)',
  REJECT_PROMPT: 'Why is this PO rejected? (required, kept with the PO)',
  REMARK: 'Remark (optional, kept with the PO)',
  DUPLICATE_ONLY_REJECT: 'A duplicate PO can only be rejected.',
  NO_FILE: 'The PO file is not in S3.',
  NO_PREVIEW: 'This file type cannot be shown here. Download it to view it.',
  PDF_LOADING: 'Loading the PO file…',
  PDF_FAILED: 'Could not show the PO file here. Open it in a new tab or download it.',
  SUBMITTED: (po: string) => `PO ${po} sent for approval: it is now on the Approvals page.`,
  RETURNED: (at: string, reason: string) => `Sent back to review by the system on ${at}: ${reason}`,
  RESOLVED: 'Resolved',
  GONE: 'Someone else has just submitted or rejected this PO: it is no longer in review. Close this panel.',
  TO_RESOLVE: 'To resolve',
  REJECTED: (po: string) => `PO ${po} rejected.`,
} as const

/** Issue types that can only be rejected (never corrected or accepted). */
export const REJECT_ONLY_ISSUES = ['DUPLICATE_PO']
/** Price check (2026-10-30): decided by a click in the review panel (ours / the channel's). */
export const PRICE_ISSUES = { PRICE_MISMATCH: 'price', MRP_MISMATCH: 'mrp' } as Record<string, 'price' | 'mrp'>

/* ---- Approvals page: PO reviews waiting for an approver (2026-10-15) ---- */

export const APPROVALS_ENDPOINT = '/approvals/po-reviews'

/** Margin changes, two-layer approval (2026-11-06): Operations Manager (layer 1), then Admin (layer 2). */
export const MARGIN_ENDPOINT = '/approvals/margin-changes'
export const APPROVALS_VIEW = { PO: 'po', MARGIN: 'margin' } as const
export type ApprovalsView = (typeof APPROVALS_VIEW)[keyof typeof APPROVALS_VIEW]
export const MARGIN_TABS: { key: 'open' | 'applied' | 'rejected'; label: string }[] = [
  { key: 'open', label: 'Waiting' }, { key: 'applied', label: 'Applied' }, { key: 'rejected', label: 'Rejected' },
]
export const MARGIN_STATUS_LABEL: Record<string, string> = {
  pending_l1: 'Waiting layer 1 (Operations Manager)', pending_l2: 'Waiting layer 2 (Admin)', applied: 'Applied', rejected: 'Rejected',
}
export const MARGIN_TEXT = {
  VIEW_PO: 'PO reviews',
  VIEW_MARGIN: 'Margin changes',
  SUB: 'Margin % / rate changes and new channel SKUs: Operations Manager approves first, then Admin. Nothing changes in the master until both approve.',
  EMPTY: 'Nothing here.',
  KIND: { edit: 'Margin / rate change', add: 'New channel SKU' } as Record<string, string>,
  SOURCE: { masters: 'Masters page', price_check: 'Price check (PO approval)' } as Record<string, string>,
  APPROVE_L1: 'Approve (layer 1)',
  APPROVE_L2: 'Approve and apply (layer 2)',
  REJECT: 'Reject',
  REMARK: 'Remark (required to reject)',
  REMARK_NEEDED: 'Write why it is rejected',
  APPROVED_L1: (id: string) => `Request #${id} approved at layer 1: now waiting for an Admin.`,
  APPLIED: (id: string) => `Request #${id} approved at layer 2 and applied to the master.`,
  REJECTED: (id: string) => `Request #${id} rejected.`,
} as const

/** po_review_submissions.status shown as the page's tabs. */
export const APPROVAL_STATUS = { PENDING: 'pending', APPROVED: 'approved', REJECTED: 'rejected' } as const
export type ApprovalStatus = (typeof APPROVAL_STATUS)[keyof typeof APPROVAL_STATUS]
export const APPROVAL_TABS: { key: ApprovalStatus; label: string; danger?: boolean }[] = [
  { key: APPROVAL_STATUS.PENDING, label: 'Pending', danger: true },
  { key: APPROVAL_STATUS.APPROVED, label: 'Approved' },
  { key: APPROVAL_STATUS.REJECTED, label: 'Rejected' },
]
/** Rows per load of an Approvals tab. */
export const APPROVALS_PAGE_SIZE = 200
/** The sidebar's pending-approvals badge re-reads its count this often (and at once when the Approvals page changes). */
export const APPROVALS_BADGE_REFRESH_MS = 60_000

/** Names of the line fields a reviewer can change (po_review_submissions.fixes). */
export const FIX_FIELD_LABEL: Record<string, string> = { pepCode: 'Internal SKU', qty: 'Qty', mrp: 'MRP', rate: 'Rate' }

/** po_review_submissions.status when the system sent a PO back to In Review (it no longer passed at approval). */
export const SUBMISSION_RETURNED = 'returned'

export const APPROVAL_ERROR = {
  /** The PO no longer passed the checks when approved: it went back to In Review by itself. */
  RETURNED: 'REVIEW_RETURNED',
  NOT_PENDING: 'SUBMISSION_NOT_PENDING',
  /** A bulk approve holds approvals that update the master and the person has not confirmed it yet. */
  MASTER_NOT_CONFIRMED: 'MASTER_UPDATE_NOT_CONFIRMED',
} as const

/**
 * What kind of approval a submission is (POST_FG APPROVAL_KIND, 2026-11-02): from review = only this PO changes;
 * master update = a price check line changes our master (channel SKU rate / MRP) on approval. More kinds come later.
 */
export const APPROVAL_KIND = { REVIEW: 'review', MASTER_UPDATE: 'master_update' } as const
export type ApprovalKind = (typeof APPROVAL_KIND)[keyof typeof APPROVAL_KIND]
export const APPROVAL_KIND_LABEL: Record<ApprovalKind, string> = { review: 'From review', master_update: 'Master update' }

/** The Approvals Filters panel's keys = the list's query names (POST_FG APPROVAL_QUERY / PO_REVIEW_QUERY). */
export const APPROVAL_FILTER = { CHANNEL: 'channel', KIND: 'kind', ISSUE: 'issue', SUBMITTED_BY: 'submittedBy', FROM: 'from', TO: 'to', REOPENED: 'reopened' } as const
/** The Approval type filter's extra choice: only POs submitted after a reopen from Rejected (2026-11-03). */
export const APPROVAL_REOPENED_LABEL = 'Reopened (was rejected)'

/** Bulk approve / reject (POST_FG APPROVAL_BULK): up to MAX per call; each one decided like the single action. */
export const APPROVAL_BULK = {
  APPROVE: '/approvals/po-reviews/bulk-approve',
  REJECT: '/approvals/po-reviews/bulk-reject',
  MAX: 50,
} as const
export const APPROVAL_BULK_RESULT = { APPROVED: 'approved', REJECTED: 'rejected', RETURNED: 'returned', FAILED: 'failed' } as const

export const APPROVAL_TEXT = {
  SUB: 'PO reviews submitted by the reviewers wait here for an approver. Approving creates the PO, the sale order and the Uniware CSV.',
  APPROVE: 'Approve & create PO',
  REJECT: 'Reject',
  REJECT_PROMPT: 'Why is this PO rejected? (required)',
  APPROVE_REMARK: 'Note (optional)',
  APPROVED: (po: string, code: string) => `PO ${po} approved: sale order ${code}, Uniware CSV saved in S3.`,
  REJECTED: (po: string) => `PO ${po} rejected.`,
  VIEW_ONLY: 'Only admins and developers can approve or reject.',
  BULK_APPROVE: (n: number) => `Approve selected (${n})`,
  BULK_REJECT: (n: number) => `Reject selected (${n})`,
  BULK_APPROVE_TITLE: (n: number) => `Approve ${n} PO review(s)?`,
  BULK_APPROVE_SUB: 'Each one is approved exactly like Approve on its own: checks run again, then the PO, sale order and Uniware CSV are made.',
  BULK_MASTER_WARN: (n: number) => `${n} of them UPDATE THE MASTER when approved (the channel SKU's rate / MRP changes for every later PO of that channel):`,
  BULK_MASTER_CONFIRM: 'I checked these master changes: approve them too',
  BULK_REJECT_TITLE: (n: number) => `Reject ${n} PO review(s)?`,
  BULK_TOO_MANY: (max: number) => `Select at most ${max} at a time.`,
  BULK_DONE: (parts: string) => `Done: ${parts}.`,
} as const


/** Remarks are stored as varchar 500 (POST_FG PO_REVIEW_REMARK_MAX). */
export const PO_REVIEW_REMARK_MAX = 500

/** Live PO Review + Approvals (POST_FG REVIEW_LIVE): SSE at <base>/events, version for polling at <base>/live-state. */
export const REVIEW_LIVE = { EVENTS: '/events', STATE: '/live-state', EVENT_CHANGE: 'review', PO_REVIEW_BASE: '/po-review', APPROVALS_BASE: '/approvals' } as const

/* ---- Uniware hand-off on the Processed tab (2026-10-19): download the sale order CSV, then mark it uploaded ---- */
export const UNIWARE_ENDPOINT = {
  ONE: (uploadId: string) => `${PO_REVIEW_ENDPOINT}/${encodeURIComponent(uploadId)}/uniware-csv`,
  MANY: `${PO_REVIEW_ENDPOINT}/uniware-csv`,
  MARK: `${PO_REVIEW_ENDPOINT}/uniware-uploaded`,
} as const

/** Days waiting (since processed, not yet in Uniware): from WARN yellow, from CRIT red, before that grey (user, 2026-10-19). */
export const UNIWARE_AGE = { WARN_DAYS: 5, CRIT_DAYS: 10 } as const

export const UNIWARE_STATE = { PENDING: 'pending', DOWNLOADED: 'downloaded', UPLOADED: 'uploaded' } as const
export type UniwareState = (typeof UNIWARE_STATE)[keyof typeof UNIWARE_STATE]
/** The Uniware filter's options (labels the person sees). */
export const UNIWARE_STATE_LABEL: Record<UniwareState, string> = {
  pending: 'Not downloaded',
  downloaded: 'Downloaded, not in Uniware',
  uploaded: 'In Uniware',
}

export const UNIWARE_TEXT = {
  COLUMN: 'Uniware',
  NOT_DOWNLOADED: 'Not downloaded',
  NOT_DOWNLOADED_HINT: 'Sale order CSV not downloaded yet: tick the row and click "Download sale order CSV". Until it is in Uniware it does not show in PO Overview.',
  WAITING_UPLOAD: 'Not in Uniware',
  IN_UNIWARE: 'In Uniware',
  MARK_UPLOADED: 'Mark uploaded',
  AGE_HINT: 'Days since the PO was processed: yellow from 5 days, red from 10',
  SORT_HINT: 'Sort: ↓ waiting longest first (in Uniware last) · ↑ the reverse · click again to clear',
  DOWNLOADED_BY: 'Downloaded by',
  UPLOADED_BY: 'Marked uploaded by',
  BULK_DOWNLOAD: (n: number) => `Download sale order CSV (${n})`,
  BULK_MARK: (n: number) => `Mark uploaded (${n})`,
  DOWNLOADED: (n: number) => (n === 1 ? 'Sale order CSV downloaded. Upload it into Uniware, then click "Mark uploaded".' : `One CSV with ${n} sale orders downloaded. Upload it into Uniware, then mark them uploaded.`),
  MARKED: (n: number) => `${n} PO${n === 1 ? '' : 's'} marked uploaded into Uniware: now in PO Overview.`,
  UNDONE: (n: number) => `Upload mark removed from ${n} PO${n === 1 ? '' : 's'}: back to waiting, out of PO Overview.`,
  SUMMARY: (pending: number, downloaded: number) => `${pending} not downloaded · ${downloaded} downloaded, not in Uniware`,
} as const

/* ---- Line items download on the Processed tab (2026-10-26): every line of the ticked POs as CSV or Excel ---- */
/** POST_FG LINE_ITEMS: route + most POs per download (keeps it under ~2 s). */
export const LINE_ITEMS = {
  ENDPOINT: `${PO_REVIEW_ENDPOINT}/line-items`, MAX: 100, FILE: 'po_line_items', SHEET: 'Line items',
  /** In Review (2026-11-03): lines as read + their open issues. */
  REVIEW_ENDPOINT: `${PO_REVIEW_ENDPOINT}/review-line-items`, REVIEW_FILE: 'in_review_line_items', REVIEW_POS_FILE: 'in_review_pos',
} as const

export const LINE_ITEMS_TEXT = {
  /** The one Download button: its main click = the POs (the table) as Excel; line items under the arrow (user, 2026-10-26). */
  POS_BUTTON: (n: number) => `Download POs (${n})`,
  POS_HINT: 'Excel of the POs: the ticked ones, or all shown. Arrow: CSV, or the line items of these POs.',
  TABLE_BUTTON: 'Download',
  CSV: 'CSV',
  EXCEL: 'Excel',
  HINT: 'Excel with every line of these POs, one row per line (arrow: CSV, or the table). Read only: nothing is marked.',
  TABLE_ONLY_HINT: 'Excel of all rows shown, or only the ticked ones (arrow: CSV)',
  GROUP_LINES: (n: number, ticked: boolean) => `Line items of ${n} ${ticked ? 'ticked' : 'shown'} PO${n === 1 ? '' : 's'}`,
  GROUP_TABLE: (n: number, ticked: boolean) => `This table: ${n} ${ticked ? 'ticked' : 'shown'} row${n === 1 ? '' : 's'}`,
  TOO_MANY: (max: number, n: number, ticked: boolean) =>
    ticked
      ? `At most ${max} POs per line items download: ${n} ticked, untick ${n - max}.`
      : `${n} POs shown: line items go up to ${max} at a time. Filter (e.g. Processed from / to) or tick up to ${max} POs. The table itself is under the arrow.`,
  DONE: (pos: number, lines: number) => `${lines} line${lines === 1 ? '' : 's'} of ${pos} PO${pos === 1 ? '' : 's'} downloaded.`,
  S3_MISSING: (n: number) => ` ${n} PO${n === 1 ? '' : 's'}: the PO file could not be read, so EAN / MRP / rate / HSN / GST are empty there.`,
} as const


/** In Review: re-check after a master fix (2026-10-22; also automatic every 30 min and after a master load). */
export const RECHECK_TEXT = {
  BUTTON: 'Re-check now',
  BUSY: 'Re-checking…',
  HINT: "Checks every PO in review against today's master: problems fixed in the master close, POs with nothing left pass (sale order + CSV). Also runs by itself every 30 minutes and after a master load.",
  RESULT: (closed: number, passed: number, partly: number) =>
    closed || passed
      ? `Re-checked: ${closed} problem${closed === 1 ? '' : 's'} fixed in the master closed, ${passed} PO${passed === 1 ? '' : 's'} passed to Processed${partly ? `, ${partly} still need a review for something else` : ''}.`
      : 'Re-checked: nothing new fixed in the master yet.',
} as const

/** Failed + Rejected, many at once (2026-11-04). */
export const BULK_ENDED_TEXT = {
  MAX: 50,
  RETRY: (n: number) => `Try again (${n})`,
  RETRY_HINT: 'Each PO goes on from the step it failed at, one after another in the background. A PO that failed at the OCR is read by the OCR again (OCR cost, at most 3 tries). A PO that came again meanwhile is not made twice.',
  DISMISS: (n: number) => `Dismiss (${n})`,
  DISMISS_HINT: 'Off the Failed list, with who / when / why; nothing is deleted.',
  REOPEN: (n: number) => `Reopen (${n})`,
  REOPEN_HINT: 'Back to In Review, each with one issue to accept (like Reopen on one PO); then fixed and approved again.',
  REREAD: (n: number) => `Read again, no OCR (${n})`,
  REREAD_ONE: 'Read again (no OCR)',
  REREAD_HINT: 'Rebuilt from the OCR output we already stored, with today’s reader (after a reader fix), then checked again: no OCR cost. A PO without a stored OCR output needs Try again.',
  REREAD_QUEUED: (po: string) => `PO ${po} is being read again from its stored OCR output; it moves to Processed or stays here with its new issues.`,
  REMARK: 'Why (required)',
  GO: 'Go',
  CANCEL: 'Cancel',
  TOO_MANY: (max: number) => `At most ${max} at once: tick fewer.`,
  RESULT: (done: number, skipped: number, what: string) => `${done} ${what}${skipped ? `, ${skipped} not: ` : ''}`,
} as const
