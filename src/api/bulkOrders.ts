import { api, apiWithMeta } from './client'
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
}

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
  changes: { lines?: { lineNo: number; pepCode: string; qty?: [number, number]; discountPct?: [number, number]; mrp?: [number, number]; removed?: boolean }[]; fields?: string[] } | null
}

export type BulkOrderFull = BulkOrder & { lines: BulkOrderLine[]; events: BulkOrderEvent[] }

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

export const searchBulkSkus = (q: string, signal?: AbortSignal) => api<BulkSku[]>(`${BULK_ENDPOINT.SKUS}${qs({ q })}`, { signal })

export const listBulkLocations = (type: BulkType) => api<BulkLocation[]>(`${BULK_ENDPOINT.LOCATIONS}${qs({ type })}`)

export const addBulkLocation = (input: { type: BulkType; label: string; address: BulkAddress }) =>
  api<BulkLocation>(BULK_ENDPOINT.LOCATIONS, { method: 'POST', body: JSON.stringify(input) })
