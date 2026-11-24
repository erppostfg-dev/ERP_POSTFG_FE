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
  DOCUMENTS: (id: string) => `/bulk-orders/${encodeURIComponent(id)}/documents`,
  DOCUMENT: (id: string, docId: string) => `/bulk-orders/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}`,
  PAYMENT: (id: string) => `/bulk-orders/${encodeURIComponent(id)}/payment`,
  SETTINGS: '/bulk-orders/settings',
  /** v2 piece 3: email switches (admin) + the requester's reminder. */
  NOTIFY_SETTINGS: '/bulk-orders/settings/notifications',
  REMIND: (id: string) => `/bulk-orders/${encodeURIComponent(id)}/remind`,
  SETTING: (type: string) => `/bulk-orders/settings/${encodeURIComponent(type)}`,
  SKUS: '/bulk-orders/skus',
  LOCATIONS: '/bulk-orders/locations',
  /** Our team's read-only view in POST_FG (PO Processing & Review > Bulk Orders, step 3a). */
  TEAM: '/po-review/bulk-orders',
  TEAM_ORDER: (id: string) => `/po-review/bulk-orders/${encodeURIComponent(id)}`,
  TEAM_DOCUMENTS: (id: string) => `/po-review/bulk-orders/${encodeURIComponent(id)}/documents`,
  TEAM_DOCUMENT: (id: string, docId: string) => `/po-review/bulk-orders/${encodeURIComponent(id)}/documents/${encodeURIComponent(docId)}`,
  /** Step 3b (2026-11-12): warehouses + matching saved customers; create the sale order (PO review editor). */
  TEAM_PROCESS_OPTIONS: (id: string) => `/po-review/bulk-orders/${encodeURIComponent(id)}/process-options`,
  TEAM_PROCESS: (id: string) => `/po-review/bulk-orders/${encodeURIComponent(id)}/process`,
  TEAM_CUSTOMER_HIDE: (customerId: string) => `/po-review/bulk-orders/customers/${encodeURIComponent(customerId)}/hide`,
  TEAM_PAYMENT: (id: string) => `/po-review/bulk-orders/${encodeURIComponent(id)}/payment`,
  /** Sign-in started here comes back to the portal (backend BULK_PORTAL_URL). */
  GOOGLE: '/auth/google?app=bulk',
} as const

/** Head office (Bulk Orders Portal v2, 2026-11-23): works exactly like Marketing (backend MARKETING_LIKE_TYPES). */
export const BULK_TYPE = { MARKETING: 'marketing', HEAD_OFFICE: 'head_office', INSTITUTIONAL: 'institutional' } as const
export type BulkType = (typeof BULK_TYPE)[keyof typeof BULK_TYPE]
export const BULK_TYPES: BulkType[] = [BULK_TYPE.MARKETING, BULK_TYPE.HEAD_OFFICE, BULK_TYPE.INSTITUTIONAL]
export const BULK_TYPE_LABEL: Record<BulkType, string> = { marketing: 'Marketing', head_office: 'Head office', institutional: 'Institutional' }
/** Types that behave like Marketing: delivery mode, no amounts on the portal, no institution details (backend isMarketingLike). */
export const isMarketingLike = (type: string): boolean => type === BULK_TYPE.MARKETING || type === BULK_TYPE.HEAD_OFFICE

/** Backend page keys (POST_FG constants/auth.ts PAGES). */
export const BULK_PAGE = {
  /** Head office = the Marketing page (the same people, user 2026-11-23). */
  TYPE: { marketing: '/bulk-orders/marketing', head_office: '/bulk-orders/marketing', institutional: '/bulk-orders/institutional' } as Record<BulkType, string>,
  APPROVE: '/bulk-orders/approve',
} as const

/** v2 1c (2026-11-23): SUBMITTED = no approval needed, with our team; READY = list filter approved + submitted (team tab). */
export const BULK_STATUS = { DISPATCHED: 'dispatched', DELIVERED: 'delivered', DRAFT: 'draft', PENDING: 'pending_approval', SUBMITTED: 'submitted', APPROVED: 'approved', REJECTED: 'rejected', CANCELLED: 'cancelled', PROCESSING: 'processing' } as const
/** v2 1g: list filter "active" (submitted + pending + approved; backend BULK_LIST_ACTIVE). */
export const BULK_LIST_ACTIVE = 'active'
export const BULK_LIST_READY = 'ready'
/** Statuses the requester may still edit / cancel (backend BULK_EDITABLE_STATUSES). */
export const BULK_EDITABLE: string[] = [BULK_STATUS.PENDING, BULK_STATUS.SUBMITTED, BULK_STATUS.DRAFT]
/** Statuses our team may turn into a sale order (backend BULK_PROCESSABLE_STATUSES). */
export const BULK_PROCESSABLE: string[] = [BULK_STATUS.APPROVED, BULK_STATUS.SUBMITTED]
export type BulkStatus = (typeof BULK_STATUS)[keyof typeof BULK_STATUS]
/** v2 1g: "processing" (our team made the sale order) reads "Order placed". */
export const BULK_STATUS_LABEL: Record<string, string> = { dispatched: 'Dispatched', delivered: 'Delivered', draft: 'Draft', pending_approval: 'Pending approval', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected', cancelled: 'Cancelled', processing: 'Order placed' }
export const BULK_STATUS_TONE: Record<string, 'warn' | 'ok' | 'crit' | 'neutral' | 'info'> = { dispatched: 'info', delivered: 'ok', draft: 'neutral', pending_approval: 'warn', submitted: 'ok', approved: 'ok', rejected: 'crit', cancelled: 'neutral', processing: 'info' }
/** Institutional requester checks (same as the backend BULK_INSTITUTION). */
export const BULK_INSTITUTION_RE = {
  GSTIN: /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/,
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
} as const
/** Order types our team can process into a sale order now (backend BULK_SALE.TYPES; Marketing since 2026-11-13). */
export const BULK_PROCESS_TYPES: BulkType[] = [BULK_TYPE.INSTITUTIONAL, BULK_TYPE.MARKETING, BULK_TYPE.HEAD_OFFICE]
/**
 * Every unit of a Marketing / Head office order in Uniware (backend MARKETING_UNIT_PRICE; v2 2026-11-23: ₹0.01, was ₹1,
 * a constant until Uniware confirms it).
 */
export const MARKETING_UNIT_PRICE = 0.01
/**
 * Fixed price per unit by type (backend BULK_ORDERS.FIXED_UNIT_PRICE; user 2026-11-13, "don't show the amount to them"):
 * the PORTAL shows no MRP / discount / price / totals for these types (only SKU + qty and "Free order", v2 2026-11-23);
 * our team in POST_FG sees the real price.
 */
export const BULK_FIXED_PRICE: Partial<Record<BulkType, number>> = { [BULK_TYPE.MARKETING]: MARKETING_UNIT_PRICE, [BULK_TYPE.HEAD_OFFICE]: MARKETING_UNIT_PRICE }
/** v2 (2026-11-23, backend BULK_ORDERS.DISCOUNT_MAX / LINE_TOTAL_MIN): discount below 100%, every priced line at least ₹1. */
export const BULK_DISCOUNT_BELOW = 100
export const BULK_LINE_TOTAL_MIN = 1
/** The portal hides every amount on orders of this type. */
export const bulkHidesMoney = (type: string): boolean => BULK_FIXED_PRICE[type as BulkType] !== undefined

/** Timeline words per event (backend BULK_EVENT). */
export const BULK_EVENT_LABEL: Record<string, string> = {
  created: 'Created', edited: 'Edited', cancelled: 'Cancelled', approved: 'Approved', rejected: 'Rejected', document_added: 'Document uploaded', payment: 'Payment',
  processed: 'Sale order created', sent_back: 'Sale order sent back', submitted: 'Submitted', tracking: 'Courier update (Uniware)', reminded: 'Reminder sent to our team',
}

/**
 * Payment check (backend BULK_PAYMENT_STATUS, 2026-11-12): only orders whose type has it ON (Settings); never blocks
 * approval or processing; people with "Bulk Orders: verify payments" verify / refuses the proof or marks it not needed.
 */
export const BULK_PAYMENT = { AWAITING: 'awaiting_proof', UPLOADED: 'proof_uploaded', VERIFIED: 'verified', REFUSED: 'refused', NOT_NEEDED: 'not_needed' } as const
export const BULK_PAYMENT_LABEL: Record<string, string> = {
  awaiting_proof: 'Awaiting proof', proof_uploaded: 'Proof uploaded · to check', verified: 'Payment verified', refused: 'Proof refused', not_needed: 'Not needed',
}
export const BULK_PAYMENT_TONE: Record<string, 'warn' | 'ok' | 'crit' | 'neutral' | 'info'> = {
  awaiting_proof: 'neutral', proof_uploaded: 'warn', verified: 'ok', refused: 'crit', not_needed: 'info',
}
export const BULK_PAYMENT_ACTION = { VERIFY: 'verify', REFUSE: 'refuse', NOT_NEEDED: 'not_needed' } as const
export type BulkPaymentAction = (typeof BULK_PAYMENT_ACTION)[keyof typeof BULK_PAYMENT_ACTION]

/** Documents on an order (backend BULK_DOC_KIND); PDF / PNG / JPG up to 10 MB. */
export const BULK_DOC_KIND = { PROFORMA: 'proforma_invoice', INVOICE: 'invoice', PAYMENT_PROOF: 'payment_proof' } as const
/** A document's content type -> the file viewer's type (the name may have no extension). */
export const BULK_DOC_EXT: Record<string, string> = { 'application/pdf': 'pdf', 'image/png': 'png', 'image/jpeg': 'jpg' }
export const BULK_DOC_KIND_LABEL: Record<string, string> = { proforma_invoice: 'Proforma invoice', invoice: 'Invoice', payment_proof: 'Proof of payment' }
export const BULK_DOC_ACCEPT = '.pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg'
export const BULK_DOC_MAX_BYTES = 10 * 1024 * 1024

/**
 * The status timeline's steps (design figma-make-bulk-orders Timeline). Today the backend reaches Submitted + Approved;
 * Processing comes with step 3b, Ready to Dispatch / Dispatched / Delivered with the Uniware status of its sale order.
 */
/** v2 1g: "Ready to Dispatch" removed; Dispatched / Delivered come from courier tracking (later piece). */
export const BULK_STEPS = ['Submitted', 'Approved', 'Order placed', 'Dispatched', 'Delivered'] as const
/** How far an order status is on BULK_STEPS (index of the last step done). */
export const BULK_STEP_OF: Record<string, number> = { draft: -1, pending_approval: 0, submitted: 1, approved: 1, processing: 2, dispatched: 3, delivered: 4 }

/** The design's markers (figma-make-bulk-orders): mode for Marketing only. */
/** v2 1d (2026-11-23): Porter / Regular, Normal / Fast-track (backend BULK_DELIVERY_MODES / BULK_PRIORITIES). */
export const BULK_MODES = ['Porter', 'Regular'] as const
export const BULK_PRIORITIES = ['Normal', 'Fast-track'] as const
export const BULK_FAST_TRACK = 'Fast-track'
/** v2 1d: Purpose is asked on Marketing orders only (not Head office / Institutional). */
export const BULK_PURPOSE_TYPES: string[] = ['marketing']

export const BULK_LIMIT = {
  PAGE_SIZE: 50,
  /** The server allows up to 200 a page (backend BULK_ORDERS.PAGE_SIZE_MAX): CSV export reads with it. */
  PAGE_SIZE_MAX: 200,
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
  /** v2 1g worklist cards. */
  STAT_ACTIVE: 'Active',
  STAT_PLACED: 'Order placed',
  STAT_DISPATCHED: 'Dispatched',
  STAT_DISPATCHED_HINT: 'Set by Uniware when the shipment leaves the warehouse',
  /** v2 piece 4: courier tracking (from Uniware). */
  TRACKING: 'Courier tracking',
  /** v2 piece 3: bell, remind, email switches. */
  BELL: 'Notifications',
  BELL_EMPTY: 'Nothing new.',
  REMIND: 'Remind our team',
  REMIND_AT: (t: string) => `Remind possible from ${t}`,
  REMIND_HINT: 'Sends a reminder to our team (bell + email) to place this order.',
  REMINDED: (po: string) => `Reminder sent for ${po}`,
  NOTIFY_TITLE: 'Notifications (email)',
  NOTIFY_SUB: 'The bell always shows these. These switches only control the emails.',
  NOTIFY_EMAILS: 'Send emails',
  NOTIFY_APPROVAL: 'Approval needed (to the approvers)',
  NOTIFY_DECISION: 'Approved / rejected (to the requester)',
  NOTIFY_REMIND: 'Remind (to our COPT team)',
  AWB: 'AWB',
  COURIER: 'Courier',
  COURIER_STATUS: 'Courier status',
  DISPATCHED_ON: 'Dispatched',
  DELIVERED_ON: 'Delivered',
  INVOICE: 'Invoice',
  TRACK_LINK: 'Track',
  TRACKING_UPDATED: (t: string) => `Updated from Uniware ${t}`,
  COL_COURIER: 'Courier',
  SAVE_DRAFT: 'Save as draft',
  DRAFT_SAVED: (po: string) => `Draft ${po} saved: open it from the list to continue`,
  CONTINUE_DRAFT: 'Continue',
  DISCARD_DRAFT: 'Discard draft',
  ARCHIVE: 'Archive',
  ARCHIVE_HINT: 'Rejected / cancelled orders older than 30 days',
  EXPORT_CSV: 'Export CSV',
  EXPORTING: 'Exporting...',
  STAT_PENDING: 'Pending approval',
  STAT_APPROVED: 'Approved',
  STAT_SUBMITTED: 'Submitted (no approval)',
  /** v2 1c timeline: why the order needs approval / moved. */
  EVENT_APPROVAL: (why: string) => `Needs approval: ${why}`,
  EVENT_NO_APPROVAL: 'No approval needed',
  EVENT_STATUS: (from: string, to: string) => `${from} → ${to}`,
  STAT_REJECTED: 'Rejected',
  LOAD_MORE: 'Load more',
  SHOWING: (n: number, total: number) => `${n} of ${total}`,
  // create
  STEPS: ['Order items', 'Delivery details', 'Review & submit'],
  ITEMS_TITLE: 'What would you like to order?',
  ITEMS_SUB: 'Search our SKUs by code, name or EAN. The MRP fills in; add your discount % per SKU.',
  /** v2 1f: one brand per order (the SKU master's brand). */
  BRAND_LABEL: 'Brand',
  BRAND_PICK: 'Select the brand',
  BRAND_HINT: 'One brand per order. Only SKUs of this brand can be added.',
  BRAND_FIRST: 'Select the brand first',
  BRAND_CHANGED: 'Brand changed: the SKUs of the other brand were removed.',
  BRAND_NONE: 'No brands yet: the SKU master has no brand filled in. Ask the masters team.',
  ITEMS_SUB_QTY_ONLY: 'Search our SKUs by code, name or EAN and type the quantity of each.',
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
  NOTE: 'Special instructions (optional)',
  NOTE_HINT: 'Shown to our team when they place the order',
  NEEDED_BY_OPTIONAL: 'Needed by (optional for Normal)',
  FAST_TRACK_REMARKS: 'Why is it urgent?',
  PURPOSE: 'Purpose (optional)',
  PURPOSE_HINT: 'e.g. influencer seeding, an event name',
  ERR_REQUIRED: 'Required',
  ERR_PHONE: 'A 10-digit phone number (+91, 0, spaces are fine)',
  ERR_PIN: 'A 6-digit pincode',
  ERR_DATE_PAST: 'Today or later',
  ERR_NEEDED_BY_FAST: 'Required for Fast-track',
  ERR_REMARKS: 'Required for Fast-track: say why it is urgent',
  REVIEW_FIX: 'Fix these before you submit:',
  ERR_FIELD: (label: string, why: string) => `${label}: ${why}`,
  REVIEW_TITLE: 'Review & submit',
  REVIEW_SUB: 'Check the order before you submit it.',
  /** v2 1c: what happens on Submit (from the approval rules of the type). */
  NEEDS_APPROVAL: (why: string) => `Needs approval: ${why}. The approver may change quantities or discounts before approving.`,
  NO_APPROVAL: 'No approval needed: the order goes straight to our team.',
  WHY_UNITS: (units: number, over: number) => `${units} units (over ${over})`,
  WHY_MODE: (mode: string) => `${mode} delivery`,
  STEP_NO_APPROVAL: 'No approval needed',
  TEAM_READY: 'To process',
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
  /** v2 (2026-11-23): shown instead of amounts on Marketing / Head office orders. */
  FREE_ORDER: 'Free order',
  LINE_UNDER_MIN: (min: string) => `Each line must come to at least ${min}: lower the discount or raise the qty`,
  DISCOUNT_RULE: 'Discount below 100%',
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
  /** POST_FG Bulk Orders filter (2026-11-13): proofs of payment waiting to be checked. */
  PAYMENTS_TO_VERIFY: 'Payments to verify',
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
  APPROVE_HINT_QTY_ONLY: 'Change a quantity or remove a SKU if needed, then approve.',
  ASKED_QTY: (qty: number) => `Asked: ${qty}`,
  APPROVER_NOTE: 'Note for the requester (optional)',
  REJECT: 'Reject',
  REJECT_REASON: 'Reason (required)',
  REJECT_CONFIRM: 'Reject order',
  APPROVED: (po: string) => `${po} approved`,
  REJECTED: (po: string) => `${po} rejected`,
  REMOVE_LINE: 'Remove this line',
  RESTORE_LINE: 'Keep this line',
  DECISION: 'Decision',
  TIMELINE: 'History',
  // payment + documents (2026-11-12)
  PAYMENT: 'Payment',
  DOCUMENTS: 'Payments & documents',
  DOCUMENTS_SUB: 'Proforma, invoice and proof of payment: PDF, PNG or JPG up to 10 MB. A new file of the same kind replaces the old one (kept).',
  NO_DOCUMENTS: 'No documents uploaded yet.',
  UPLOAD: 'Upload file',
  UPLOADING: 'Uploading…',
  UPLOADED: (name: string) => `${name} uploaded`,
  TOO_BIG: 'The file is bigger than 10 MB',
  VIEW: 'View',
  REPLACED: 'replaced',
  PAYMENT_NOTE: 'Note (required to refuse)',
  VERIFY_PAYMENT: 'Verify payment',
  VERIFY_HERE: 'Check the proof on the left against the order, then verify it or refuse it with a reason.',
  CHECKED_BY: 'Checked by',
  REFUSE_PROOF: 'Refuse proof',
  PAYMENT_NOT_NEEDED: 'Payment not needed',
  /** Payment card + documents (2026-11-13, BulkDocumentsSection). */
  DOCUMENTS_ONLY: 'Documents',
  PAY_AWAITING: 'Waiting for the proof of payment',
  PAY_AWAITING_SUB: 'Upload it below when it comes. It never holds the order.',
  PAY_UPLOADED: 'Proof uploaded · waiting to be checked',
  PAY_UPLOADED_SUB: 'Open the proof to check it against the order.',
  PAY_VERIFIED: 'Payment verified',
  PAY_REFUSED: 'Proof refused',
  PAY_REFUSED_SUB: 'Upload a new proof below.',
  PAY_NOT_NEEDED: 'Payment not needed',
  PAY_BY: (name: string, at: string) => `by ${name} · ${at}`,
  REVIEW_VERIFY: 'Review & verify',
  DROP_FILE: (kind: string) => `Drop the ${kind.toLowerCase()} here, or click to choose`,
  DROP_TYPES: 'PDF, PNG or JPG · up to 10 MB · a new file of the same kind replaces the old one (kept)',
  PAYMENT_SAVED: (label: string) => `Payment: ${label}`,
  PAYMENT_HINT: 'Payment never holds the order: approve and process as usual, check the proof whenever it comes.',
  COL_PAYMENT: 'Payment',
  // POST_FG Users & Roles -> Settings -> Bulk Orders (central admin)
  SETTINGS_SUB: 'Bulk Orders portal, per order type. A change applies to orders created after it.',
  PAYMENT_CHECK: 'Proof of payment check',
  APPROVAL_OVER: 'Approval needed above',
  APPROVAL_OVER_UNITS: 'units',
  APPROVAL_NEVER: 'Never by size',
  APPROVAL_HINT: 'An order with MORE units than this needs approval; Porter delivery always does (Marketing, Head office). Empty = never by size. Applies to orders created or edited after the change.',
  PAYMENT_CHECK_HINT: 'ON: new orders get a payment status (awaiting proof); people with "Bulk Orders: verify payments" (admin, developer, or a role it is on for) verify the proof. Never blocks the order.',
  CHANGED_BY: (name: string, at: string) => `Changed by ${name} · ${at}`,
  STATUS_TIMELINE: 'Status timeline',
  CLOSED: 'Order closed',
  CHANGED: (what: string, from: string, to: string) => `${what} ${from} → ${to}`,
  REMOVED: 'removed',
  EDITED_FIELDS: (n: number) => `${n} detail${n === 1 ? '' : 's'} changed`,
  /** v2 1e: edits need a remark; the history shows old -> new. */
  EDIT_REMARK: 'Why are you changing this order?',
  EDIT_REMARK_HINT: 'Required. Kept in the order history with the changes.',
  EDITED_TAG: 'Edited',
  EDITED_TAG_TITLE: (n: number) => `Changed ${n} time${n === 1 ? '' : 's'} after it was submitted: see History`,
  EDITED_BANNER: (n: number) => `This order was changed ${n} time${n === 1 ? '' : 's'} after it was submitted. The changes are in History below.`,
  CHANGE_FROM_TO: (label: string, from: string, to: string) => `${label}: ${from} → ${to}`,
  LINE_ADDED: (code: string, qty: number) => `${code}: added (${qty})`,
  LINE_REMOVED: (code: string) => `${code}: removed`,
  EMPTY_VALUE: '(empty)',
  // Institutional requester details (2026-11-12, required where marked)
  INSTITUTION_TITLE: 'Institution (billing)',
  INSTITUTION_SUB: 'Used for the invoice and the customer in Uniware.',
  INSTITUTION_NAME: 'Institution name',
  GSTIN: 'GSTIN (optional)',
  CONTACT_EMAIL: 'Contact email (optional)',
  BILLING_SAME: 'Billing address is the same as the delivery address',
  BILLING_LINE: 'Billing address',
  BAD_GSTIN: 'GSTIN: 15 characters, e.g. 27AAAAA0000A1Z5',
  BAD_EMAIL: 'Not an email address',
  // Step 3b: our team creates the sale order in POST_FG
  SALE_ORDER: 'Sale order',
  PROCESS_TITLE: 'Create sale order',
  PROCESS_SUB: 'Create the customer in Uniware if needed, then fill these. The sale order goes to Processed and PO Overview like any PO.',
  WAREHOUSE: 'Warehouse',
  PICK_WAREHOUSE: 'Pick a warehouse',
  SEARCH_WAREHOUSE: 'Search warehouse code or name…',
  NO_WAREHOUSE: 'No warehouse matches',
  UNIWARE_CHANNEL: 'Uniware channel',
  CUSTOMER_CODE: 'Uniware customer code',
  SUGGESTED: 'Saved before for this address / customer',
  USE: 'Use',
  USED_TIMES: (n: number) => `used on ${n} order${n === 1 ? '' : 's'}`,
  MATCHED_BY: { address: 'same delivery address', gstin: 'same GSTIN, other address', name: 'same name + pincode' } as Record<string, string>,
  // address book (2026-11-13, user: "fill it, but they have to create the sale order by checking")
  FILLED_FROM: (n: number, at: string) => `Filled from a saved address (${n === 1 ? 'used once' : `used ${n} times`}, last on ${at}). Check the Uniware channel and customer code before creating.`,
  CHECKED: 'I checked the Uniware channel and customer code for this address',
  HIDE: "Don't suggest",
  HIDE_ASK: 'Stop suggesting this?',
  HIDE_YES: 'Yes',
  HIDE_NO: 'No',
  LAST_USED: (at: string) => `last ${at}`,
  CREATE_SALE_ORDER: 'Create sale order',
  CREATING: 'Creating…',
  CREATED: (code: string) => `Sale order ${code} created`,
  PROCESS_LATER: 'Marketing orders are processed in POST_FG in the next step.',
  FIXED_PRICE_NOTE: (price: string) => `Every unit goes to Uniware at ${price} (no discount). Type the Uniware channel (e.g. JIVA) and its customer code.`,
  PAYMENT_PENDING_NOTE: 'Payment not verified yet: you can still create the sale order; check payment before dispatch.',
} as const

/** v2 1e: names of the order fields in the history (backend field keys -> words). */
export const BULK_FIELD_LABEL: Record<string, string> = {
  orderedBy: 'Ordered by', receiverName: 'Receiver', receiverPhone: 'Receiver phone', neededBy: 'Needed by',
  deliveryMode: 'Order mode', priority: 'Priority', note: 'Special instructions', fastTrackRemarks: 'Why urgent', purpose: 'Purpose',
  locationId: 'Saved location', locationLabel: 'Location name', addressLine: 'Address', city: 'City', state: 'State', pincode: 'Pincode',
  institutionName: 'Institution', gstin: 'GSTIN', contactEmail: 'Contact email',
  billingAddressLine: 'Billing address', billingCity: 'Billing city', billingState: 'Billing state', billingPincode: 'Billing pincode',
}
