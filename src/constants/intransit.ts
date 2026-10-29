/*
 * In-transit stock (Demand Planning > In-transit Stock, Inventory Calculation's data). Backend: POST_FG
 * src/routes/intransit.routes.ts.
 */

export const INTRANSIT_ENDPOINT = '/intransit'

/** How often a queued / running build or fetch is re-read. */
export const INTRANSIT_POLL_MS = 3000

export const RUN_STATUS = { QUEUED: 'queued', RUNNING: 'running', SUCCEEDED: 'succeeded', FAILED: 'failed' } as const
export type RunStatus = (typeof RUN_STATUS)[keyof typeof RUN_STATUS]

export const RUN_STATUS_LABEL: Record<RunStatus, string> = { queued: 'Queued', running: 'Running', succeeded: 'Done', failed: 'Failed' }
export const RUN_STATUS_TONE: Record<RunStatus, 'info' | 'warn' | 'ok' | 'crit'> = { queued: 'info', running: 'warn', succeeded: 'ok', failed: 'crit' }

export const SOURCES = ['amazon', 'uniware', 'flipkart', 'myntra'] as const
export type Source = (typeof SOURCES)[number]

/** Shipment_Status / PO_Format: read from PEPIMS's tracker when the report is built (POST_FG PEPIMS_CONNECTOR). */
export const PEPIMS_CONNECTOR = 'pepims'
export const PEPIMS_TEXT = {
  LABEL: 'PEPIMS',
  ON: 'Read when you build (last 90 days)',
  FILE: 'read from PEPIMS when you build',
  STEP: 'Reading POs from PEPIMS',
} as const

/** What each connector fetches, and the one-export choices it takes ("only"). */
export const SOURCE_INFO: Record<Source, { label: string; sub: string; only: { key: string; label: string }[] }> = {
  amazon: {
    label: 'Amazon SP-API',
    sub: 'Amazon_SOH.csv (FBA ledger, latest full day) and Amazon_GRN.csv (inbound shipments of Shipment_Status). A few minutes.',
    only: [{ key: 'soh', label: 'SOH only' }, { key: 'grn', label: 'GRN only' }],
  },
  uniware: {
    label: 'Uniware',
    sub: 'Export-B2B Sale Orders, Purchase_Order and Export-Inventory Snapshot, one export per facility. Can take up to an hour.',
    only: [{ key: 'b2b', label: 'B2B Sale Orders only' }, { key: 'po', label: 'Purchase Orders only' }, { key: 'inventory', label: 'Inventory Snapshot only' }],
  },
  // the Seller Hub robot (POST_FG sources/flipkart-seller-hub.ts, 2026-10-28): a headless browser, OTP read from the intake mailbox
  flipkart: {
    label: 'Flipkart Seller Hub',
    sub: 'FK_SOH.csv (Current Inventory) and FK_GRN.csv (Bulk Consignment File), downloaded from Seller Hub by a robot. About 2 minutes.',
    only: [{ key: 'soh', label: 'SOH only' }, { key: 'grn', label: 'GRN only' }],
  },
  // the Partner Portal robot (POST_FG sources/myntra-partner-portal.ts, 2026-10-28): email + password login, team PARTNER_SELLER
  myntra: {
    label: 'Myntra Partner Portal',
    sub: 'Myntra_GRN.csv (Lot View, last year) and Myntra_SOH.csv (Seller_Inventory_Report, prepared by Myntra), downloaded by a robot. About 5 minutes.',
    only: [{ key: 'soh', label: 'SOH only' }, { key: 'grn', label: 'GRN only' }],
  },
}

/** Combo check files next to each report (POST_FG COMBO_CHECK) and the Reports tab that shows them. */
export const COMBO_FILES = { ALERT: 'combos_not_in_split1.csv', SPLIT1_ROWS: 'split1_rows_to_add.csv' } as const
export const COMBO_TAB = 'combos'
/** Most units of one component in a combo (POST_FG SPLIT1.MAX_QTY). */
export const SPLIT1_MAX_QTY = 50

/** Report sheets shown as tables on the Reports tab (exact sheet names in the workbook), after the Summary. */
export const REPORT_TABLES = ['Sheet35(2)', 'Full_Shipment_Enhanced', 'Final Sheet35(2)'] as const
/** The names the page shows for them (user, 2026-10-28); the sheet names above stay as the workbook has them. */
export const REPORT_TABLE_LABEL: Record<(typeof REPORT_TABLES)[number], string> = {
  'Sheet35(2)': 'SKU × Location',
  Full_Shipment_Enhanced: 'Full_Shipment_Enhanced',
  'Final Sheet35(2)': 'Final Stock',
}

export const INTRANSIT_TABS = [
  { key: 'run', label: 'Daily run' },
  { key: 'history', label: 'History' },
  { key: 'masters', label: 'Masters' },
] as const
export type IntransitTab = (typeof INTRANSIT_TABS)[number]['key']

export const INTRANSIT_TEXT = {
  TITLE: 'In-transit Stock',
  SUB: "Bring each day's files together and build the in-transit report. The latest report feeds Inventory Calculation.",
  NO_REPORT: 'No in-transit report has been built yet. Build one in Demand Planning > In-transit Stock.',
  NO_DRR: 'DRR, days of cover and Δ WoW need sales-rate data, which the in-transit report does not have yet.',
  /** Inventory Calculation's banner when the asked day has no final build (user, 2026-10-26). */
  LATEST_MISSING: (requested: string, shown: string, runId: string) =>
    `There is no final build for ${requested} yet. Showing the last successful build: ${shown} (report #${runId}).`,
  OFFLINE: 'The server could not be reached: showing the copy saved in this browser.',
  HIDDEN_ROWS: (n: number) => `${n.toLocaleString('en-IN')} rows marked Consider? = No are hidden.`,
  NOT_IN_MASTER: 'not in master',
} as const

/** CSV viewer: rows per page (server max 500) and the pause before a search is sent. */
export const CSV_VIEWER_PAGE = 100
export const CSV_SEARCH_DELAY_MS = 300

/** Files in a picked / dropped folder that are never inputs: OS files, Office lock files, hidden files. */
export const IGNORED_FILE_RE = /^(\.|~\$)|^(thumbs\.db|desktop\.ini)$/i

/** SKU × Facility columns: the report's channel types, in the design's order (any other type follows). */
export const FACILITY_COLUMNS: { type: string; label: string }[] = [
  { type: 'GGNMWH', label: 'GGN MWH' },
  { type: 'MUMMWH', label: 'MUM MWH' },
  { type: 'DarkStore', label: 'DarkStore' },
  { type: 'D2C', label: 'D2C' },
  { type: 'Return', label: 'Return' },
  { type: 'B2C', label: 'B2C (marketplaces)' },
]
