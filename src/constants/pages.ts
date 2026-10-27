import { MASTER_TABS } from '../lib/data'

/*
 * Sidebar groups and pages. Every path is a backend page key (POST_FG src/constants/auth.ts PAGES): /auth/me returns
 * the user's access for each of them.
 */

export type NavItem = { path: string; label: string }
export type NavGroup = { key: string; label: string; items: NavItem[] }

export const PATHS = {
  LOGIN: '/login',
  MASTERS: '/masters',
  PEP_SKUS: '/masters/pep-skus',
  CHANNEL_SKUS: '/masters/channel-skus',
  CHANNEL_CUSTOMERS: '/masters/channel-customers',
  CHANNEL_LOCATIONS: '/masters/channel-locations',
  WAREHOUSES: '/masters/warehouses',
  OPERATIONS: '/operations',
  PO_OVERVIEW: '/operations/po-overview',
  PO_REVIEW: '/operations/po-review',
  PO_WORKING: '/operations/po-working',
  /** Amazon inbound plans + FBA shipments (2026-10-19). */
  AMAZON_INBOUND: '/operations/amazon-inbound',
  SKUS_SHORT: '/operations/skus-short',
  OPS_ANALYTICS: '/operations/analytics',
  PLANNING: '/planning',
  INVENTORY: '/planning/inventory',
  DRR_AGING: '/planning/drr-aging',
  PLANNING_ANALYTICS: '/planning/analytics',
  APPROVALS: '/approvals',
  /** Users & Roles (2026-10-15): backend page key /admin (admin / developer). */
  ADMIN: '/admin',
} as const

/**
 * Pages whose data comes from the API. Every other page still shows the design's sample data, and in dev it is tinted
 * amber with a "Dummy data" strip (see .dummy-data in index.css). Add a page here once it is wired to the backend.
 */
export const LIVE_PAGES: ReadonlySet<string> = new Set<string>([
  PATHS.PO_REVIEW, // Processed tab live; In Review and Manual Upload still marked inside the page
  PATHS.ADMIN, // GET /admin/users + /admin/roles
  PATHS.APPROVALS, // GET /approvals/po-reviews (PO reviews only; other approval types not built, hidden)
  PATHS.PEP_SKUS, // GET /masters/pep-skus; fields with no DB column show NOT_IN_DB
  PATHS.CHANNEL_SKUS, // GET /masters/channel-skus; status has no DB column (NOT_IN_DB)
  PATHS.PO_OVERVIEW, // GET /po-overview/shipments + /lines + /filter-options (our POs)
  PATHS.CHANNEL_CUSTOMERS, // GET /masters/channel-customers; legal name, type, GSTIN, terms, margin, PO source = NOT_IN_DB
  PATHS.CHANNEL_LOCATIONS, // GET /masters/channel-locations (details_channels)
  PATHS.WAREHOUSES, // GET /masters/warehouses/pep; no warehouse table, so most PEP facility fields = NOT_IN_DB
  PATHS.AMAZON_INBOUND, // GET /amazon/inbound/* (inbound plans + shipments)
])

/** Dev builds only: mark pages that still show sample data. */
export const SHOW_DUMMY_MARK = import.meta.env.DEV

export const isDummyPage = (path: string) => SHOW_DUMMY_MARK && !LIVE_PAGES.has(path)

/**
 * Pages that open with the sidebar collapsed to its rail (wide tables; user, 2026-10-14). Temporary: the person's own
 * expand / collapse choice is back on the other pages; hovering the rail peeks it, its expand button opens it.
 */
export const RAIL_PAGES: ReadonlySet<string> = new Set<string>([PATHS.PO_OVERVIEW])

/** Where the app opens after sign-in. */
export const HOME_PATH = PATHS.PO_OVERVIEW

/** Masters page tab per URL (the tab labels come from the design's MASTER_TABS). */
export const MASTER_TAB_BY_PATH: Record<string, string> = {
  [PATHS.PEP_SKUS]: MASTER_TABS[0],
  [PATHS.CHANNEL_SKUS]: MASTER_TABS[1],
  [PATHS.CHANNEL_CUSTOMERS]: MASTER_TABS[2],
  [PATHS.CHANNEL_LOCATIONS]: MASTER_TABS[3],
  [PATHS.WAREHOUSES]: MASTER_TABS[4],
}

export const NAV_GROUPS: NavGroup[] = [
  {
    key: PATHS.MASTERS,
    label: 'Masters',
    items: Object.entries(MASTER_TAB_BY_PATH).map(([path, label]) => ({ path, label })),
  },
  {
    key: PATHS.OPERATIONS,
    label: 'B2B/B2C Operations',
    items: [
      // PO Processing & Review first, then PO Overview (user, 2026-10-26).
      { path: PATHS.PO_REVIEW, label: 'PO Processing & Review' },
      { path: PATHS.PO_OVERVIEW, label: 'PO Overview' },
      { path: PATHS.PO_WORKING, label: 'PO Working' },
      { path: PATHS.AMAZON_INBOUND, label: 'Amazon Inbound' },
      { path: PATHS.SKUS_SHORT, label: 'SKUs Short' },
      { path: PATHS.OPS_ANALYTICS, label: 'Analytics' },
    ],
  },
  {
    key: PATHS.PLANNING,
    label: 'Demand Planning',
    items: [
      { path: PATHS.INVENTORY, label: 'Inventory Calculation' },
      { path: PATHS.DRR_AGING, label: 'DRR & Aging' },
      { path: PATHS.PLANNING_ANALYTICS, label: 'Analytics' },
    ],
  },
  { key: PATHS.APPROVALS, label: 'Approvals', items: [] },
  { key: PATHS.ADMIN, label: 'Users & Roles', items: [] },
]
