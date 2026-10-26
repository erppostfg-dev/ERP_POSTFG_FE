import { api, apiWithMeta } from './client'
import { INBOUND_ENDPOINT } from '../constants/amazonInbound'

/* POST_FG /amazon/inbound (API #44-48): Amazon inbound plans + FBA shipments, read from our DB only. */

export type PlanItem = {
  planId: string
  name: string | null
  status: string | null
  createdAt: string | null
  shipFrom: string | null
  shipFromPincode: string | null
  planSkuCount: number | null
  planUnits: number | null
  shipmentCount: number
  byStatus: Record<string, number>
  unitsByStatus: Record<string, number>
  unitsPlanned: number
  unitsReceived: number
  unitsMismatch: boolean
  stuck: number
  attention: number
  withPo: number
  lastChangeAt: string | null
}

export type ShipmentItem = {
  externalId: string
  planId: string | null
  name: string | null
  fcCode: string | null
  fcCity: string | null
  fcPincode: string | null
  status: string
  statusSince: string
  daysInStatus: number
  stuck: boolean
  limitDays: number | null
  skuCount: number | null
  unitsPlanned: number | null
  unitsReceived: number | null
  attention: string | null
  firstSeenAt: string
  lastSeenAt: string
  po: { uploadId: string; poNumber: string | null; uploadStatus: string; saleOrder: string | null; uniware: string } | null
}

export type InboundEvent = {
  id: string
  kind: string
  oldValue: string | null
  newValue: string | null
  detail: Record<string, unknown> | null
  source: string
  seenAt: string
  externalId?: string | null
}

export type ShipmentLine = { sellerSku: string; fnsku: string | null; pepCode: string | null; productName: string | null; qtyPlanned: number; qtyReceived: number | null }
export type ShipmentDetail = { shipment: ShipmentItem; lines: ShipmentLine[]; events: InboundEvent[]; changes?: string[]; calls?: number }
export type PlanDetail = { plan: PlanItem | undefined; shipments: ShipmentItem[]; events: InboundEvent[] }
export type StuckLimit = { id: number; status: string; courier: string | null; maxDays: number; updatedBy: string | null; updatedAt: string | null }
export type SyncState = { syncedUntil: string | null; lastRunAt: string | null; lastSuccessAt: string | null; failures: number; lastError: string | null } | null

export const listPlans = (signal?: AbortSignal) =>
  apiWithMeta<PlanItem[], { total: number; totals: Record<string, number> }>(INBOUND_ENDPOINT.PLANS, { signal })
export const getPlan = (planId: string, signal?: AbortSignal) => api<PlanDetail>(INBOUND_ENDPOINT.PLAN(planId), { signal })
export const listShipments = (signal?: AbortSignal) => api<ShipmentItem[]>(INBOUND_ENDPOINT.SHIPMENTS, { signal })
export const getShipment = (id: string, signal?: AbortSignal) => api<ShipmentDetail>(INBOUND_ENDPOINT.SHIPMENT(id), { signal })
export const refreshShipment = (id: string) => api<ShipmentDetail>(INBOUND_ENDPOINT.REFRESH(id), { method: 'POST' })
export const listLimits = (signal?: AbortSignal) => api<StuckLimit[]>(INBOUND_ENDPOINT.LIMITS, { signal })
export const updateLimit = (id: number, maxDays: number) =>
  api<StuckLimit>(INBOUND_ENDPOINT.LIMIT(id), { method: 'PATCH', body: JSON.stringify({ maxDays }) })
export const getSyncState = (signal?: AbortSignal) => api<SyncState>(INBOUND_ENDPOINT.SYNC, { signal })
