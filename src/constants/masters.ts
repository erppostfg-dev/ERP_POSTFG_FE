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
  /** One row's history (2026-10-28). */
  HISTORY: (type: string, id: string) => `/masters/history/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
  /** Every master's recent changes: ?type=&days=. */
  CHANGES: '/masters/changes',
} as const

/*
 * Masters history (2026-10-28, backend modules/masters/master-history.service.ts): who changed what, from the Masters
 * pages (master_change_logs) and the In-transit master uploads (intransit_master_changes).
 */
/** Page config id -> the backend's master type. */
export const MASTER_LOG_TYPE: Record<string, string> = { pep: 'pep_sku', channelSku: 'channel_sku', customer: 'channel', chWh: 'location', pepWh: 'facility' }
export const MASTER_LOG_TYPE_LABEL: Record<string, string> = {
  pep_sku: 'PEP SKU', channel_sku: 'Channel SKU', channel: 'Channel', location: 'Channel location', facility: 'Warehouse',
}
export const MASTER_LOG_ACTION_LABEL: Record<string, string> = {
  created: 'Added', field_changed: 'Updated', deactivated: 'Deactivated', activated: 'Activated', replaced: 'Reloaded the whole master from files',
}
export const MASTER_LOG_SOURCE_LABEL: Record<string, string> = {
  screen: 'Masters page', script: 'Script (masters:replace)',
  intransit_upload: 'In-transit master upload', intransit_split1_add: 'In-transit combo added',
  intransit_variant_map: 'In-transit variant mapped', intransit_loader: 'In-transit first load',
}
/** Recent changes: how far back (days). */
export const MASTER_HISTORY_DAYS = [7, 30, 90, 365] as const
/** A logged DB column / form key as people read it ("intransit_location" -> "Intransit location"). */
export const masterFieldLabel = (f: string) => {
  const words = f.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
export const HISTORY_TEXT = {
  NO_ROW: 'No history: this code is not a row of the facility master',
  EMPTY_ROW: 'Nothing recorded for this row yet. Changes are recorded from 28 Oct 2026 on.',
  EMPTY_ALL: 'No changes in this period.',
  REMARK: 'Remark (optional)',
  REMARK_HINT: "Kept in the row's History",
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
