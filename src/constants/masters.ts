/* Masters API (POST_FG routes/masters.routes.ts, all under /masters) and how the master screens show its values. */

export const MASTERS_ENDPOINT = {
  PEP_SKUS: '/masters/pep-skus',
  CHANNEL_SKUS: '/masters/channel-skus',
  CHANNEL_CUSTOMERS: '/masters/channel-customers',
  PEP_WAREHOUSES: '/masters/warehouses/pep',
  CHANNEL_WAREHOUSES: '/masters/channel-locations',
  /** POST adds a channel (the list stays CHANNEL_CUSTOMERS). */
  CHANNELS: '/masters/channels',
  /** Dropdowns of the Add forms. */
  FORM_OPTIONS: '/masters/form-options',
} as const

/*
 * Add forms (2026-10-27, backend routes/masters.routes.ts): admin / developer only; EVERY field required (only fields the
 * DB has); Save stays off until all are filled and valid. The backend checks the same again (and duplicates).
 * Formats mirror the backend's MASTER_ADD.
 */
export const MASTER_ADD_ROLES = ['admin', 'developer'] as const
export const ADD_RULE = {
  EAN: { re: /^(\d{8}|\d{12,14})$/, rule: '8, 12, 13 or 14 digits' },
  HSN: { re: /^\d{4,8}$/, rule: '4 to 8 digits' },
  PIN: { re: /^[1-9]\d{5}$/, rule: '6 digits' },
  GSTIN: { re: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/, rule: 'a 15-character GSTIN (e.g. 27AAACI1234A1Z5)' },
  SLUG: { re: /^[a-z0-9]+(-[a-z0-9]+)*$/, rule: 'lower-case letters, digits and dashes (e.g. tata-1mg)' },
} as const
export const ADD_TEXT = {
  REQUIRED: 'Required',
  ABOVE_ZERO: 'Must be a number above 0',
  ALL_REQUIRED: 'Every field is required.',
  LEFT: (n: number) => `${n} field${n === 1 ? '' : 's'} still to fill or fix`,
  ADMIN_ONLY: 'Only admin / developer can add to the masters',
  RECHECK: (channel: string) => `${channel}'s POs in review are being re-checked against the new mapping.`,
  NEW_CHANNEL: 'A new channel takes POs only after its reader / code is added (ADD_A_CHANNEL.md).',
} as const

/** Shown in a field the page has but the database has no column for yet. */
export const NOT_IN_DB = 'Needs to be added in DB'

/** Shown on buttons whose backend is not built yet (add / edit, sync, history, channel listings). */
export const NOT_AVAILABLE_YET = 'Not available yet: no backend for this'

/** master_skus.is_active -> the status the page shows. */
export const SKU_STATUS = { ACTIVE: 'Active', INACTIVE: 'Inactive' } as const
