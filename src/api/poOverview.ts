import { api, apiWithMeta } from './client'
import { PO_OVERVIEW_ENDPOINT } from '../constants/poOverview'

/*
 * GET /po-overview/...: our POs at shipment level and line level (API_REFERENCE.md 3.6). A shipment is every
 * master_purchase_orders column as stored (dates YYYY-MM-DD, empty = null) plus the line sums and the computed columns.
 */

export type ShipmentItem = {
  uid: string
  [column: string]: unknown
  /** May this person edit this shipment (their team + their facilities)? */
  canEdit: boolean
  lines: number
  updatedQty: number
  updatedGmv: number
  updatedPoValue: number
  currentAppointmentDate: string | null
  statusFinal: string | null
  tatDays: number | null
  criticalDispatchDate: string | null
  ratePerKg: number | null
  deliveryType: string
  channelType: string | null
}

export type LineItem = {
  id: string
  shipmentUid: string
  srNo: string | null
  skuName: string | null
  skuCode: string | null
  channelSkuCode: string | null
  brandName: string | null
  qty: number | null
  gmv: number | null
  poValue: number | null
  updatedQty: number | null
  updatedGmv: number | null
  updatedPoValue: number | null
  productWeightG: number | null
  entryDate: string | null
  poDate: string | null
  poNumber: string | null
  channel: string | null
  location: string | null
  facility: string | null
  workingDatePlanner: string | null
  dispatchDate: string | null
  currentAppointmentDate: string | null
  statusPlanning: string | null
  statusWarehouse: string | null
  statusLogistics: string | null
  statusFinal: string | null
}

export type ListMeta = { page: number; pageSize: number; total: number }

export type FilterOptions = {
  brand: string[]
  channel: string[]
  facility: string[]
  location: string[]
  statusPlanning: string[]
  statusWarehouse: string[]
  statusLogistics: string[]
  statusFinal: string[]
  transporter: string[]
  notAssigned: string
}

/** Query parameters: a list repeats the parameter (?channel=a&channel=b); empty values are left out. */
export type ListParams = Record<string, string | string[] | number | undefined>

const qs = (params: ListParams) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.filter(Boolean).forEach((x) => s.append(k, x))
    else if (v !== undefined && v !== '') s.set(k, String(v))
  }
  return s.toString()
}

export const listShipments = (params: ListParams, signal?: AbortSignal) =>
  apiWithMeta<ShipmentItem[], ListMeta>(`${PO_OVERVIEW_ENDPOINT.SHIPMENTS}?${qs(params)}`, { signal })

export const listLines = (params: ListParams, signal?: AbortSignal) =>
  apiWithMeta<LineItem[], ListMeta>(`${PO_OVERVIEW_ENDPOINT.LINES}?${qs(params)}`, { signal })

export const getShipment = (uid: string, signal?: AbortSignal) =>
  api<{ shipment: ShipmentItem; lines: LineItem[] }>(PO_OVERVIEW_ENDPOINT.SHIPMENT(uid), { signal })

export const getFilterOptions = (signal?: AbortSignal) => api<FilterOptions>(PO_OVERVIEW_ENDPOINT.FILTER_OPTIONS, { signal })

/* GET /po-overview/columns: the column groups per team, in workflow order, and the person's access to each. */

/** locked = never edited on the screen (PO number, facility, channel, location: their own rules later). */
export type ColumnDef = { field: string; label: string; kind: 'text' | 'mono' | 'date' | 'num' | 'money' | 'link' | 'status'; locked?: boolean }
export type TeamColumns = { key: string; label: string; step: number; access: 'view' | 'edit'; columns: ColumnDef[] }
export type PoOverviewColumns = {
  keyColumns: ColumnDef[]
  systemColumns: ColumnDef[]
  /** Workflow order; teams whose columns the person can't see are left out. */
  teams: TeamColumns[]
  team: string | null
  /** true = the person edits only shipments of `facilities`; the list opens filtered to them. */
  facilityScoped: boolean
  facilities: string[]
}

export const getColumns = (signal?: AbortSignal) => api<PoOverviewColumns>(PO_OVERVIEW_ENDPOINT.COLUMNS, { signal })

/* Editing (PATCH /po-overview/shipments/:uid): only the changed fields, each with the value the person started from. */

export type FieldChanges = Record<string, { from: unknown; to: unknown }>

export const saveShipment = (uid: string, body: { changes: FieldChanges; remark?: string }) =>
  api<{ shipment: ShipmentItem; lines: LineItem[]; logIds: string[] }>(PO_OVERVIEW_ENDPOINT.SHIPMENT(uid), { method: 'PATCH', body: JSON.stringify(body) })

/** 409 FIELDS_CHANGED_MEANWHILE details: what is stored now and who changed it last. */
export type ConflictDetail = { field: string; now: unknown; by: string | null; at: string | null }

export type HistoryItem = {
  id: string
  at: string
  by: string | null
  byEmail: string | null
  /** The person's team now (planning, warehouse...). */
  byTeam: string | null
  action: string
  source: string
  field: string | null
  oldValue: string | null
  newValue: string | null
  remark: string | null
  /** The rows of one save share it. */
  batchId: string | null
  /** The field is hidden from me: the change is listed without its values. */
  valueHidden: boolean
}

export const getHistory = (uid: string, signal?: AbortSignal) => api<HistoryItem[]>(PO_OVERVIEW_ENDPOINT.HISTORY(uid), { signal })

export type EditOptions = {
  statuses: Record<'planning' | 'warehouse' | 'logistics', string[]>
  transporters: string[]
  appointmentRemarks: { remark: string; category: string | null }[]
  statusActive: string[]
  /** statusPlanning -> planning ... */
  statusFields: Record<string, 'planning' | 'warehouse' | 'logistics'>
  transporterFields: string[]
  /** The field whose change needs an appointment remark. */
  appointmentField: string
}

export const getEditOptions = (signal?: AbortSignal) => api<EditOptions>(PO_OVERVIEW_ENDPOINT.EDIT_OPTIONS, { signal })

/* Live updates: SSE at PO_OVERVIEW_ENDPOINT.EVENTS; the fallback polls "changes since". */

export type ShipmentChange = { uid: string; logId: string; action: string; fields: string[]; by: string | null }

export const getChanges = (after?: string, signal?: AbortSignal) =>
  api<{ lastId: string; changes: ShipmentChange[] }>(`${PO_OVERVIEW_ENDPOINT.CHANGES}${after ? `?after=${encodeURIComponent(after)}` : ''}`, { signal })


/* Uniware sale order status (2026-11-06, backend modules/po-uniware-sync). */
export interface UniwareSyncStatus {
  lastOkAt: string | null; lastError: string | null; counts: Record<string, number>; running: boolean; queued: boolean
  timerOn: boolean; nextRunAt: string | null; everyMinutes: number; minutesAgo: number | null
  /** The Sync button (2026-11-09): one click per everyMinutes for the whole team; nextAt null = clickable now. */
  button?: { lastAt: string | null; lastBy: string | null; everyMinutes: number; nextAt: string | null }
}
export const getUniwareSync = (signal?: AbortSignal) => api<UniwareSyncStatus>(PO_OVERVIEW_ENDPOINT.UNIWARE_SYNC, { signal })
export const startUniwareSync = (uids?: string[]) =>
  api<UniwareSyncStatus & { state: 'started' | 'queued' }>(PO_OVERVIEW_ENDPOINT.UNIWARE_SYNC, { method: 'POST', body: JSON.stringify(uids?.length ? { uids } : {}) })
