/*
 * D2C Internal Transfers (2026-11-03; POST_FG routes/d2c-transfers.routes.ts, constants/d2c-transfers.ts): warehouse to
 * warehouse stock transfers. Phase 3 = create / edit / cancel drafts, no Uniware calls yet (the SO / inward PO columns
 * stay empty until Phase 4-6). Transfers never show on PO Overview.
 */

const one = (id: string) => `/d2c-transfers/${encodeURIComponent(id)}`

export const D2C_ENDPOINT = {
  LIST: '/d2c-transfers',
  COUNTS: '/d2c-transfers/counts',
  EXPORT: '/d2c-transfers/export',
  OPTIONS: '/d2c-transfers/options',
  SKUS: '/d2c-transfers/skus',
  NEXT_REFERENCE: '/d2c-transfers/next-reference',
  TEMPLATE: '/d2c-transfers/template',
  EVENTS: '/d2c-transfers/events',
  CHANGES: '/d2c-transfers/changes',
  UPLOAD_PREVIEW: '/d2c-transfers/uploads/preview',
  UPLOAD_IMPORT: '/d2c-transfers/uploads/import',
  ONE: one,
  CANCEL: (id: string) => `${one(id)}/cancel`,
  EXPIRY: (id: string) => `${one(id)}/expiry`,
  /* Phase 5: Uniware sale orders. */
  STOCK_CHECK: '/d2c-transfers/stock-check',
  CREATE_SO: '/d2c-transfers/create-so',
  JOB: (jobId: string) => `/d2c-transfers/jobs/${encodeURIComponent(jobId)}`,
  CLOSE_SHORT: (id: string) => `${one(id)}/close-short`,
  /* Phase 6: the Uniware status sync. */
  SYNC: '/d2c-transfers/sync',
  SYNC_STATUS: '/d2c-transfers/sync-status',
  /* Phase 7: inward POs (one per dispatched invoice), GRN, variance reason. */
  INVOICES: '/d2c-transfers/invoices',
  CREATE_INWARD_PO: '/d2c-transfers/create-inward-po',
  VARIANCE_REASON: (invoiceId: string) => `/d2c-transfers/invoices/${encodeURIComponent(invoiceId)}/variance-reason`,
} as const

/** Sync status: how often the header re-reads it (faster while a run is going on). */
export const D2C_SYNC_POLL_MS = 60_000
export const D2C_SYNC_POLL_RUNNING_MS = 3_000

/** Raw Uniware package statuses (invoice list badge tone). */
export const D2C_PACKAGE_TONE: Record<string, 'ok' | 'warn' | 'crit' | 'info' | 'neutral' | 'primary'> = {
  CREATED: 'neutral', PICKING: 'neutral', PICKED: 'neutral', PACKED: 'info', READY_TO_SHIP: 'info', MANIFESTED: 'info', DISPATCHED: 'primary',
  SHIPPED: 'primary', DELIVERED: 'ok', CANCELLED: 'crit', RETURNED: 'warn', RETURN_EXPECTED: 'warn',
}

/** Sub-tabs (backend D2C_TAB): a transfer is in every tab where it has work, and always in Overview. */
export const D2C_TAB = {
  DRAFT: 'draft',
  SALE_ORDERS: 'sale_orders',
  CREATE_INWARD_PO: 'create_inward_po',
  INWARD_POS: 'inward_pos',
  OVERVIEW: 'overview',
} as const
export type D2cTab = (typeof D2C_TAB)[keyof typeof D2C_TAB]
export const D2C_TABS: { key: D2cTab; label: string }[] = [
  { key: D2C_TAB.DRAFT, label: 'Draft' },
  { key: D2C_TAB.SALE_ORDERS, label: 'Sale orders' },
  { key: D2C_TAB.CREATE_INWARD_PO, label: 'Create inward PO' },
  { key: D2C_TAB.INWARD_POS, label: 'Inward POs' },
  { key: D2C_TAB.OVERVIEW, label: 'Overview' },
]

/** master_purchase_orders.transferStage (backend D2C_STAGE). */
export const D2C_STAGE = {
  DRAFT: 'draft',
  SALE_ORDER: 'sale_order',
  PACKED: 'packed',
  READY_TO_SHIP: 'ready_to_ship',
  INVOICED: 'invoiced',
  PARTLY_DISPATCHED: 'partly_dispatched',
  DISPATCHED: 'dispatched',
  INWARD_PO_CREATED: 'inward_po_created',
  GRN: 'grn',
  CLOSED: 'closed',
  CANCELLED: 'cancelled',
} as const

export const D2C_STAGE_LABEL: Record<string, string> = {
  draft: 'Draft', sale_order: 'Sales order', packed: 'Packed', ready_to_ship: 'Ready to ship', invoiced: 'Invoice created',
  partly_dispatched: 'Partly dispatched', dispatched: 'Dispatched', inward_po_created: 'Inward PO created', grn: 'GRN', closed: 'Closed',
  cancelled: 'Cancelled',
}
export const D2C_STAGE_TONE: Record<string, 'ok' | 'warn' | 'crit' | 'info' | 'neutral' | 'primary'> = {
  draft: 'neutral', sale_order: 'info', packed: 'info', ready_to_ship: 'info', invoiced: 'info', partly_dispatched: 'warn', dispatched: 'primary',
  inward_po_created: 'primary', grn: 'ok', closed: 'ok', cancelled: 'crit',
}

/** The 8 stages of the PRD's progress timeline, in order. */
export const D2C_PROGRESS: readonly string[] = [
  D2C_STAGE.DRAFT, D2C_STAGE.SALE_ORDER, D2C_STAGE.PACKED, D2C_STAGE.READY_TO_SHIP, D2C_STAGE.INVOICED, D2C_STAGE.DISPATCHED,
  D2C_STAGE.INWARD_PO_CREATED, D2C_STAGE.GRN,
]
/** Who sets each stage (the PRD's source tags). */
export const D2C_PROGRESS_BY: Record<string, string> = {
  draft: 'TOOL', sale_order: 'TOOL · API', packed: 'UNIWARE', ready_to_ship: 'UNIWARE', invoiced: 'UNIWARE', dispatched: 'UNIWARE',
  inward_po_created: 'TOOL · API', grn: 'UNIWARE',
}
/** Log actions that mark a stage being reached, besides `stage_changed` (its new value = the stage). */
export const D2C_STAGE_ACTION: Record<string, string> = {
  draft: 'created', sale_order: 'so_created', inward_po_created: 'inward_po_created', grn: 'grn_received',
}

/** Where a transfer came from (the source of its `created` log). */
export const D2C_SOURCE_LABEL: Record<string, string> = { screen: 'Form', bulk_csv: 'Upload' }

/** Sale order request state (soState); null = not asked yet. */
export const D2C_SO_STATE_LABEL: Record<string, string> = { requested: 'Requested', created: 'Created', failed: 'Failed', unknown: 'Checking in Uniware' }
export const D2C_SO_NOT_CREATED = 'Not created'
/** Still requested / unknown after d2c:settings.soNotFoundHours (24 h). */
export const D2C_SO_NOT_FOUND = 'Not found in Uniware'
export const D2C_SO_STATE = { REQUESTED: 'requested', CREATED: 'created', FAILED: 'failed', UNKNOWN: 'unknown' } as const
/** Stages before anything left the dispatch warehouse: a transfer with an SO can still be cancelled. */
export const D2C_UNDISPATCHED: readonly string[] = ['draft', 'sale_order', 'packed', 'ready_to_ship', 'invoiced']
/** Create SO job: how often the screen asks for progress; transfers per request (backend D2C_SO_JOBS.MAX_IDS). */
export const D2C_SO_JOB_POLL_MS = 1000
export const D2C_SO_MAX_IDS = 200
/** Inward POs (phase 7): invoices per create request (backend D2C_INWARD_PO.MAX_IDS); request state labels; job results. */
export const D2C_INWARD_MAX_IDS = 200
export const D2C_INWARD_STATE_LABEL: Record<string, string> = { requested: 'Requested', created: 'Created', failed: 'Refused', unknown: 'Checking in Uniware' }
/** The PO was cancelled in Uniware (no GRN): the invoice is back in Create inward PO; the next create takes a new number. */
export const D2C_INWARD_CANCELLED = 'Cancelled in Uniware'
export const D2C_INWARD_OUTCOME_LABEL: Record<string, string> = { created: 'Inward PO created', failed: 'Refused by Uniware', unknown: 'No clear answer: checking', skipped: 'Not sent' }
/** Uniware PO statuses (raw): CREATED = waiting for the warehouse to approve it in Uniware. */
export const D2C_PO_STATUS_TONE: Record<string, 'ok' | 'warn' | 'crit' | 'info' | 'neutral' | 'primary'> = {
  CREATED: 'neutral', WAITING_FOR_APPROVAL: 'warn', APPROVED: 'info', PARTIALLY_RECEIVED: 'info', COMPLETE: 'ok', CLOSED: 'ok', CANCELLED: 'crit',
}
/** Variance reason (po_invoices.variance_reason): one per GRN-complete invoice with received != dispatched. */
export const D2C_VARIANCE_REASON = { SHORT_RECEIVED: 'short_received', DAMAGED: 'damaged', EXCESS: 'excess', OTHER: 'other' } as const
export const D2C_VARIANCE_REASON_LABEL: Record<string, string> = { short_received: 'Short received', damaged: 'Damaged', excess: 'Excess received', other: 'Other' }
export const D2C_VARIANCE_NOTE_MAX = 1000

/** Result of one transfer in a create-SO job. */
export const D2C_SO_OUTCOME_LABEL: Record<string, string> = { created: 'SO created', failed: 'Refused by Uniware', unknown: 'No clear answer: checking', skipped: 'Not sent' }

export const D2C_PRIORITIES = ['P1', 'P2', 'P3'] as const
export const D2C_DEFAULT_PRIORITY = 'P2'
export const D2C_PRIORITY_TONE: Record<string, 'crit' | 'warn' | 'neutral'> = { P1: 'crit', P2: 'warn', P3: 'neutral' }

/** Rows per request (backend default 100, at most 500). */
export const D2C_PAGE_SIZE = 100
/** Upload: .csv only, at most 2 MB (backend D2C_LIMITS). */
export const D2C_UPLOAD_MAX_BYTES = 2 * 1024 * 1024
export const D2C_REASON_MAX = 500
export const D2C_REMARKS_MAX = 1000

/** Backend error codes the screen branches on. */
export const D2C_ERROR = {
  STALE: 'D2C_STALE', NOT_EDITABLE: 'D2C_NOT_EDITABLE', INVALID: 'D2C_INVALID', NO_MAPPING: 'D2C_NO_MAPPING',
  NOT_LIVE: 'D2C_NOT_LIVE', TEST_ONLY: 'D2C_TEST_ONLY', TEST_ONLY_CHANGE: 'D2C_TEST_ONLY_CHANGE', IN_FLIGHT: 'D2C_IN_FLIGHT', UNIWARE_REFUSED: 'D2C_UNIWARE_REFUSED', UNIWARE_DOWN: 'D2C_UNIWARE_DOWN', JOB_NOT_FOUND: 'D2C_JOB_NOT_FOUND',
  RESYNC_FORBIDDEN: 'D2C_RESYNC_FORBIDDEN', INVOICE_NOT_FOUND: 'D2C_INVOICE_NOT_FOUND', TOO_MANY_INVOICES: 'D2C_TOO_MANY_INVOICES',
} as const

/** Filter keys = the API's query names (stage, source and expired are turned from labels into values). */
export const D2C_FILTER = {
  STAGE: 'stage', PRIORITY: 'priority', SENDER: 'sender', RECEIVING: 'receiving', DATE_FROM: 'dateFrom', DATE_TO: 'dateTo',
  SOURCE: 'source', CHANNEL: 'channel', TYPE: 'type', EXPIRED: 'expired',
} as const
export const D2C_EXPIRED_OPTION = { YES: 'Expired', NO: 'Not expired' } as const

export const D2C_EXPORT_LEVEL = { PO: 'po', SKU: 'sku' } as const
/** Export columns that hold numbers (the Excel file keeps them as numbers). */
export const D2C_EXPORT_NUMBERS: ReadonlySet<string> = new Set([
  'SKUs', 'Total qty', 'Updated qty', 'Dispatched', 'Received', 'Open balance', 'GMV', 'PO Value', 'Qty', 'Cancelled',
])

/** History: how each log action reads (POST_FG SHIPMENT_LOG_ACTION). */
export const D2C_ACTION_LABEL: Record<string, string> = {
  created: 'Created', field_changed: 'Changed', stage_changed: 'Stage changed', so_requested: 'Sale order requested', so_created: 'Sale order created',
  so_failed: 'Sale order refused', stock_warning: 'Stock warning', cancelled: 'Cancelled', balance_closed: 'Balance closed', expiry_changed: 'Expiry changed',
  line_added: 'SKU line added', line_removed: 'SKU line removed', invoice_seen: 'Invoice seen', inward_po_requested: 'Inward PO requested',
  inward_po_created: 'Inward PO created', inward_po_failed: 'Inward PO refused', grn_received: 'GRN received', variance_reason: 'Variance reason',
  sync_error: 'Sync error',
}
/** Header fields as people read them in the history. */
export const D2C_FIELD_LABEL: Record<string, string> = {
  facility: 'Dispatch WH', channel: 'Channel', location: 'Location', customerCode: 'Customer code', poDate: 'PO date', transferPriority: 'Priority',
  transferType: 'Type', labelsLink: 'PO expiry', specialRemarksCOPT: 'Remarks', poNumber: 'Reference ID', transferStage: 'Stage', qty: 'Qty',
  /* written by the Uniware sync (phase 6) */
  dispatchDate: 'Dispatch date', rtsDate: 'RTS date', invoiceChallanNumber: 'Invoice no.', dispatchedQty: 'Dispatched', updatedQty: 'Updated qty',
  packageStatus: 'Package status', balanceClosedReason: 'Balance closed', syncError: 'Sync error', soState: 'Sale order',
  /* inward PO + GRN (phase 7) */
  inwardPoCode: 'Inward PO', inwardPoState: 'Inward PO request', inwardPoStatus: 'Inward PO status (Uniware)', poNumberInwardCWH: 'Inward POs',
  grnCodes: 'GRN', grnCompletedAt: 'GRN complete', channelInwardingQuantity: 'Received', deliveryDate: 'GRN date', varianceReason: 'Variance reason',
}

export const D2C_TEXT = {
  TITLE: 'D2C Internal Transfers',
  SUB: 'Warehouse-to-warehouse transfers: draft → sale order → dispatch → inward PO → GRN. Sorted by priority, then oldest PO date.',
  UNIWARE_PENDING: 'Uniware: not connected yet',
  UNIWARE_PENDING_HINT: 'Inward POs are created from the Create inward PO tab; GRNs are read from Uniware by the sync.',
  UNIWARE_LIVE: 'Uniware: live',
  UNIWARE_LIVE_HINT: 'Sale orders are created, cancelled and closed short in Uniware from this screen.',
  SYNC_NEVER: 'Uniware · not synced yet',
  SYNC_AGO: (min: number) => (min < 1 ? 'Uniware · synced just now' : min < 60 ? `Uniware · synced ${min} min ago` : `Uniware · synced ${Math.floor(min / 60)} h ${min % 60} min ago`),
  SYNC_RUNNING: 'Uniware · syncing…',
  SYNC_FAILED: 'Uniware · last sync failed',
  SYNC_HINT: (every: number) => `Packages, invoices, dispatches, Uniware cancellations, inward PO status and GRNs are read from Uniware every ${every} min (read only). Sync now reads them at once.`,
  SYNC_OFF_HINT: 'The timed sync is off on this server: only Sync now reads Uniware.',
  SYNC_NOW: 'Sync now',
  SYNC_QUEUED: 'A sync is running: yours starts right after it',
  NO_INVOICES: 'No package or invoice in Uniware yet',
  UNIWARE_TEST_ONLY: 'Uniware: test warehouses only',
  UNIWARE_TEST_ONLY_HINT: (facilities: string) => `Not live yet: Create SO, Cancel and Close short reach Uniware only for ${facilities || 'no warehouse'}. Everything else works as usual.`,
  TEST_MODE_BANNER: 'Local test mode – only TEST_FACILITY',
  TEST_MODE_HINT: 'This server runs in local test mode (D2C_TEST_ONLY): only transfers whose dispatch AND receiving warehouse are test warehouses (TEST_FACILITY) can be created, changed or sent to Uniware; real transfers are read only and the in-transit report gets no D2C transfers from here.',
  TEST_MODE_NOT_SENT: 'Local test mode: only transfers between test warehouses (TEST_FACILITY) reach Uniware.',
  NOT_LIVE: (facilities: string) => `Uniware changes are switched off until D2C transfers go live. Only these test warehouses can be used now: ${facilities || 'none'}.`,
  STOCK_FORMULA: 'Available = inventory − open sale − blocked inventory (never below 0), at the dispatch warehouse, read live from Uniware.',
  STOCK_SHORT: 'Not enough stock: Uniware may leave part of the order unfulfillable. You can still go on.',
  STOCK_SHORT_TOGETHER: 'Enough for this transfer alone, not for all selected transfers together',
  CREATE_SO_HELP: 'Each transfer is sent on its own. A refused one stays a draft you can fix and send again; the same SO number is reused, so Uniware never gets it twice.',
  CLOSE_SHORT_HELP: 'Every sale order line still open in Uniware is cancelled. Lines Uniware cancels are cut to what was dispatched; lines it refuses (e.g. already packed) stay as they are and are listed.',
  CANCEL_WITH_SO: 'Its sale order lines are cancelled in Uniware first; if Uniware refuses, nothing changes here.',
  SEARCH: 'Search transfer ID, reference, SO, invoice, SKU…',
  EXPIRED: 'Expired',
  EXPIRED_HINT: 'PO expiry date passed with units still open: close short or extend the expiry (nothing happens by itself)',
  EXPIRED_PROMPT: 'This PO has expired with units still open. Close it short or extend the expiry date.',
  REFERENCE_NOTE: 'may change on save',
  NO_ROUTE: (sender: string, location: string) => `No route from ${sender} to ${location}: add it in Masters → Transfer Routes`,
  ROUTE_OFF: 'This route is switched off in Masters → Transfer Routes',
  PICK_CHANNEL: 'This route has more than one Uniware channel: pick the one to use',
  CHANNELS_HINT: 'Route with 2+ Uniware channels: the file needs the "Uniware Channel" column',
  MISSING_VENDOR: 'Vendor code missing on this route: the inward PO cannot be created until it is filled in Masters',
  MISSING_CUSTOMER: 'Customer code missing on this route: the sale order cannot be created until it is filled in Masters',
  MISSING_CHANNEL: 'Uniware channel code missing on this route: the sale order cannot be created until it is filled in Masters',
  RECEIVING_OFF: 'The receiving warehouse is inactive or not allowed for internal transfers (Masters → Warehouses)',
  SAME_WH: 'Dispatch and receiving warehouse are the same',
  STALE: 'Someone changed this transfer since you opened it. Load the latest values and make your change again.',
  CREATE_INWARD_PO_HELP: 'One inward PO per dispatched invoice, made at the receiving warehouse (vendor = the route\'s vendor code, unit price 1, qty = what was dispatched on that invoice). The warehouse approves it in Uniware. PO date = today; pick when the warehouse should receive it. A refused one can be sent again with the same PO number.',
  INWARD_EMPTY: 'No dispatched invoice is waiting for an inward PO.',
  INWARD_POS_EMPTY: 'No inward PO is open.',
  VENDOR_MISSING: 'Vendor missing',
  PO_APPROVAL: 'Waiting for the warehouse to approve it in Uniware',
  VARIANCE_HELP: 'Received is not equal to dispatched on this invoice. Say why: the transfer closes once every variance has a reason. A saved reason can be changed later; every change is kept in the history.',
  GRN_PENDING: 'GRN not complete yet',
  UPLOAD_HELP: 'One row per SKU line. Rows with the same Group make one transfer; rows without a group are combined when dispatch, receiving, date and priority match. Import is all or nothing.',
} as const

/** Inward PO dates (user, 2026-11-12): PO date = the day it is created; expiry = PO date + this many days (as the backend). */
export const D2C_INWARD_EXPIRY_DAYS = 15
/** "Receive by" offered in the Create inward PO dialog: today + this many days (any day from today to the expiry). */
export const D2C_RECEIVE_BY_DEFAULT_DAYS = 7
