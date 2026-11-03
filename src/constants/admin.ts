/* Users & Roles page (2026-10-15). */

export const ADMIN_ENDPOINT = {
  USERS: '/admin/users',
  USER_OPTIONS: '/admin/users/options',
  USER: (id: number) => `/admin/users/${id}`,
  WELCOME: (id: number) => `/admin/users/${id}/welcome-email`,
  ROLES: '/admin/roles',
  ROLE_PAGES: '/admin/roles/pages',
  ROLE: (key: string) => `/admin/roles/${encodeURIComponent(key)}`,
  // Users & Roles -> Email (2026-10-30; POST_FG routes/mail-lists.routes.ts)
  MAIL_LISTS: '/admin/mail-lists',
  MAIL_LIST: (key: string) => `/admin/mail-lists/${encodeURIComponent(key)}`,
  MAIL_RECIPIENTS: (key: string) => `/admin/mail-lists/${encodeURIComponent(key)}/recipients`,
  MAIL_RECIPIENT: (key: string, id: number) => `/admin/mail-lists/${encodeURIComponent(key)}/recipients/${id}`,
  MAIL_HISTORY: (key: string) => `/admin/mail-lists/${encodeURIComponent(key)}/history`,
  MAIL_TEST: (key: string) => `/admin/mail-lists/${encodeURIComponent(key)}/test`,
} as const

/** Only these roles can open the page's actions (backend USER_ADMIN_ROLES). */
export const USER_ADMIN_ROLES = ['admin', 'developer'] as const

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
  // DUMMY group (pages/SettingsDummy.tsx): only to see the layout; nothing is saved. (Notifications became the Email tab.)
  { key: 'review-rules', label: 'PO review rules', hint: 'Dummy: tolerances and approval', dummy: true },
] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['key']
