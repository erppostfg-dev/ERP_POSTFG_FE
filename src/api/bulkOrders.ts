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
}

export interface BulkAddress { line: string; city: string; state: string; pincode: string }

export interface BulkOrder {
  id: string
  poNumber: string
  type: BulkType
  status: string
  orderedBy: string
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
  lineCount: number
  totalUnits: number
  totalMrp: number
  totalValue: number
  createdBy: { id: number; name: string | null }
  createdAt: string
  decidedBy: { id: number; name: string | null } | null
  decidedAt: string | null
  decisionNote: string | null
  /** null = no payment check on this order (off for its type when it was created). */
  payment: { status: string; by: { id: number; name: string | null } | null; at: string | null; note: string | null } | null
  /** Institutional requester details (null on Marketing orders; 2026-11-12). */
  institution: { name: string; gstin: string | null; email: string | null; billingAddress: BulkAddress } | null
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
  facilities: { code: string; name: string | null; parentCode: string | null }[]
  customers: BulkCustomerMatch[]
}
export interface BulkProcessInput { facilityCode: string; uniwareChannel: string; customerCode: string }

export interface BulkDocument {
  id: string; kind: string; fileName: string; contentType: string; sizeBytes: number
  by: { id: number; name: string | null }; at: string; replacedAt: string | null
}

export interface BulkSetting { type: BulkType; paymentCheck: boolean; approvalOverUnits: number | null; updatedBy: { id: number; name: string | null } | null; updatedAt: string | null }

export interface BulkOrderLine {
  lineNo: number; pepCode: string; name: string | null; mrp: number; qty: number; discountPct: number
  unitPrice: number; lineTotal: number; requestedQty: number; requestedDiscountPct: number
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

export type BulkOrderFull = BulkOrder & { lines: BulkOrderLine[]; events: BulkOrderEvent[]; documents: BulkDocument[] }

export interface BulkApproveInput { lines?: { lineNo: number; qty?: number; discountPct?: number }[]; removeLines?: number[]; note?: string }

export interface BulkSku { pepCode: string; name: string | null; mrp: number; ean: string | null }

export interface BulkLocation { id: string; type: BulkType; label: string; address: BulkAddress; createdAt: string }

export interface BulkOrderInput {
  type: BulkType
  orderedBy: string
  receiverName: string
  receiverPhone: string
  locationId?: string
  address?: BulkAddress
  saveLocationAs?: string
  neededBy?: string
  mode?: string
  priority: string
  note?: string
  fastTrackRemarks?: string
  purpose?: string
  lines: { pepCode: string; qty: number; discountPct?: number }[]
  /** Institutional only (required: name + billing address or billingSameAsDelivery). */
  institutionName?: string
  gstin?: string
  contactEmail?: string
  billingSameAsDelivery?: boolean
  billingAddress?: BulkAddress
}

export interface BulkListQuery { type?: BulkType | ''; status?: string; payment?: string; q?: string; page?: number; pageSize?: number }

const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

/** v2 1c: the approval rules of a type (list meta): more units than overUnits (null = never) or one of the modes. */
export interface BulkApprovalRule { overUnits: number | null; modes: string[] }
export const listBulkOrders = (q: BulkListQuery) =>
  apiWithMeta<BulkOrder[], { total: number; page: number; pageSize: number; approvalRules: Partial<Record<BulkType, BulkApprovalRule>> }>(
    `${BULK_ENDPOINT.ORDERS}${qs({ type: q.type, status: q.status, q: q.q, page: q.page, pageSize: q.pageSize ?? BULK_LIMIT.PAGE_SIZE })}`,
  )

export const getBulkOrder = (id: string) => api<BulkOrderFull>(BULK_ENDPOINT.ORDER(id))

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
    `${BULK_ENDPOINT.TEAM}${qs({ type: q.type, status: q.status, payment: q.payment, q: q.q, page: q.page, pageSize: q.pageSize ?? BULK_LIMIT.PAGE_SIZE })}`,
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
export const setBulkPayment = (id: string, action: string, note?: string, team = false) =>
  api<BulkOrderFull>(team ? BULK_ENDPOINT.TEAM_PAYMENT(id) : BULK_ENDPOINT.PAYMENT(id), { method: 'POST', body: JSON.stringify(note ? { action, note } : { action }) })
export const listBulkSettings = () => api<BulkSetting[]>(BULK_ENDPOINT.SETTINGS)
export const updateBulkSetting = (type: BulkType, change: { paymentCheck?: boolean; approvalOverUnits?: number | null }) =>
  api<BulkSetting[]>(BULK_ENDPOINT.SETTING(type), { method: 'PUT', body: JSON.stringify(change) })

export const searchBulkSkus = (q: string, signal?: AbortSignal) => api<BulkSku[]>(`${BULK_ENDPOINT.SKUS}${qs({ q })}`, { signal })

export const listBulkLocations = (type: BulkType) => api<BulkLocation[]>(`${BULK_ENDPOINT.LOCATIONS}${qs({ type })}`)

export const addBulkLocation = (input: { type: BulkType; label: string; address: BulkAddress }) =>
  api<BulkLocation>(BULK_ENDPOINT.LOCATIONS, { method: 'POST', body: JSON.stringify(input) })
