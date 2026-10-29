/* PO review API (POST_FG GET /po-review): statuses, limits and how the screens show its values. */

export const PO_REVIEW_ENDPOINT = '/po-review'
/** The PO's original file, streamed from S3 (opens in a browser tab: PDF, sheet, an API's JSON). */
export const PO_FILE_PATH = (uploadId: string) => `${PO_REVIEW_ENDPOINT}/${encodeURIComponent(uploadId)}/file`

/** po_uploads.status values the screens ask for. */
export const PO_STATUS = {
  NEEDS_REVIEW: 'needs_review',
  COMPLETED: 'completed',
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

/* ---- Approvals page: PO reviews waiting for an approver (2026-10-15) ---- */

export const APPROVALS_ENDPOINT = '/approvals/po-reviews'

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
} as const

export const APPROVAL_TEXT = {
  SUB: 'PO reviews submitted by the reviewers wait here for an approver. Approving creates the PO, the sale order and the Uniware CSV.',
  APPROVE: 'Approve & create PO',
  REJECT: 'Reject',
  REJECT_PROMPT: 'Why is this PO rejected? (required)',
  APPROVE_REMARK: 'Note (optional)',
  APPROVED: (po: string, code: string) => `PO ${po} approved: sale order ${code}, Uniware CSV saved in S3.`,
  REJECTED: (po: string) => `PO ${po} rejected.`,
  VIEW_ONLY: 'Only admins and developers can approve or reject.',
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
export const LINE_ITEMS = { ENDPOINT: `${PO_REVIEW_ENDPOINT}/line-items`, MAX: 100, FILE: 'po_line_items', SHEET: 'Line items' } as const

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
