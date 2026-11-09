/* PO Overview API (POST_FG routes/po-overview.routes.ts): endpoints, paging, query names. */

export const PO_OVERVIEW_ENDPOINT = {
  SHIPMENTS: '/po-overview/shipments',
  SHIPMENT: (uid: string) => `/po-overview/shipments/${encodeURIComponent(uid)}`,
  LINES: '/po-overview/lines',
  FILTER_OPTIONS: '/po-overview/filter-options',
  COLUMNS: '/po-overview/columns',
  HISTORY: (uid: string) => `/po-overview/shipments/${encodeURIComponent(uid)}/history`,
  EDIT_OPTIONS: '/po-overview/edit-options',
  EVENTS: '/po-overview/events',
  CHANGES: '/po-overview/changes',
  /** Uniware sale order status (2026-11-06): GET last run, POST Sync now. */
  UNIWARE_SYNC: '/po-overview/uniware-sync',
} as const

/** Rows per request (the backend's default; PEPIMS loads 200 at a time). */
export const PO_OVERVIEW_PAGE_SIZE = 200

/** Wait this long after typing before searching. */
export const SEARCH_DELAY_MS = 350

/** notAssigned=<value>: dates still empty. */
export const NOT_ASSIGNED_DATES = ['workingDate', 'dispatchDate', 'appointmentDate', 'rtsDate'] as const

/** The first tab of the Shipment Status: every column, view only. */
export const OVERVIEW_TAB = { KEY: 'overview', LABEL: 'Overview' } as const

/** Shown under the team tabs for a facility-limited person (warehouse / logistics). */
export const FACILITY_SCOPE_NOTE = {
  /** A tab where the person edits; the Facility filter is exactly their facilities. */
  MINE: (codes: string[]) => `Showing your facilities (${codes.join(', ')}). You can edit the rows marked ✎. Clear the Facility filter to see other warehouses, read only.`,
  /** A tab where the person edits; the filter was cleared or changed, so other warehouses' rows are on screen too. */
  OTHERS: (codes: string[]) => `Showing more than your facilities. You can edit only ${codes.join(', ')} (the rows marked ✎).`,
  /** A view-only tab (another team's), filtered to the person's facilities. */
  VIEW_MINE: (codes: string[]) => `Showing your facilities (${codes.join(', ')}).`,
  /** A view-only tab, filter cleared or changed. */
  VIEW_OTHERS: 'Showing all warehouses.',
  NONE: 'No facility is given to you yet: you can view shipments but not edit them.',
  SHOW_MINE: 'Show only mine',
} as const

/**
 * The status popup (2026-11-06, user: "same status as PEPIMS, a pop up with all the statuses"): PEPIMS's ⓘ at the row's
 * end opens "Final Status - PO: …" with the three stages and the final status. An empty stage counts as Confirmed (as
 * PEPIMS and our backend's STATUS_WHEN_EMPTY); a combination with no row in the final status master = NO_MAPPING.
 */
export const STATUS_POPUP = {
  COLUMN: 'Status',
  TITLE: (po: string) => `Final Status - PO: ${po}`,
  OPEN: 'See all statuses',
  WHEN_EMPTY: 'Confirmed',
  EMPTY_NOTE: 'not set, counts as Confirmed',
  NO_MAPPING: 'No mapping available!',
  FINAL: 'Final Status',
  STAGES: [
    { key: 'statusPlanning', label: 'Status (Planning)' },
    { key: 'statusWarehouse', label: 'Status (Warehouse)' },
    { key: 'statusLogistics', label: 'Status (Logistics)' },
  ],
  CLOSE: 'Close',
} as const

/** The Uniware sale order sync (2026-11-06): every 30 min on the server, read-only on Uniware. */
export const UNIWARE_SYNC_TEXT = {
  BUTTON: 'Sync from Uniware',
  RUNNING: 'Syncing…',
  NEVER: 'Uniware: not synced yet',
  AGO: (min: number) => `Uniware · synced ${min === 0 ? 'just now' : `${min} min ago`}`,
  STARTED: 'Reading the sale orders from Uniware: rows update as it goes.',
  FAILED: (why: string) => `Uniware sync: ${why}`,
  HINT: 'Reads the sale order of each PO from Uniware (read-only): Warehouse status forward, RTS / dispatch dates and invoice when empty.',
  /** The button is shared by the whole team: once per 30 min (2026-11-09). */
  WAIT: (min: number) => `Next sync in ${min} min`,
  WAIT_HINT: (by: string | null, at: string) => `Synced from this button${by ? ` by ${by}` : ''} at ${at}. The button works once every 30 minutes for the whole team; the server also syncs every 30 minutes by itself.`,
} as const
export const UNIWARE_SYNC_REFRESH_MS = 30_000

/** Group header labels of the grid. */
export const COLUMN_GROUP_LABEL = { KEY: 'PO', SHIPMENT: 'Shipment' } as const

/*
 * Live updates (self-healing): SSE first; when no message (not even the server's 25 s ping) arrives for
 * LIVE_SILENT_MS, or the connection errors, the screen polls "changes since" every LIVE_POLL_MS until SSE is back.
 * Hidden tabs don't poll; they catch up when shown again.
 */
export const LIVE_SILENT_MS = 60_000
export const LIVE_POLL_MS = 60_000
export const LIVE_WATCHDOG_MS = 10_000
/** How long a row changed by someone else stays highlighted. */
export const LIVE_FLASH_MS = 2_500
/** SSE event names (POST_FG constants LIVE). */
export const LIVE_EVENT = { SHIPMENT: 'shipment', PING: 'ping' } as const
/** Action of a new shipment (lists reload instead of a row swap). */
const CREATED_ACTION = 'created'
/** Actions that add a shipment to PO Overview or take it out (uploaded into Uniware / mark removed): lists reload. */
export const LIST_ACTIONS: readonly string[] = [CREATED_ACTION, 'uniware_uploaded', 'uniware_upload_undone']

/** History: how each shipment_logs action and source reads on screen (POST_FG SHIPMENT_LOG_ACTION / _SOURCE). */
export const LOG_ACTION_LABEL: Record<string, string> = {
  created: 'Created the shipment',
  field_changed: 'Updated',
  bulk_update: 'Bulk update',
  line_qty_requested: 'Requested a line quantity change',
  line_qty_approved: 'Approved a line quantity change',
  line_qty_rejected: 'Rejected a line quantity change',
  uniware_uploaded: 'Uploaded to Uniware',
  uniware_upload_undone: 'Uniware upload mark removed',
}
export const LOG_SOURCE_LABEL: Record<string, string> = {
  screen: 'PO Overview',
  bulk_csv: 'Bulk CSV',
  pipeline: 'Email pipeline',
  review: 'PO Review',
  script: 'Script',
}

