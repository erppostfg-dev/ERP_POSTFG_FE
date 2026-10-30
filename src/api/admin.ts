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
