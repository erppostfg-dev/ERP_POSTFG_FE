/*
 * Bulk Orders portal (2026-11-11): its own app (bulk.html, src/bulk-main.tsx, `npm run dev:bulk` on :5174, built to
 * <domain>/bulk-orders/), same backend (POST_FG constants/bulk-orders.ts, API #124-129). Marketing / Institutional
 * people order in bulk; an approver approves (next step). Access = the /bulk-orders pages in GET /auth/me.
 */

export const BULK_ENDPOINT = {
  ORDERS: '/bulk-orders',
  ORDER: (id: string) => `/bulk-orders/${encodeURIComponent(id)}`,
  CANCEL: (id: string) => `/bulk-orders/${encodeURIComponent(id)}/cancel`,
  APPROVE: (id: string) => `/bulk-orders/${encodeURIComponent(id)}/approve`,
  REJECT: (id: string) => `/bulk-orders/${encodeURIComponent(id)}/reject`,
  SKUS: '/bulk-orders/skus',
  LOCATIONS: '/bulk-orders/locations',
  /** Our team's read-only view in POST_FG (PO Processing & Review > Bulk Orders, step 3a). */
  TEAM: '/po-review/bulk-orders',
  TEAM_ORDER: (id: string) => `/po-review/bulk-orders/${encodeURIComponent(id)}`,
  /** Sign-in started here comes back to the portal (backend BULK_PORTAL_URL). */
  GOOGLE: '/auth/google?app=bulk',
} as const

export const BULK_TYPE = { MARKETING: 'marketing', INSTITUTIONAL: 'institutional' } as const
export type BulkType = (typeof BULK_TYPE)[keyof typeof BULK_TYPE]
export const BULK_TYPES: BulkType[] = [BULK_TYPE.MARKETING, BULK_TYPE.INSTITUTIONAL]
export const BULK_TYPE_LABEL: Record<BulkType, string> = { marketing: 'Marketing', institutional: 'Institutional' }

/** Backend page keys (POST_FG constants/auth.ts PAGES). */
export const BULK_PAGE = {
  TYPE: { marketing: '/bulk-orders/marketing', institutional: '/bulk-orders/institutional' } as Record<BulkType, string>,
  APPROVE: '/bulk-orders/approve',
} as const

export const BULK_STATUS = { PENDING: 'pending_approval', APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled' } as const
export type BulkStatus = (typeof BULK_STATUS)[keyof typeof BULK_STATUS]
export const BULK_STATUS_LABEL: Record<string, string> = { pending_approval: 'Pending approval', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled' }
export const BULK_STATUS_TONE: Record<string, 'warn' | 'ok' | 'crit' | 'neutral'> = { pending_approval: 'warn', approved: 'ok', rejected: 'crit', cancelled: 'neutral' }

/** Timeline words per event (backend BULK_EVENT). */
export const BULK_EVENT_LABEL: Record<string, string> = { created: 'Created', edited: 'Edited', cancelled: 'Cancelled', approved: 'Approved', rejected: 'Rejected' }

/** The design's markers (figma-make-bulk-orders): mode for Marketing only. */
export const BULK_MODES = ['Porter', 'Courier', 'Self pickup'] as const
export const BULK_PRIORITIES = ['Standard', 'Fast-track'] as const

export const BULK_LIMIT = {
  PAGE_SIZE: 50,
  SKU_QUERY_MIN: 2,
  /** Wait after the last key before the SKU search is sent (ms): one search per word typed, not per letter. Each text's
   *  answer is kept (STALE_MS), and an older search still on its way is cancelled (2026-11-11). */
  SKU_DEBOUNCE_MS: 350,
  LINES_MAX: 200,
} as const

export const BULK_TEXT = {
  APP: 'Bulk orders',
  BRAND: 'Post FG',
  NAV_ORDERS: 'Orders',
  NAV_LOCATIONS: 'Saved locations',
  NAV_APPROVALS: 'Approvals',
  APPROVALS_TITLE: 'Approval queue',
  APPROVALS_SUB: "Orders waiting for approval. Open one to change quantities or discounts, then approve or reject. Prices use today's MRP.",
  APPROVALS_EMPTY: 'Nothing waiting for approval',
  ORDERS_TITLE: 'Order worklist',
  ORDERS_SUB: 'Create, submit and track bulk orders. Prices are our MRP less your discount; an approver checks every order.',
  LOCATIONS_TITLE: 'Saved locations',
  LOCATIONS_SUB: 'Delivery addresses saved from the order form. Pick one in a new order instead of typing it again.',
  CREATE: 'Create order',
  SIGN_IN_TITLE: 'Bulk orders portal',
  SIGN_IN_SUB: 'Marketing and institutional bulk orders for mCaffeine.',
  SIGN_IN: 'Sign in with Google',
  SIGN_OUT: 'Sign out',
  NO_ACCESS_TITLE: 'No access to bulk orders',
  NO_ACCESS: 'Your account has no Bulk Orders role yet. Ask an admin to give you Marketing, Institutional or Approver.',
  LOADING: 'Loading…',
  EMPTY: 'No orders yet',
  EMPTY_FILTERED: 'No order matches the search or filter.',
  SEARCH: 'Search PO number, ordered by, receiver, city…',
  ALL_STATUSES: 'All statuses',
  ALL_TYPES: 'All',
  STAT_TOTAL: 'All orders',
  STAT_PENDING: 'Pending approval',
  STAT_APPROVED: 'Approved',
  STAT_REJECTED: 'Rejected',
  LOAD_MORE: 'Load more',
  SHOWING: (n: number, total: number) => `${n} of ${total}`,
  // create
  STEPS: ['Order items', 'Delivery details', 'Review & submit'],
  ITEMS_TITLE: 'What would you like to order?',
  ITEMS_SUB: 'Search our SKUs by code, name or EAN. The MRP fills in; add your discount % per SKU.',
  SKU_SEARCH: 'Search SKU code, name or EAN',
  SKU_NONE: 'No active SKU with an MRP matches',
  SKU_TYPE_MORE: 'Type at least 2 characters of the SKU code, name or EAN',
  ADD_LINE: 'Add another SKU',
  DELIVERY_TITLE: 'Delivery & receiving details',
  DELIVERY_SUB: 'Where and when this order is needed. Our team decides the warehouse after approval.',
  ORDERED_BY: 'Ordered by',
  ORDERED_BY_HINT: { marketing: 'Your team or campaign', institutional: 'Buyer / institution name' } as Record<BulkType, string>,
  NEEDED_BY: 'Needed by',
  RECEIVER_NAME: "Receiver's name",
  RECEIVER_PHONE: "Receiver's number",
  LOCATION: 'Delivery location',
  NEW_ADDRESS: 'New address',
  ADDRESS_LINE: 'Address',
  CITY: 'City',
  STATE: 'State',
  PINCODE: 'Pincode',
  SAVE_AS: 'Save this address as (optional)',
  SAVE_AS_HINT: 'e.g. Andheri store. Saved addresses can be picked in later orders.',
  MODE: 'Order mode',
  PRIORITY: 'Priority',
  NOTE: 'Note for the approver (optional)',
  REVIEW_TITLE: 'Review & submit',
  REVIEW_SUB: 'The order goes to an approver. The approver may change quantities or discounts before approving.',
  BACK: 'Back',
  NEXT: 'Next',
  SUBMIT: 'Submit for approval',
  SUBMITTING: 'Submitting…',
  CANCEL: 'Cancel',
  SUBMITTED: (po: string) => `${po} submitted for approval`,
  TYPE: 'Order type',
  // lines
  COL_SKU: 'SKU',
  COL_MRP: 'MRP',
  COL_QTY: 'Qty',
  COL_DISCOUNT: 'Discount %',
  COL_PRICE: 'Price',
  COL_TOTAL: 'Line total',
  TOTAL_UNITS: 'units',
  TOTAL_MRP: 'At MRP',
  TOTAL_VALUE: 'Order value',
  // list / drawer
  COL_PO: 'PO number',
  COL_BUYER: 'Ordered by / type',
  COL_ITEMS: 'Items',
  COL_NEEDED: 'Needed by',
  COL_LOCATION: 'Delivery location',
  COL_VALUE: 'Value',
  COL_STATUS: 'Status',
  DRAWER_ORDER: 'Order',
  DRAWER_DELIVERY: 'Delivery',
  DRAWER_LINES: 'SKUs',
  CREATED_BY: 'Created by',
  CHANGED_BY_APPROVER: (qty: number, d: number) => `Asked: ${qty} at ${d}%`,
  // locations
  ADD_LOCATION: 'Save a location',
  LABEL: 'Name',
  SAVE: 'Save',
  NO_LOCATIONS: 'No saved locations yet. Save one here or while creating an order.',
  // POST_FG PO Processing & Review > Bulk Orders (step 3a)
  TEAM_TAB: 'Bulk Orders',
  TEAM_SUB: 'Marketing and Institutional orders from the Bulk Orders portal. Approved ones wait for our team; processing them (warehouse, customer code, sale order) comes next.',
  TEAM_ALL: 'All',
  TEAM_WAITING: (n: number) => `${n} approved, waiting for us`,
  COL_APPROVED: 'Approved by',
  LOCATION_SAVED: (label: string) => `"${label}" saved`,
  // step 2
  EDIT: 'Edit order',
  EDIT_TITLE: (po: string) => `Edit ${po}`,
  SAVE_CHANGES: 'Save changes',
  SAVED: (po: string) => `${po} updated: still waiting for approval`,
  CANCEL_ORDER: 'Cancel order',
  CANCEL_REASON: 'Why cancel? (optional)',
  CANCEL_CONFIRM: 'Cancel this order',
  CANCELLED: (po: string) => `${po} cancelled`,
  KEEP: 'Keep it',
  APPROVE: 'Approve',
  APPROVE_HINT: "Change a quantity or discount if needed; prices are worked out again on today's MRP when you approve.",
  APPROVER_NOTE: 'Note for the requester (optional)',
  REJECT: 'Reject',
  REJECT_REASON: 'Reason (required)',
  REJECT_CONFIRM: 'Reject order',
  APPROVED: (po: string) => `${po} approved`,
  REJECTED: (po: string) => `${po} rejected`,
  REMOVE_LINE: 'Remove this line',
  RESTORE_LINE: 'Keep this line',
  DECISION: 'Decision',
  TIMELINE: 'Timeline',
  CHANGED: (what: string, from: string, to: string) => `${what} ${from} → ${to}`,
  REMOVED: 'removed',
  EDITED_FIELDS: (n: number) => `${n} detail${n === 1 ? '' : 's'} changed`,
} as const
