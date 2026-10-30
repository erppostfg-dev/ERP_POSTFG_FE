/*
 * Channel Pulls page (2026-10-30): replaces Amazon Inbound in the sidebar (same URL and page key; Amazon's tabs stay on
 * the page). One card per channel pulled by API or robot, with buttons to pull and process. Backend: POST_FG
 * routes/channel-pulls.routes.ts (API #85-90).
 */

export const CHANNEL_PULLS_ENDPOINT = '/channel-pulls'

/** Refresh while something runs (the robot / a process run), else this. */
export const PULLS_REFRESH_BUSY_MS = 4_000
export const PULLS_REFRESH_IDLE_MS = 60_000

/** The robot's schedule choices (hours; null = Run now only). */
export const ROBOT_SCHEDULE_HOURS = [null, 1, 2, 4, 6, 12, 24] as const

export const PULLS_TEXT = {
  TITLE: 'Channel Pulls',
  SUB: 'POs pulled from channels by API or robot: pull now, process now, and what each brought in. Amazon\'s inbound plans and shipments are in their tabs.',
  TAB_CHANNELS: 'Channels',
  KIND: { api: 'By API', robot: 'By robot' } as Record<string, string>,
  NOT_CONFIGURED: 'Not set up on this server (login missing in the settings)',
  INTAKE_ON: 'PO intake ON',
  INTAKE_OFF: 'PO intake OFF: nothing is taken (switch it on in Users & Roles > Settings > PO intake)',
  FROM: (d: string) => `from ${d}`,
  RUN_ROBOT: 'Run robot now',
  ROBOT_RUNNING: 'Robot running…',
  PROCESS: 'Process now',
  /** An API channel: one button pulls and processes. */
  PULL_NOW: 'Pull now',
  PULLING: 'Pulling…',
  PULL_SCHEDULE: 'Pull schedule',
  DEFAULT_EVERY: (h: number) => `Default (every ${h} h)`,
  PROCESSING: 'Processing…',
  LAST_RUN: 'Robot',
  NEVER_RAN: 'never ran',
  RUN_RESULT: (listed: number, stored: number, failed: number) => `${listed} listed · ${stored} new${failed ? ` · ${failed} failed (tried again next run)` : ''}`,
  LAST_PROCESS: 'Processed',
  NEVER_PROCESSED: 'never',
  PROCESS_RESULT: (r: Record<string, unknown>) => `${Number(r.seen ?? 0)} looked at · ${Number(r.ready ?? 0)} ready · ${Number(r.waiting ?? 0)} waiting${Number(r.failed ?? 0) ? ` · ${Number(r.failed)} failed` : ''}`,
  POLLING_OFF: 'Not polled by the server here: use Process now',
  SCHEDULE: 'Robot schedule',
  SCHEDULE_OFF: 'Run now only',
  EVERY: (h: number) => `Every ${h} h`,
  NEXT: (t: string) => `next ${t}`,
  COUNTS: (c: { fetched: number; notTaken: number; waiting: number; taken: number }) => `${c.fetched} fetched · ${c.taken} taken · ${c.notTaken} not taken yet${c.waiting ? ` (${c.waiting} waiting for Flipkart's details)` : ''}`,
  VIEW_LOG: 'View log',
  LOG_TITLE: 'Robot log (last run)',
  NO_LOG: 'No run yet.',
  RECENT: 'Recent consignments',
  NO_ITEMS: 'Nothing fetched yet: Run robot now.',
  STARTED: 'Started: the page updates by itself.',
  QUEUED: 'A run is going: it runs again right after.',
  SAVED_SCHEDULE: 'Schedule saved.',
  VIEW_ONLY: 'View only: running and processing need editor access.',
} as const

/** The PO a fetched consignment became (po_uploads.status) -> label + tone. */
export const UPLOAD_STATE: Record<string, { label: string; tone: 'ok' | 'warn' | 'crit' | 'info' | 'neutral' }> = {
  completed: { label: 'PO + sale order', tone: 'ok' },
  needs_review: { label: 'In review', tone: 'warn' },
  pending_approval: { label: 'Waiting for approval', tone: 'info' },
  held: { label: 'Held', tone: 'neutral' },
  queued: { label: 'Queued', tone: 'info' },
  processing: { label: 'Processing', tone: 'info' },
  failed: { label: 'Failed', tone: 'crit' },
  rejected: { label: 'Rejected', tone: 'neutral' },
}
