import { api, apiForm, apiUrl, apiWithMeta } from './client'
import { BULK_ENDPOINT, BULK_LIMIT, type BulkType } from '../constants/bulkOrders'

/* Bulk Orders portal API (POST_FG routes/bulk-orders.routes.ts, API_REFERENCE #124-129). */

/** What the signed-in person may do in the portal (from GET /auth/me's /bulk-orders pages). */
export interface BulkRights {
  /** Types whose orders they may see / create. */
  view: BulkType[]
  create: BulkType[]
  approve: boolean
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
  neededBy: string
  mode: string | null
  priority: string
  note: string | null
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

/** A customer our team processed before that matches an order (process-options). */
export interface BulkCustomerMatch {
  id: string; name: string; gstin: string | null; address: BulkAddress; uniwareChannel: string; customerCode: string
  usedCount: number; lastUsedAt: string; matchedBy: 'gstin' | 'name'
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

export interface BulkSetting { type: BulkType; paymentCheck: boolean; updatedBy: { id: number; name: string | null } | null; updatedAt: string | null }

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
  neededBy: string
  mode?: string
  priority: string
  note?: string
  lines: { pepCode: string; qty: number; discountPct: number }[]
  /** Institutional only (required: name + billing address or billingSameAsDelivery). */
  institutionName?: string
  gstin?: string
  contactEmail?: string
  billingSameAsDelivery?: boolean
  billingAddress?: BulkAddress
}

export interface BulkListQuery { type?: BulkType | ''; status?: string; q?: string; page?: number; pageSize?: number }

const qs = (o: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams()
  for (const [k, v] of Object.entries(o)) if (v !== undefined && v !== '') p.set(k, String(v))
  const s = p.toString()
  return s ? `?${s}` : ''
}

export const listBulkOrders = (q: BulkListQuery) =>
  apiWithMeta<BulkOrder[], { total: number; page: number; pageSize: number }>(
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
  apiWithMeta<BulkOrder[], { total: number; page: number; pageSize: number; waiting: Record<BulkType, number> }>(
    `${BULK_ENDPOINT.TEAM}${qs({ type: q.type, status: q.status, q: q.q, page: q.page, pageSize: q.pageSize ?? BULK_LIMIT.PAGE_SIZE })}`,
  )
export const getTeamBulkOrder = (id: string) => api<BulkOrderFull>(BULK_ENDPOINT.TEAM_ORDER(id))
/** Step 3b (2026-11-12): warehouses + matching saved customers; create the sale order (PO review editor). */
export const getBulkProcessOptions = (id: string) => api<BulkProcessOptions>(BULK_ENDPOINT.TEAM_PROCESS_OPTIONS(id))
export const processBulkOrder = (id: string, input: BulkProcessInput) =>
  api<BulkOrderFull>(BULK_ENDPOINT.TEAM_PROCESS(id), { method: 'POST', body: JSON.stringify(input) })

/** Payment + documents (2026-11-12). team = our team's routes (PO review access). */
export const uploadBulkDocument = (id: string, kind: string, file: File, team = false) => {
  const form = new FormData()
  form.append('kind', kind)
  form.append('file', file)
  return apiForm<BulkOrderFull>(team ? BULK_ENDPOINT.TEAM_DOCUMENTS(id) : BULK_ENDPOINT.DOCUMENTS(id), form)
}
/** Opens in a new tab (the browser sends the login cookie). */
export const bulkDocumentUrl = (id: string, docId: string, team = false) => apiUrl(team ? BULK_ENDPOINT.TEAM_DOCUMENT(id, docId) : BULK_ENDPOINT.DOCUMENT(id, docId))
export const setBulkPayment = (id: string, action: string, note?: string) =>
  api<BulkOrderFull>(BULK_ENDPOINT.PAYMENT(id), { method: 'POST', body: JSON.stringify(note ? { action, note } : { action }) })
export const listBulkSettings = () => api<BulkSetting[]>(BULK_ENDPOINT.SETTINGS)
export const updateBulkSetting = (type: BulkType, paymentCheck: boolean) =>
  api<BulkSetting[]>(BULK_ENDPOINT.SETTING(type), { method: 'PUT', body: JSON.stringify({ paymentCheck }) })

export const searchBulkSkus = (q: string, signal?: AbortSignal) => api<BulkSku[]>(`${BULK_ENDPOINT.SKUS}${qs({ q })}`, { signal })

export const listBulkLocations = (type: BulkType) => api<BulkLocation[]>(`${BULK_ENDPOINT.LOCATIONS}${qs({ type })}`)

export const addBulkLocation = (input: { type: BulkType; label: string; address: BulkAddress }) =>
  api<BulkLocation>(BULK_ENDPOINT.LOCATIONS, { method: 'POST', body: JSON.stringify(input) })
