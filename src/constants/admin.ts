/* Users & Roles page (2026-10-15). */

export const ADMIN_ENDPOINT = {
  USERS: '/admin/users',
  USER_OPTIONS: '/admin/users/options',
  USER: (id: number) => `/admin/users/${id}`,
  WELCOME: (id: number) => `/admin/users/${id}/welcome-email`,
  ROLES: '/admin/roles',
  ROLE_PAGES: '/admin/roles/pages',
  ROLE: (key: string) => `/admin/roles/${encodeURIComponent(key)}`,
  // Server: disk + local cleanup (2026-11-04; developers only)
  SERVER: '/admin/server',
  SERVER_CLEANUP: '/admin/server/cleanup',
  // Monitor: CloudWatch logs + metrics (2026-11-05; developers only)
  MONITOR_ACCESS: '/admin/monitor/access',
  MONITOR_OVERVIEW: (window: string) => `/admin/monitor/overview?window=${encodeURIComponent(window)}`,
  MONITOR_PEAK: (at: string) => `/admin/monitor/peak?at=${encodeURIComponent(at)}`,
  // Users & Roles -> Email (2026-10-30; POST_FG routes/mail-lists.routes.ts)
  MAIL_LISTS: '/admin/mail-lists',
  MAIL_LIST: (key: string) => `/admin/mail-lists/${encodeURIComponent(key)}`,
  MAIL_RECIPIENTS: (key: string) => `/admin/mail-lists/${encodeURIComponent(key)}/recipients`,
  MAIL_RECIPIENT: (key: string, id: number) => `/admin/mail-lists/${encodeURIComponent(key)}/recipients/${id}`,
  MAIL_HISTORY: (key: string) => `/admin/mail-lists/${encodeURIComponent(key)}/history`,
  MAIL_TEST: (key: string) => `/admin/mail-lists/${encodeURIComponent(key)}/test`,
} as const

/** Only this role sees Admin > Server (2026-11-04; POST_FG ROLES.DEVELOPER). */
export const DEVELOPER_ROLE = 'developer'

export const ACCESS_LABEL: Record<string, string> = { none: 'Hidden', viewer: 'View', editor: 'Edit' }
export const ACCESS_LEVELS = ['none', 'viewer', 'editor'] as const

export const ADMIN_TEXT = {
  TITLE: 'Users & Roles',
  SUB: 'Add people, give them a role (which pages they can open, view or edit), a PO Overview team and facilities. They get a welcome email and sign in with Google.',
  ADD_USER: 'Add user',
  FIXED_ROLES: 'Roles are a fixed list. To add a new role, ask the developer (it is added with a migration).',
  SYSTEM_ROLE: 'Built-in role: full access to every page. It cannot be changed here.',
  NO_ADMIN_PAGE: 'Users & Roles stays with admins and developers; it cannot be given to a role.',
  EMAIL_NOT_SENT: 'Not sent',
  ADDED: (email: string, emailed: boolean) => `${email} added.${emailed ? ' The welcome email is on its way.' : ''}`,
  SAVED: 'Saved.',
  RESENT: (email: string) => `Welcome email sent to ${email}.`,
} as const

/** Users & Roles -> Email (2026-10-30): who gets each mail the ERP sends. */
export const RECIPIENT_KINDS = ['to', 'cc', 'bcc'] as const
export const RECIPIENT_KIND_LABEL: Record<(typeof RECIPIENT_KINDS)[number], string> = { to: 'To', cc: 'CC', bcc: 'BCC' }
export const EMAIL_TEXT = {
  TAB: 'Email',
  SUB: 'Every mail the ERP sends, and who gets it. Anyone can be added (any email address) as To, CC or BCC; pause a person to skip them without removing them. New mails appear here when they are added to the ERP.',
  ADD: 'Add recipient',
  NOBODY: 'Nobody gets this mail yet.',
  OFF: 'Switched off: nobody gets this mail.',
  TEST_ME: 'Send test to me',
  TEST_LIST: 'Send test to the list',
  HISTORY: 'History',
  NO_HISTORY: 'No changes yet.',
  ADDED: (email: string) => `${email} added.`,
  REMOVED: (email: string) => `${email} removed.`,
  TESTED: (to: string[]) => `Test sent to ${to.join(', ')}.`,
} as const

/**
 * Users & Roles -> Settings (2026-10-22, user: "keep it as tabs so we can add more later"): one inner tab per group of
 * settings. Add a new group here and its component in pages/Admin.tsx SettingsTab.
 */
export const SETTINGS_SECTIONS = [
  { key: 'po-verify', label: 'PO verification', hint: 'Verify POs against the original before the Uniware CSV, per channel' },
  { key: 'po-intake', label: 'PO intake', hint: 'Which channels are processed and how many POs a day' },
  { key: 'notices', label: 'Notices', hint: 'Short notes people send each other in the bell (kept 2 days)' },
  { key: 'bulk-orders', label: 'Bulk Orders', hint: 'Bulk Orders portal: proof of payment check per order type' },
  // DUMMY group (pages/SettingsDummy.tsx): only to see the layout; nothing is saved. (Notifications became the Email tab.)
  { key: 'review-rules', label: 'PO review rules', hint: 'Dummy: tolerances and approval', dummy: true },
] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['key']

/** Admin > Server (2026-11-04; developers only): disk + local cleanup. */
export const SERVER_TEXT = {
  TAB: 'Server',
  SUB: 'The server disk where POs are worked on, and the cleanup that removes local copies once they are safe in S3 (S3 keeps everything). Developers only.',
  DISK: 'Server disk',
  USED: 'used',
  FREE: (free: string, total: string) => `${free} free of ${total}`,
  THRESHOLDS: (warn: number, err: number) => `Checked every hour: a warning in the server log at ${warn}% used, an error at ${err}%.`,
  NO_DISK: 'The server could not read its disk size.',
  CLEANUP: 'Local cleanup',
  ON: 'Switched on',
  OFF: 'Switched off',
  NO_S3: 'S3 off: nothing is removed',
  OFF_HINT: 'LOCAL_CLEANUP_ENABLED is not true on this server: nothing is removed by itself and the disk keeps filling. Set it to true in the server settings (SSM) and restart, or run it here now.',
  RULE_FINISHED: (h: number) => `Finished POs (completed / rejected / not a PO): their local copy goes ${h} h after they finished.`,
  RULE_STALE: (d: number) => `Failed (or dismissed), in review or waiting for approval for ${d} days: the local copy goes too (review, approval and Try again read S3).`,
  RULE_S3: 'Never removed unless every file is confirmed in S3 (else it is uploaded again and removed on a later run).',
  RULE_EVERY: (h: number) => `Runs every ${h} h by itself when switched on.`,
  LAST_RUN: 'Last run',
  NEVER: 'Not run yet on this server.',
  REMOVED: (n: number, size: string) => `removed ${n} folder(s), ${size}`,
  WOULD_REMOVE: (n: number, size: string) => `check only: would remove ${n} folder(s), ${size}`,
  KEPT: (n: number, size: string) => `kept ${n} (${size})`,
  CHECK: 'Check now (removes nothing)',
  CHECKING: 'Checking…',
  RUN: 'Run cleanup now',
  RUNNING: 'Cleaning…',
} as const

/** Admin > Monitor (2026-11-05; developers only): the server's CloudWatch logs + metrics, read with the EC2's own role. */
export const MONITOR_WINDOWS = ['1h', '24h', '7d'] as const
export type MonitorWindow = (typeof MONITOR_WINDOWS)[number]
export const MONITOR_TEXT = {
  TAB: 'Monitor',
  SUB: 'How the server is doing: memory, CPU, disk, database, every API and every warning or error, from CloudWatch. Click a point on a graph to see what was running then. Developers only.',
  WINDOW: { '1h': 'Last hour', '24h': 'Last 24 hours', '7d': 'Last 7 days' } as Record<MonitorWindow, string>,
  REFRESH: 'Refresh',
  NOT_ON_SERVER: 'Not on the server. The Monitor reads CloudWatch only with the dev EC2 role (never laptop keys): open it on dev.',
  ACCESS: 'AWS access (the server role)',
  ACCESS_OK: 'All reads allowed',
  ACCESS_MISSING: (n: number) => `${n} read${n === 1 ? '' : 's'} not allowed yet: ask the AWS admin to add ${n === 1 ? 'it' : 'them'} to the EC2 role`,
  PART_FAILED: 'Could not read this part',
  NOW: {
    APP_MEMORY: 'App memory', SERVER_RAM: 'Server RAM', CPU: 'Server CPU', DISK: 'Server disk', DB_CPU: 'Database CPU', ERRORS: 'Server errors (5xx)', ALERTS: 'Warnings + errors',
  },
  CHARTS: {
    APP_MEMORY: 'App memory (MB)', SERVER: 'Server RAM / disk / CPU (%)', LOOP: 'Event loop delay p99 (ms)', REQUESTS: 'Requests per 5 min (+ 5xx)',
    LATENCY: 'API time (avg / max ms)', POOL: 'DB pool (waiting / free)', DATABASE: 'Database CPU % / connections',
  },
  CLICK_HINT: 'Click any point to see what was running at that time.',
  NO_DATA: 'No data in this window.',
  ALERTS: 'Warnings and errors',
  ALERT_ALL: 'All',
  ALERT_NONE: 'No warnings or errors in this window.',
  ALERT_NEWEST: (n: number) => `Newest ${n}`,
  ALARMS: 'CloudWatch alarms',
  ALARMS_NONE: 'No CloudWatch alarms set up (email alerts: later).',
  PEAK: (t: string) => `What was running around ${t}`,
  PEAK_SUB: 'The 5 minutes before this point and 1 minute after.',
  PEAK_APIS: 'APIs (by slowest)',
  PEAK_JOBS: 'Background jobs',
  PEAK_RUNNING: 'Running at the health check',
  PEAK_ALERTS: 'Warnings + errors then',
  PEAK_NONE: 'Nothing logged.',
  CLOSE: 'Close',
} as const
