/*
 * Amazon Inbound page (2026-10-19; POST_FG /amazon/inbound, page key /operations/amazon-inbound): Amazon inbound plans,
 * their FBA shipments (one shipment = one PO = one sale order), each shipment's status path, lines and history.
 */

export const INBOUND_ENDPOINT = {
  PLANS: '/amazon/inbound/plans',
  PLAN: (planId: string) => `/amazon/inbound/plans/${encodeURIComponent(planId)}`,
  SHIPMENTS: '/amazon/inbound/shipments',
  SHIPMENT: (id: string) => `/amazon/inbound/shipments/${encodeURIComponent(id)}`,
  REFRESH: (id: string) => `/amazon/inbound/shipments/${encodeURIComponent(id)}/refresh`,
  LIMITS: '/amazon/inbound/limits',
  LIMIT: (id: number) => `/amazon/inbound/limits/${id}`,
  SYNC: '/amazon/inbound/sync',
} as const

/** Amazon's shipment statuses in their order (the path drawn on the screens). */
export const SHIPMENT_STEPS = ['WORKING', 'READY_TO_SHIP', 'SHIPPED', 'IN_TRANSIT', 'DELIVERED', 'CHECKED_IN', 'RECEIVING', 'CLOSED'] as const

export const STATUS_LABEL: Record<string, string> = {
  WORKING: 'Working', READY_TO_SHIP: 'Ready to ship', SHIPPED: 'Shipped', IN_TRANSIT: 'In transit', DELIVERED: 'Delivered',
  CHECKED_IN: 'Checked in', RECEIVING: 'Receiving', CLOSED: 'Closed', CANCELLED: 'Cancelled', DELETED: 'Deleted',
}

export type StatusTone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral' | 'primary'
/** Badge tone per status: not shipped yet (amber), on the way (blue), at Amazon (indigo), done (green), stopped (red). */
export const STATUS_TONE: Record<string, StatusTone> = {
  WORKING: 'warn', READY_TO_SHIP: 'warn', SHIPPED: 'info', IN_TRANSIT: 'info', DELIVERED: 'info', CHECKED_IN: 'primary',
  RECEIVING: 'primary', CLOSED: 'ok', CANCELLED: 'crit', DELETED: 'crit',
}
/** Fill colour of a status in the plan bar (same grouping as the badges). */
export const STATUS_FILL: Record<string, string> = {
  WORKING: 'bg-warn', READY_TO_SHIP: 'bg-warn/70', SHIPPED: 'bg-info/60', IN_TRANSIT: 'bg-info', DELIVERED: 'bg-info/80',
  CHECKED_IN: 'bg-primary/70', RECEIVING: 'bg-primary', CLOSED: 'bg-ok', CANCELLED: 'bg-crit', DELETED: 'bg-crit',
}

/** What a history row says. */
export const EVENT_LABEL: Record<string, string> = {
  discovered: 'First seen',
  status_changed: 'Status changed',
  lines_changed: 'Lines changed',
  received_updated: 'Received updated',
  po_linked: 'Linked to our PO',
  attention: 'Needs attention',
}
export const EVENT_SOURCE_LABEL: Record<string, string> = { poll: 'Check every 2 h', sweep: 'Daily check', refresh: 'Refresh', script: 'First load' }

export const UNIWARE_LABEL: Record<string, string> = {
  // What POST_FG knows: its own PO + hand-off state. "No PO in POST_FG" says nothing about Uniware itself (we don't read
  // Uniware): a shipment punched by hand in Uniware before POST_FG shows this too (user, 2026-10-19).
  none: 'No PO in POST_FG', not_downloaded: 'POST_FG PO · CSV not downloaded', downloaded: 'POST_FG PO · downloaded, not marked in Uniware', uploaded: 'POST_FG PO · in Uniware',
}

export const INBOUND_TEXT = {
  TITLE: 'Amazon Inbound',
  SUB: 'Inbound plans and their FBA shipments · one shipment = one PO = one sale order · updated every 2 hours',
  NO_PLAN: 'Plan not loaded',
  NO_PLAN_HINT: 'Its plan is older than the loaded period (90 days)',
  SINCE_HINT: 'Days in this status count from when POST_FG first saw it (Amazon keeps no history)',
  REFRESH: 'Refresh from Amazon',
  REFRESHING: 'Checking Amazon…',
  REFRESHED: (n: number, calls: number) => (n ? `${n} change(s) found (${calls} Amazon calls)` : `No change at Amazon (${calls} calls)`),
  LIMITS_HINT: 'A shipment longer than this many days in a status is flagged as stuck. In transit will later have its own limit per courier.',
  SAVED: 'Saved',
  EMPTY: 'No Amazon inbound data yet: the first load (npm run amazon:inbound -- --days 90 --apply) fills this page.',
} as const
