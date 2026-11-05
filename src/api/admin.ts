import { api } from './client'
import { ADMIN_ENDPOINT } from '../constants/admin'

/* Users & Roles (POST_FG routes/admin.routes.ts, 2026-10-15): admin / developer only. */

export type AccessLevel = 'none' | 'viewer' | 'editor'

export type AdminUser = {
  id: number
  name: string
  email: string
  status: 'active' | 'inactive'
  roles: string[]
  team: string | null
  facilities: string[]
  addedBy: string | null
  createdAt: string | null
  lastLoginAt: string | null
  welcomeSentAt: string | null
  welcomeError: string | null
}

export type UserOptions = {
  roles: { key: string; label: string; description: string | null; isSystem: boolean }[]
  teams: { key: string; label: string }[]
  facilityScopedTeams: string[]
  facilities: { code: string; name: string | null }[]
  emailDomain: string
}

export type UserBody = { email?: string; name?: string; roles?: string[]; team?: string | null; facilities?: string[]; status?: 'active' | 'inactive'; sendEmail?: boolean }

export type RoleItem = { key: string; label: string; description: string | null; isSystem: boolean; users: number; grants: Record<string, AccessLevel> }
/** isCapability = a special permission (on = editor, off = none), e.g. "PO Review: edit all fields". */
export type RolePage = { slug: string; label: string; section: string; isSection: boolean; isCapability?: boolean; description?: string | null }
/** Roles are a fixed list (backend ROLE_CATALOG): only a role's page access can be changed here. */
export type RoleBody = { grants: Record<string, AccessLevel> }

const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) })

export const listUsers = (signal?: AbortSignal) => api<AdminUser[]>(ADMIN_ENDPOINT.USERS, { signal })
export const getUserOptions = (signal?: AbortSignal) => api<UserOptions>(ADMIN_ENDPOINT.USER_OPTIONS, { signal })
export const createUser = (body: UserBody) => api<AdminUser>(ADMIN_ENDPOINT.USERS, json('POST', body))
export const updateUser = (id: number, body: UserBody) => api<AdminUser>(ADMIN_ENDPOINT.USER(id), json('PATCH', body))
export const resendWelcome = (id: number) => api<{ sent: boolean; error: string | null }>(ADMIN_ENDPOINT.WELCOME(id), { method: 'POST' })

export const listRoles = (signal?: AbortSignal) => api<RoleItem[]>(ADMIN_ENDPOINT.ROLES, { signal })
export const getRolePages = (signal?: AbortSignal) => api<RolePage[]>(ADMIN_ENDPOINT.ROLE_PAGES, { signal })
export const updateRole = (key: string, body: RoleBody) => api<RoleItem>(ADMIN_ENDPOINT.ROLE(key), json('PATCH', body))

// ---- Email: mailing lists (POST_FG routes/mail-lists.routes.ts, 2026-10-30) ----

export type RecipientKind = 'to' | 'cc' | 'bcc'
export type MailRecipient = { id: number; email: string; kind: RecipientKind; paused: boolean; addedBy: string | null; addedAt: string; updatedAt: string }
/** One mail the ERP sends (catalog in the backend) and who gets it. */
export type MailList = { key: string; name: string; description: string; area: string; enabled: boolean; recipients: MailRecipient[] }
export type MailListChange = { at: string; by: string | null; what: string }
export type MailTestResult = { to: string[]; cc: string[]; bcc: string[] }

export const listMailLists = (signal?: AbortSignal) => api<MailList[]>(ADMIN_ENDPOINT.MAIL_LISTS, { signal })
export const setMailListEnabled = (key: string, enabled: boolean) => api<MailList>(ADMIN_ENDPOINT.MAIL_LIST(key), json('PUT', { enabled }))
export const addMailRecipient = (key: string, body: { email: string; kind: RecipientKind }) => api<MailList>(ADMIN_ENDPOINT.MAIL_RECIPIENTS(key), json('POST', body))
export const updateMailRecipient = (key: string, id: number, body: { kind?: RecipientKind; paused?: boolean }) =>
  api<MailList>(ADMIN_ENDPOINT.MAIL_RECIPIENT(key, id), json('PATCH', body))
export const removeMailRecipient = (key: string, id: number) => api<MailList>(ADMIN_ENDPOINT.MAIL_RECIPIENT(key, id), { method: 'DELETE' })
export const getMailListHistory = (key: string, signal?: AbortSignal) => api<MailListChange[]>(ADMIN_ENDPOINT.MAIL_HISTORY(key), { signal })
export const sendMailListTest = (key: string, onlyMe: boolean) => api<MailTestResult>(ADMIN_ENDPOINT.MAIL_TEST(key), json('POST', { onlyMe }))

/* Admin > Server (2026-11-04; developers only): GET /admin/server, POST /admin/server/cleanup { apply }. */
export type CleanupRun = { at: string; apply: boolean; folders: number; removed: number; removedBytes: number; keptBytes: number; kept: { reason: string; n: number }[] }
export type ServerView = {
  disk: { path: string; totalBytes: number; freeBytes: number; usedPct: number; at: string } | null
  thresholds: { warnPct: number; errorPct: number }
  cleanup: { enabled: boolean; s3: boolean; minAgeHours: number; staleDays: number; everyHours: number; last: CleanupRun | null }
}
export const getServer = (signal?: AbortSignal) => api<ServerView>(ADMIN_ENDPOINT.SERVER, { signal })
export const runServerCleanup = (apply: boolean) => api<ServerView & { run: CleanupRun | null }>(ADMIN_ENDPOINT.SERVER_CLEANUP, json('POST', { apply }))

/* Admin > Monitor (2026-11-05; developers only): GET /admin/monitor/access, /overview?window=, /peak?at=. */
export type MonitorPart<T> = { ok: boolean; error: string | null; data: T | null }
export type MonitorAccessCheck = { action: string; ok: boolean; error: string | null }
export type MonitorAccess = { onServer: boolean; instanceId: string | null; logGroup: string; region: string; checks: MonitorAccessCheck[] }
export type HealthPoint = {
  t: string; rssMb: number | null; heapUsedMb: number | null; cpuPct: number | null; loopP99Ms: number | null; loopMaxMs: number | null
  requests: number | null; errors5xx: number | null; errors4xx: number | null; slow: number | null; avgMs: number | null; maxMs: number | null
  activeRequests: number | null; dbPoolSize: number | null; dbPoolFree: number | null; dbPoolWaiting: number | null; dbPoolMaxWaiting: number | null
  running: string[]
}
export type AlertRow = { t: string; level: string; code: string; source: string; msg: string; reason: string; fix: string; requestId: string; jobId: string; path: string; errorCode: string }
export type AlertCount = { code: string; level: string; count: number; last: string }
export type MetricSeries = { id: string; label: string; points: { t: string; v: number }[] }
export type MonitorAlarm = { name: string; state: string; reason: string; updatedAt: string | null }
export type MonitorOverview = {
  onServer: boolean; window: string; from: string; to: string
  health: MonitorPart<HealthPoint[]>; alerts: MonitorPart<AlertRow[]>; alertCounts: MonitorPart<AlertCount[]>
  metrics: MonitorPart<{ server: MetricSeries[]; database: MetricSeries[] }>; alarms: MonitorPart<MonitorAlarm[]>
}
export type PeakApi = { method: string; path: string; calls: number; avgMs: number; maxMs: number; dbQueries: number; kb: number }
export type PeakJob = { jobId: string; source: string; lines: number; from: string; to: string; firstMsg: string }
export type MonitorPeak = {
  at: string; from: string; to: string
  health: MonitorPart<HealthPoint | null>; apis: MonitorPart<PeakApi[]>; jobs: MonitorPart<PeakJob[]>; alerts: MonitorPart<AlertRow[]>
}
export const getMonitorAccess = (signal?: AbortSignal) => api<MonitorAccess>(ADMIN_ENDPOINT.MONITOR_ACCESS, { signal })
export const getMonitorOverview = (window: string, signal?: AbortSignal) => api<MonitorOverview>(ADMIN_ENDPOINT.MONITOR_OVERVIEW(window), { signal })
export const getMonitorPeak = (at: string, signal?: AbortSignal) => api<MonitorPeak>(ADMIN_ENDPOINT.MONITOR_PEAK(at), { signal })
