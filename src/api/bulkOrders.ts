import { api, ApiError, apiForm, apiUrl, apiWithMeta } from './client'
import { ERROR_CODE } from '../constants/auth'
import { BULK_ENDPOINT, BULK_LIMIT, type BulkType } from '../constants/bulkOrders'

/* Bulk Orders portal API (POST_FG routes/bulk-orders.routes.ts, API_REFERENCE #124-129). */

/** What the signed-in person may do in the portal (from GET /auth/me's /bulk-orders pages). */
export interface BulkRights {
  /** Types whose orders they may see / create. */
  view: BulkType[]
  create: BulkType[]
  approve: boolean
  /** Special permission "Bulk Orders: verify payments" (2026-11-13; admin / developer, or a role it is on for). */
  verifyPayment: boolean
  /** 2026-11-24: 'Bulk Orders: add payment details'. */
  paymentDetails: boolean
}

export interface BulkAddress { line: string; city: string; state: string; pincode: string }

export interface BulkOrder {
  id: string
  poNumber: string
  type: BulkType
  status: string
  orderedBy: string
  /** v2 piece 2: receivers of the order (the receiver fields here = receiver 1; all of them in `receivers` on one order). */
  receiverCount: number
  receiverName: string
  receiverPhone: string
  location: { id: string | null; label: string | null; address: BulkAddress }
  /** v2 1d: null = no date (optional for Normal). */
  neededBy: string | null
  mode: string | null
  priority: string
  /** Special instructions. */
  note: string | null
  /** v2 1d: Fast-track only. */
  fastTrackRemarks: string | null
  /** v2 1d: Marketing only. */
  purpose: string | null
  /** v2 1f: the order's brand (null on orders made before). */
  brand: string | null
  lineCount: number
  totalUnits: number
  /** null on Marketing / Head office in the portal (free orders: no amounts, 2026-11-24); our team's API has them. */
  totalMrp: number | null
  totalValue: number | null
  createdBy: { id: number; name: string | null }
  createdAt: string
  /** v2 piece 4: courier tracking from Uniware (null until the shipment shows there). */
  tracking: {
    awb: string | null; courier: string | null; courierStatus: string | null; link: string | null
    dispatchedAt: string | null; deliveredAt: string | null; invoiceCode: string | null; checkedAt: string | null
  } | null
  /** v2 1e: times changed after it was submitted ("Edited" tag). */
  editCount: number
  decidedBy: { id: number; name: string | null } | null
  decidedAt: string | null
  decisionNote: string | null
  /** null = no payment check on this order (off for its type when it was created). */
  payment: {
    status: string; by: { id: number; name: string | null } | null; at: string | null; note: string | null
    /** v2 piece 5b: the Razorpay link finance pasted (the buyer's Pay now). */
    link: string | null; linkAt: string | null
    /** 2026-11-24: bank details text (a QR = a payment_qr document). */
    bankDetails: string | null
  } | null
  /** Institutional requester details (null on Marketing orders; 2026-11-12). */
  institution: {
    /** v2 piece 5a: the saved customer it was placed for (null = typed) + whether finance verified its GSTIN (null = typed). */
    customerId: string | null; gstinVerified: boolean | null
    name: string; gstin: string | null; email: string | null; billingAddress: BulkAddress
  } | null
  /** Our team's sale order (step 3b); null until processed, and again after a send back. */
  saleOrder: {
    code: string; facilityCode: string; uniwareChannel: string; customerCode: string; uploadId: string | null
    by: { id: number; name: string | null } | null; at: string | null
  } | null
}

/**
 * A saved address + Uniware code of the customer book that matches an order (process-options, 2026-11-13: address book).
 * Best first: matchedBy 'address' (same delivery address: the panel fills the first one), then 'gstin', then 'name'.
 */
export interface BulkCustomerMatch {
  id: string; name: string; gstin: string | null; receiverName: string | null
  /** The customer's (billing) address. */
  address: BulkAddress
  /** The delivery address the code was used for (null on rows saved before 2026-11-13 without an order). */
  deliveryAddress: BulkAddress | null
  uniwareChannel: string; customerCode: string
  usedCount: number; lastUsedAt: string; matchedBy: 'address' | 'gstin' | 'name'
}
export interface BulkProcessOptions {
  /** Active warehouses; parentCode = its main (mother) warehouse, null = a main one. */
  facilities: { code: string; name: string | null; /** 2026-11-25: mother (MWH) or child (D2C / MWH under a mother) */ group: 'mother' | 'child'; parentCode: string | null }[]
  customers: BulkCustomerMatch[]
}
export interface BulkProcessInput { facilityCode: string; uniwareChannel: string; customerCode: string }

export interface BulkDocument {
  id: string; kind: string; fileName: string; contentType: string; sizeBytes: number
  by: { id: number; name: string | null }; at: string; replacedAt: string | null
}

export interface BulkSetting { type: BulkType; paymentCheck: boolean; approvalOverUnits: number | null; updatedBy: { id: number; name: string | null } | null; updatedAt: string | null }

export interface BulkOrderLine {
  lineNo: number; /** v2 piece 2 */ receiverNo: number; pepCode: string; name: string | null
  /** null on Marketing / Head office in the portal (free orders). */
  mrp: number | null; qty: number; discountPct: number
  unitPrice: number | null; lineTotal: number | null; requestedQty: number; requestedDiscountPct: number
}

/** One change of an order (created / edited / cancelled / approved / rejected); approved: line changes [old, new]. */
export interface BulkOrderEvent {
  action: string
  by: { id: number; name: string | null }
  at: string
  note: string | null
  changes: {
    lines?: { lineNo: number; pepCode: string; qty?: [number, number]; discountPct?: [number, number]; mrp?: [number, number]; removed?: boolean }[]
    fields?: string[]
    /** v2 1e: edited: each field old -> new, each line added / removed / changed. */
    fieldChanges?: { field: string; from: string | number | null; to: string | number | null }[]
    lineChanges?: { pepCode: string; change: 'added' | 'removed' | 'changed'; qty?: [number, number]; discountPct?: [number, number]; /** v2 piece 2 */ receiverNo?: number }[]
    /** v2 piece 2: receivers added / removed / changed by an edit. */
    receiverChanges?: { receiverNo: number; change: 'added' | 'removed' | 'changed'; name: string; fields?: { field: string; from: string | null; to: string | null }[] }[]
    /** v2 1c: created / edited: the reasons approval is needed ([] = none); an edit's order status move is in `status`. */
    approval?: string[]
    /** document_added */
    kind?: string; fileName?: string; replaced?: string[]
    /** payment: [old, new] */
    status?: [string, string]
    /** processed / sent_back */
    saleOrderCode?: string | null; facilityCode?: string; uniwareChannel?: string; customerCode?: string
  } | null
}

/** v2 piece 2: one receiver of an order (its sale order + tracking come with piece 2b). */
export interface BulkReceiver {
  receiverNo: number; receiverName: string; receiverPhone: string
  location: { id: string | null; label: string | null; address: BulkAddress }
  totalUnits: number; status: string | null; saleOrderCode: string | null
  tracking: BulkOrder['tracking']
}

export type BulkOrderFull = BulkOrder & { receivers: BulkReceiver[]; lines: BulkOrderLine[]; events: BulkOrderEvent[]; documents: BulkDocument[]; /** v2 piece 3: when Remind is possible (null = not waiting). */ remindAt: string | null }

export interface BulkApproveInput { lines?: { lineNo: number; qty?: number; discountPct?: number }[]; removeLines?: number[]; note?: string }

export interface BulkSku { pepCode: string; name: string | null; mrp: number; ean: string | null; brand?: string | null }

export interface BulkLocation { id: string; type: BulkType; label: string; address: BulkAddress; createdAt: string }

/** v2 piece 2: one receiver of a several-receivers order (Marketing / Head office). */
export interface BulkReceiverInput {
  receiverName: string
  receiverPhone: string
  locationId?: string
  address?: BulkAddress
  saveLocationAs?: string
  lines: { pepCode: string; qty: number }[]
}

export interface BulkOrderInput {
  type: BulkType
  orderedBy: string
  /** One receiver (as before): these + `lines`. Several: `receivers` instead (Marketing / Head office). */
  receiverName?: string
  receiverPhone?: string
  locationId?: string
  address?: BulkAddress
  saveLocationAs?: string
  neededBy?: string
  mode?: string
  priority: string
  note?: string
  fastTrackRemarks?: string
  /** v2 1e: required on an edit. */
  remark?: string
  purpose?: string
  /** v2 1f: required: one brand per order (a draft may leave it empty). */
  brand?: string
  /** v2 1g: true = save as a draft. */
  draft?: boolean
  lines?: { pepCode: string; qty: number; discountPct?: number }[]
  receivers?: BulkReceiverInput[]
  /** Institutional only (required: name + billing address or billingSameAsDelivery). */
  institutionName?: string
  gstin?: string
  contactEmail?: string
  billingSameAsDelivery?: boolean
  billingAddress?: BulkAddress
  /** v2 piece 5a: Institutional, placed for this saved customer (its billing details are used). */
  customerId?: string
}

/** type / status / payment: one value or several comma separated (the team's Filters panel, 2026-11-25). */
export interface BulkListQuery { type?: string; status?: string; payment?: string; q?: string; page?: number; pageSize?: number; archived?: boolean; /** our team: ready orders waiting more than N days */ waitingDays?: number }

const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** v2 1c: the approval rules of a type (list meta): more units than overUnits (null = never) or one of the modes. */
export interface BulkApprovalRule { overUnits: number | null; modes: string[] }
/** 2026-11-25: the head office address (admin setting; the default of Head office orders). */
export interface BulkHeadOffice { receiverName: string; receiverPhone: string; line: string; city: string; state: string; pincode: string }
export const listBulkOrders = (q: BulkListQuery) =>
  apiWithMeta<BulkOrder[], { total: number; page: number; pageSize: number; approvalRules: Partial<Record<BulkType, BulkApprovalRule>>; brands: string[]; headOffice?: BulkHeadOffice | null }>(
    `${BULK_ENDPOINT.ORDERS}${qs({ type: q.type, status: q.status, q: q.q, page: q.page, pageSize: q.pageSize ?? BULK_LIMIT.PAGE_SIZE, archived: q.archived ? 1 : undefined })}`,
  )

export const getBulkOrder = (id: string) => api<BulkOrderFull>(BULK_ENDPOINT.ORDER(id))

/** v2 piece 5a: an Institutional customer (Customers page). */
export interface BulkInstCustomer {
  id: string; companyName: string; gstin: string | null
  gstinVerified: { by: { id: number | null; name: string | null }; at: string } | null
  billingAddress: BulkAddress; contactName: string; contactPhone: string; contactEmail: string | null; defaultDiscountPct: number
  active: boolean; addresses: { id: string; label: string; address: BulkAddress; active: boolean }[]
  createdBy: { id: number; name: string | null }; createdAt: string; updatedAt: string
}
export interface BulkInstCustomerInput {
  companyName: string; gstin?: string; billingAddress: BulkAddress; contactName: string; contactPhone: string; contactEmail?: string
  defaultDiscountPct: number; active?: boolean; addresses?: { label: string; address: BulkAddress }[]
}
export const listInstCustomers = () => api<BulkInstCustomer[]>(BULK_ENDPOINT.CUSTOMERS)
export const addInstCustomer = (input: BulkInstCustomerInput) => api<BulkInstCustomer>(BULK_ENDPOINT.CUSTOMERS, { method: 'POST', body: JSON.stringify(input) })
export const updateInstCustomer = (id: string, input: BulkInstCustomerInput) => api<BulkInstCustomer>(BULK_ENDPOINT.CUSTOMER(id), { method: 'PUT', body: JSON.stringify(input) })
export const addInstCustomerAddress = (id: string, label: string, address: BulkAddress) =>
  api<BulkInstCustomer>(BULK_ENDPOINT.CUSTOMER_ADDRESSES(id), { method: 'POST', body: JSON.stringify({ label, address }) })
export const setInstCustomerAddressActive = (id: string, addressId: string, active: boolean) =>
  api<BulkInstCustomer>(BULK_ENDPOINT.CUSTOMER_ADDRESS(id, addressId), { method: 'PUT', body: JSON.stringify({ active }) })

/** 2026-11-24: units on hand per mother warehouse for each SKU of the order (null = not in the report). */
export interface BulkOrderStock { asOf: string | null; warehouses: string[]; note: string | null; skus: Record<string, Record<string, number> | null> }
export const getBulkOrderStock = (id: string, team = false) => api<BulkOrderStock>(team ? BULK_ENDPOINT.TEAM_STOCK(id) : BULK_ENDPOINT.STOCK(id))

/** 2026-11-24: a buyer organisation (admin, POST_FG Settings). */
export interface BulkBuyerOrg { id: string; name: string; active: boolean; members: { userId: number; email: string; name: string | null }[]; createdAt: string; updatedAt: string }
export const getHeadOffice = () => api<BulkHeadOffice | null>(BULK_ENDPOINT.HEAD_OFFICE)
export const saveHeadOffice = (b: { receiverName: string; receiverPhone: string; address: BulkAddress }) =>
  api<BulkHeadOffice | null>(BULK_ENDPOINT.HEAD_OFFICE, { method: 'PUT', body: JSON.stringify(b) })
export const listBuyerOrgs = () => api<BulkBuyerOrg[]>(BULK_ENDPOINT.ORGS)
export const addBuyerOrg = (name: string, emails: string[]) => api<BulkBuyerOrg>(BULK_ENDPOINT.ORGS, { method: 'POST', body: JSON.stringify({ name, emails }) })
export const updateBuyerOrg = (id: string, change: { name?: string; active?: boolean; emails?: string[] }) =>
  api<BulkBuyerOrg>(BULK_ENDPOINT.ORG(id), { method: 'PUT', body: JSON.stringify(change) })

/** 2026-11-24: my recent orders like this one (same SKUs, a pincode in common); [] = none. Never blocks. */
export const bulkDuplicateCheck = (type: BulkType, pepCodes: string[], pincodes: string[], excludeId?: string) =>
  api<{ id: string; poNumber: string; status: string; createdAt: string; totalUnits: number }[]>(BULK_ENDPOINT.DUPLICATE_CHECK, { method: 'POST', body: JSON.stringify({ type, pepCodes, pincodes, ...(excludeId ? { excludeId } : {}) }) })

/** v2 piece 2: one row of an uploaded receivers file (`row` = its row number in the file). */
export interface BulkReceiverRow { row: number; receiverName: string; receiverPhone: string; line: string; city: string; state: string; pincode: string; pepCode: string; qty: number | string }
export interface BulkReceiversChecked {
  receivers: { receiverName: string; receiverPhone: string; address: BulkAddress; lines: { pepCode: string; name: string | null; mrp: number; qty: number }[]; rows: number[] }[]
  errors: { row: number; field: string; message: string }[]
  rowCount: number
}
/** Checks the rows of an uploaded receivers file (nothing saved). */
export const checkBulkReceivers = (type: BulkType, brand: string, rows: BulkReceiverRow[]) =>
  api<BulkReceiversChecked>(BULK_ENDPOINT.RECEIVERS_CHECK, { method: 'POST', body: JSON.stringify({ type, brand, rows }) })

export const createBulkOrder = (input: BulkOrderInput) =>
  api<BulkOrderFull>(BULK_ENDPOINT.ORDERS, { method: 'POST', body: JSON.stringify(input) })

/** signal: an older search still on its way is cancelled when a newer one starts (TanStack Query passes it). */
/** Step 2 (only while pending approval; else 409 BULK_ORDER_NOT_PENDING). */
export const updateBulkOrder = (id: string, input: BulkOrderInput) =>
  api<BulkOrderFull>(BULK_ENDPOINT.ORDER(id), { method: 'PUT', body: JSON.stringify(input) })
export const cancelBulkOrder = (id: string, reason?: string) =>
  api<BulkOrderFull>(BULK_ENDPOINT.CANCEL(id), { method: 'POST', body: JSON.stringify(reason ? { reason } : {}) })
export const approveBulkOrder = (id: string, input: BulkApproveInput) =>
  api<BulkOrderFull>(BULK_ENDPOINT.APPROVE(id), { method: 'POST', body: JSON.stringify(input) })
export const rejectBulkOrder = (id: string, reason: string) =>
  api<BulkOrderFull>(BULK_ENDPOINT.REJECT(id), { method: 'POST', body: JSON.stringify({ reason }) })

/** POST_FG PO Processing & Review > Bulk Orders (step 3a, PO review access, read only): both types + meta.waiting. */
export const listTeamBulkOrders = (q: BulkListQuery) =>
  apiWithMeta<BulkOrder[], { total: number; page: number; pageSize: number; waiting: Record<BulkType, number>; paymentsToVerify: Record<BulkType, number> }>(
    `${BULK_ENDPOINT.TEAM}${qs({ type: q.type, status: q.status, payment: q.payment, q: q.q, page: q.page, pageSize: q.pageSize ?? BULK_LIMIT.PAGE_SIZE, waitingDays: q.waitingDays })}`,
  )
export const getTeamBulkOrder = (id: string) => api<BulkOrderFull>(BULK_ENDPOINT.TEAM_ORDER(id))
/** Step 3b (2026-11-12): warehouses + matching saved customers; create the sale order (PO review editor). */
export const getBulkProcessOptions = (id: string) => api<BulkProcessOptions>(BULK_ENDPOINT.TEAM_PROCESS_OPTIONS(id))
export const processBulkOrder = (id: string, input: BulkProcessInput) =>
  api<BulkOrderFull>(BULK_ENDPOINT.TEAM_PROCESS(id), { method: 'POST', body: JSON.stringify(input) })
/** "Don't suggest again" on a saved address (PO review editor; hidden, never deleted). */
export const hideBulkCustomer = (customerId: string) =>
  api<{ id: string; hidden: true }>(BULK_ENDPOINT.TEAM_CUSTOMER_HIDE(customerId), { method: 'POST', body: '{}' })

/** Payment + documents (2026-11-12). team = our team's routes (PO review access). */
export const uploadBulkDocument = (id: string, kind: string, file: File, team = false) => {
  const form = new FormData()
  form.append('kind', kind)
  form.append('file', file)
  return apiForm<BulkOrderFull>(team ? BULK_ENDPOINT.TEAM_DOCUMENTS(id) : BULK_ENDPOINT.DOCUMENTS(id), form)
}
/** A document's bytes for the in-app viewer (2026-11-13; BulkDocumentViewer). */
export async function getBulkDocumentBytes(id: string, docId: string, team: boolean, signal?: AbortSignal): Promise<ArrayBuffer> {
  let res: Response
  try {
    res = await fetch(apiUrl(team ? BULK_ENDPOINT.TEAM_DOCUMENT(id, docId) : BULK_ENDPOINT.DOCUMENT(id, docId)), { credentials: 'include', signal })
  } catch {
    throw new ApiError(0, ERROR_CODE.NETWORK, 'Cannot reach the server')
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null) as { error?: { code?: string; message?: string } } | null)?.error
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText)
  }
  return res.arrayBuffer()
}
/** Opens in a new tab (the browser sends the login cookie). */
export const bulkDocumentUrl = (id: string, docId: string, team = false) => apiUrl(team ? BULK_ENDPOINT.TEAM_DOCUMENT(id, docId) : BULK_ENDPOINT.DOCUMENT(id, docId))
/** team = POST_FG's route (2026-11-13); both need "Bulk Orders: verify payments". */
/** 2026-11-24: payment details ({ link?, bankDetails? }; '' clears one). */
export const setBulkPaymentDetails = (id: string, details: { link?: string; bankDetails?: string }, team = false) =>
  api<BulkOrderFull>(team ? BULK_ENDPOINT.TEAM_PAYMENT(id) : BULK_ENDPOINT.PAYMENT(id), { method: 'POST', body: JSON.stringify({ action: 'set_details', ...details }) })
/** v2 piece 5b: finance verifies (true) or un-verifies a customer's GSTIN. */
export const verifyInstCustomerGstin = (id: string, verified: boolean) =>
  api<BulkInstCustomer>(BULK_ENDPOINT.CUSTOMER_GSTIN(id), { method: 'POST', body: JSON.stringify({ verified }) })
export const setBulkPayment = (id: string, action: string, note?: string, team = false) =>
  api<BulkOrderFull>(team ? BULK_ENDPOINT.TEAM_PAYMENT(id) : BULK_ENDPOINT.PAYMENT(id), { method: 'POST', body: JSON.stringify(note ? { action, note } : { action }) })
export const listBulkSettings = () => api<BulkSetting[]>(BULK_ENDPOINT.SETTINGS)
/** v2 piece 3: email switches (POST_FG admin) and the requester's reminder. */
export interface BulkNotifySettings { emails: boolean; approvalNeeded: boolean; decision: boolean; remind: boolean; payment: boolean }
export const getBulkNotifySettings = () => api<BulkNotifySettings>(BULK_ENDPOINT.NOTIFY_SETTINGS)
export const saveBulkNotifySettings = (change: Partial<BulkNotifySettings>) => api<BulkNotifySettings>(BULK_ENDPOINT.NOTIFY_SETTINGS, { method: 'PUT', body: JSON.stringify(change) })
export const remindBulkOrder = (id: string) => api<BulkOrderFull>(BULK_ENDPOINT.REMIND(id), { method: 'POST', body: '{}' })
export const updateBulkSetting = (type: BulkType, change: { paymentCheck?: boolean; approvalOverUnits?: number | null }) =>
  api<BulkSetting[]>(BULK_ENDPOINT.SETTING(type), { method: 'PUT', body: JSON.stringify(change) })

/** v2 1f: SKUs of one brand only (no brand = nothing). */
export const searchBulkSkus = (q: string, brand: string, signal?: AbortSignal) => api<BulkSku[]>(`${BULK_ENDPOINT.SKUS}${qs({ q, brand })}`, { signal })

export const listBulkLocations = (type: BulkType) => api<BulkLocation[]>(`${BULK_ENDPOINT.LOCATIONS}${qs({ type })}`)

export const addBulkLocation = (input: { type: BulkType; label: string; address: BulkAddress }) =>
  api<BulkLocation>(BULK_ENDPOINT.LOCATIONS, { method: 'POST', body: JSON.stringify(input) })
