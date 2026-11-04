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
  /** Edit one row (PATCH) / switch it on or off (POST), 2026-10-28. */
  EDIT: (type: string, id: string) => `/masters/edit/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
  ACTIVE: (type: string, id: string) => `/masters/active/${encodeURIComponent(type)}/${encodeURIComponent(id)}`,
  /** D2C internal transfer routes (2026-11-03): GET the grid; PATCH one route's codes / on-off (admin / developer). */
  TRANSFER_ROUTES: '/masters/transfer-routes',
  TRANSFER_ROUTE: (id: number | string) => `/masters/transfer-routes/${encodeURIComponent(String(id))}`,
} as const

/*
 * Masters history (2026-10-28, backend modules/masters/master-history.service.ts): who changed what, from the Masters
 * pages (master_change_logs) and the In-transit master uploads (intransit_master_changes).
 */
/** Page config id -> the backend's master type. */
export const MASTER_LOG_TYPE: Record<string, string> = { pep: 'pep_sku', channelSku: 'channel_sku', customer: 'channel', chWh: 'location', pepWh: 'facility', routes: 'transfer_route' }
export const MASTER_LOG_TYPE_LABEL: Record<string, string> = {
  pep_sku: 'PEP SKU', channel_sku: 'Channel SKU', channel: 'Channel', location: 'Channel location', facility: 'Warehouse', transfer_route: 'Transfer route',
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
const FIELD_LABEL: Record<string, string> = {
  stockBucket: 'In-transit channel name', stockFeed: 'In-transit feed', stockFormula: 'Units formula',
  intransit_group: 'In-transit channel name', intransit_feed: 'In-transit feed', stock_formula: 'Units formula',
  // D2C internal transfers (2026-11-03)
  transferPoPrefix: 'PO prefix', transfer_po_prefix: 'PO prefix', transferFacilityId: 'Receiving warehouse', transfer_facility_id: 'Receiving warehouse',
  uniwareChannelCode: 'Uniware channel', uniware_channel_code: 'Uniware channel', vendorCode: 'Vendor code', vendor_code: 'Vendor code',
  allowInternalTransfer: 'Allow internal transfer', allow_internal_transfer: 'Allow internal transfer',
}
export const masterFieldLabel = (f: string) => {
  if (FIELD_LABEL[f]) return FIELD_LABEL[f]
  const words = f.replace(/([a-z])([A-Z])/g, '$1 $2').replace(/_/g, ' ').toLowerCase()
  return words.charAt(0).toUpperCase() + words.slice(1)
}
/*
 * A warehouse's in-transit stock settings (user's facility sheet, 2026-11-02; POST_FG constants/intransit.ts
 * STOCK_FEEDS / STOCK_FORMULAS): which channel name (bucket) counts it, whether its open POs also count as in transit,
 * and which Inventory Snapshot columns make its SOH. "Not counted" = none of them. The Edit form takes the lists from
 * GET /masters/form-options; these labels are for the grid.
 */
export const STOCK_NOT_COUNTED = 'Not counted'
export const STOCK_FEED_LABEL: Record<string, string> = { both: 'SOH + In-transit', soh: 'SOH only' }
export const STOCK_FORMULA_LABEL: Record<string, string> = {
  INV: 'Inventory only',
  INV_PP_OP_MINUS_OS: 'Inventory + Putaway Pending + Open Purchase - Open Sale',
  INV_PP_OP_SIT_MINUS_OS: 'Inventory + Putaway Pending + Open Purchase + Stock In Transfer - Open Sale',
  INV_PP_OP_SIT: 'Inventory + Putaway Pending + Open Purchase + Stock In Transfer',
}
export const STOCK_EDIT_KEYS = ['stockBucket', 'stockFeed', 'stockFormula'] as const
export const STOCK_TEXT = {
  BUCKET_HINT: 'Picking one fills in its usual feed and formula (still editable)',
  FEED_HINT: 'SOH only: its own open purchase orders are not counted as in transit',
} as const

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

/*
 * Edit + switch on / off (2026-10-28): keys are locked (a wrong key = switch the row off and add a new one); what
 * switching a row off does to new POs, per master.
 */
export const EDIT_TEXT = {
  LOCKED: 'Key: cannot be edited. To fix a wrong key, switch the row off and add a new one.',
  /** Local D2C test mode (backend D2C_TEST_ONLY). */
  D2C_TEST_LOCKED: 'Local test mode – only TEST_FACILITY: D2C transfer settings can be changed only on test warehouses from this machine.',
  NO_CHANGES: 'Nothing changed yet',
  CHANGED: (n: number) => `${n} field${n === 1 ? '' : 's'} changed`,
  CONFLICT: 'Someone else changed this row while you were editing:',
  USE_LATEST: 'Use the latest values',
  SAVED: (what: string, n: number) => `${what} saved (${n} field${n === 1 ? '' : 's'}). It is in the row's History.`,
  SWITCHED: (what: string, on: boolean) => `${what} switched ${on ? 'on' : 'off'}. It is in the row's History.`,
} as const
export const SWITCH_OFF_EFFECT: Record<string, string> = {
  pep: 'New PO lines with this SKU will go to In Review (SKU inactive).',
  channelSku: 'New PO lines with this channel SKU code will go to In Review (SKU not mapped). Add the right mapping afterwards if the key was wrong.',
  customer: 'Shown as inactive on the Masters pages. PO intake per channel stays as set in Users & Roles → PO intake.',
  chWh: 'New POs for this location will go to In Review (location not found).',
  pepWh: 'New POs for locations served by this warehouse will go to In Review (warehouse inactive).',
}
/** Switching back on re-checks the POs in review against it. */
export const SWITCH_ON_EFFECT = 'POs in review that were waiting on this row are re-checked.'

/*
 * Transfer routes (2026-11-03, backend modules/masters/transfer-routes.service.ts): D2C internal transfers, one row per
 * (sending warehouse, transfer location) with the Uniware codes of that route. Seen by whoever may see Warehouses; edited
 * by admin / developer. The PO prefix belongs to the location, so it is saved as a channel-location edit.
 */
export const TRANSFER_ROUTE_TEXT = {
  TITLE: 'Transfer Routes',
  SUB: 'D2C internal transfers: sending warehouse + transfer location -> receiving warehouse, with the Uniware codes of each route',
  ENTITY: 'transfer routes',
  SEARCH: 'Search sender, channel, location, codes, customer…',
  MISSING: 'missing',
  VENDOR_MISSING: 'Vendor missing',
  VENDOR_MISSING_HINT: 'Show only the routes with no Uniware vendor code',
  TEST_MODE_BANNER: 'Local test mode – only TEST_FACILITY',
  TEST_MODE_EDIT_OFF: 'Local test mode – only TEST_FACILITY: this route is not a test route (sender and receiving warehouse must both be test warehouses), so it cannot be edited from this machine.',
  TEST_MODE_HINT: 'This server runs D2C transfers in local test mode: only routes whose sending AND receiving warehouse are test warehouses (TEST_FACILITY) can be used for transfers here.',
  EDIT_TITLE: 'Edit transfer route',
  PREFIX_HINT: "The location's PO prefix: every route to this location uses it",
  ADMIN_ONLY: 'Only admin / developer can edit the transfer routes',
  SAVED: (n: number) => `Transfer route saved (${n} field${n === 1 ? '' : 's'}). It is in the row's History.`,
} as const
/** The route's own editable fields (PATCH /masters/transfer-routes/:id); the PO prefix goes to the location. */
export const TRANSFER_ROUTE_CODE_KEYS = ['uniwareChannelCode', 'customerCode', 'vendorCode'] as const
export const TRANSFER_PREFIX_KEY = 'transferPoPrefix'
/** Longest code / PO prefix the backend takes (D2C_UNIWARE_CODE_MAX, D2C_PO_PREFIX_MAX). */
export const TRANSFER_CODE_MAX = 100
