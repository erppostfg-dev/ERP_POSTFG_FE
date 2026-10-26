/* Users & Roles page (2026-10-15). */

export const ADMIN_ENDPOINT = {
  USERS: '/admin/users',
  USER_OPTIONS: '/admin/users/options',
  USER: (id: number) => `/admin/users/${id}`,
  WELCOME: (id: number) => `/admin/users/${id}/welcome-email`,
  ROLES: '/admin/roles',
  ROLE_PAGES: '/admin/roles/pages',
  ROLE: (key: string) => `/admin/roles/${encodeURIComponent(key)}`,
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

/**
 * Users & Roles -> Settings (2026-10-22, user: "keep it as tabs so we can add more later"): one inner tab per group of
 * settings. Add a new group here and its component in pages/Admin.tsx SettingsTab.
 */
export const SETTINGS_SECTIONS = [
  { key: 'po-verify', label: 'PO verification', hint: 'Verify POs against the original before the Uniware CSV, per channel' },
  { key: 'po-intake', label: 'PO intake', hint: 'Which channels are processed and how many POs a day' },
  // DUMMY groups (pages/SettingsDummy.tsx): only to see the layout; nothing is saved.
  { key: 'notifications', label: 'Notifications', hint: 'Dummy: emails and alerts', dummy: true },
  { key: 'review-rules', label: 'PO review rules', hint: 'Dummy: tolerances and approval', dummy: true },
] as const
export type SettingsSection = (typeof SETTINGS_SECTIONS)[number]['key']
