/* Masters API (POST_FG routes/masters.routes.ts, all under /masters) and how the master screens show its values. */

export const MASTERS_ENDPOINT = {
  PEP_SKUS: '/masters/pep-skus',
  CHANNEL_SKUS: '/masters/channel-skus',
  CHANNEL_CUSTOMERS: '/masters/channel-customers',
  PEP_WAREHOUSES: '/masters/warehouses/pep',
  CHANNEL_WAREHOUSES: '/masters/channel-locations',
} as const

/** Shown in a field the page has but the database has no column for yet. */
export const NOT_IN_DB = 'Needs to be added in DB'

/** Shown on buttons whose backend is not built yet (add / edit, sync, history, channel listings). */
export const NOT_AVAILABLE_YET = 'Not available yet: no backend for this'

/** master_skus.is_active -> the status the page shows. */
export const SKU_STATUS = { ACTIVE: 'Active', INACTIVE: 'Inactive' } as const
