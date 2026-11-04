import { api, apiUrl, apiWithMeta, ApiError } from './client'
import { D2C_ENDPOINT, type D2cTab } from '../constants/d2cTransfers'
import { ERROR_CODE } from '../constants/auth'
import { rememberError } from '../lib/lastError'

/*
 * D2C internal transfers API (POST_FG routes/d2c-transfers.routes.ts, 2026-11-03). Shapes copied from
 * modules/d2c-transfers/queries.ts (list / detail / options), upload.service.ts (preview / import) and validate.ts.
 */

export type D2cTotals = {
  lines: number; skus: number; qty: number; updatedQty: number; dispatched: number; received: number; gmv: number; poValue: number
  updatedGmv: number; updatedPoValue: number; openBalance: number; cancelled: number
}

export type D2cListItem = {
  uid: string
  transferCode: string
  /** Reference ID (PO number). */
  reference: string | null
  poDate: string | null
  entryDate: string | null
  expiryDate: string | null
  sender: { id: number | null; code: string | null }
  receiving: { id: number | null; code: string | null }
  channel: string | null
  location: string | null
  locationId: string | null
  priority: string | null
  type: string | null
  /** The route's Uniware channel (2026-11-03: a route may have 2+, the transfer keeps the chosen one). */
  uniwareChannel: string | null
  routeId: number | null
  stage: string | null
  stageAt: string | null
  soState: string | null
  soError: string | null
  soCode: string | null
  /** When the SO was (last) requested. */
  soRequestedAt: string | null
  /** Still requested / unknown after 24 h (d2c:settings.soNotFoundHours). */
  soNotFound: boolean
  invoiceNo: string | null
  inwardPo: string | null
  dispatchDate: string | null
  grnDate: string | null
  balanceClosedReason: string | null
  /** First day a package was ready to ship (Uniware sync). */
  rtsDate: string | null
  remarks: string | null
  source: string | null
  group: string | null
  totals: D2cTotals
  invoices: { invoices: number; dispatched: number; awaitingInwardPo: number; inwardPos: number; varianceOpen: number }
  /** Expiry passed with units still open (nothing happens by itself: Ops close short or extend). */
  expired: boolean
  /** Something dispatched, something still open. */
  partly: boolean
  syncError: string | null
  lastSyncedAt: string | null
  createdAt: string | null
  updatedAt: string | null
}

export type D2cLine = {
  id: string; srNo: string | null; skuCode: string | null; skuName: string | null; brand: string | null; qty: number; updatedQty: number; cancelled: number
  dispatched: number; received: number; allocated: number; variance: number; mrp: number | null; gmv: number | null; poValue: number | null
  updatedGmv: number | null; updatedPoValue: number | null; removed: boolean
}

/** One GRN of an inward PO (po_invoices.grn_codes): units = accepted (quantity - rejected), date = when it was done. */
export type D2cGrn = { code: string; date: string | null; units: number; status?: string | null; rejected?: number; skus?: Record<string, number> }

export type D2cInvoice = {
  id: string; saleOrderCode: string | null; shippingPackageCode: string | null; invoiceCode: string | null; invoiceDisplayCode: string | null
  invoiceDate: string | null; packageStatus: string | null; dispatchedAt: string | null; units: number; inwardPoCode: string | null
  inwardPoState: string | null; inwardPoError: string | null; inwardPoStatus: string | null; grnCodes: D2cGrn[] | null; receivedUnits: number
  grnCompletedAt: string | null; variance: number; varianceReason: string | null; varianceNote: string | null
  /** Phase 7: when the inward PO was requested; GRN complete with variance and no reason; a reason may be added now. */
  inwardPoRequestedAt?: string | null; varianceOpen?: boolean; canVarianceReason?: boolean
}

/** GET /invoices?tab=create_inward_po|inward_pos: one row per invoice with its transfer (phase 7). */
export type D2cInvoiceRow = {
  id: string; uid: string; transferCode: string; reference: string | null; soCode: string | null; stage: string | null; priority: string | null
  sender: string | null; receiving: string | null; vendorCode: string | null; vendorMissing: boolean
  invoiceNo: string | null; shippingPackageCode: string; invoiceDate: string | null; dispatchedAt: string | null; units: number
  inwardPoCode: string | null; inwardPoState: string | null; inwardPoError: string | null; inwardPoStatus: string | null; inwardPoRequestedAt: string | null
  grnCodes: D2cGrn[] | null; receivedUnits: number; grnCompletedAt: string | null; variance: number; varianceOpen: boolean
  varianceReason: string | null; varianceNote: string | null
  /** An inward PO may be requested now (state, vendor, receiving WH, gate); else why not. */
  canCreate: boolean; createBlockedBecause: string | null; canVarianceReason: boolean
}
export type D2cInwardOutcome = 'created' | 'failed' | 'unknown' | 'skipped'
export type D2cInwardResult = {
  invoiceId: string; uid: string | null; transferCode: string | null; invoiceNo: string | null; outcome: D2cInwardOutcome; inwardPoCode: string | null; error: string | null; code?: string
}
export type D2cInwardJob = {
  id: string; kind: 'inward_po'; status: 'running' | 'done'; total: number; done: number; startedAt: string; finishedAt: string | null; results: D2cInwardResult[]
}

export type D2cTimelineItem = {
  id: string; at: string; by: string | null; byEmail: string | null; action: string; source: string; tag: string; field: string | null
  lineId: string | null; oldValue: string | null; newValue: string | null; remark: string | null; uniwareStatus: string | null; batchId: string | null
}

export type D2cRoute = {
  id: number; uniwareChannelCode: string | null; customerCode: string | null; customerName: string | null; vendorCode: string | null; isActive: boolean
  missingVendor: boolean; missingCustomer: boolean; missingChannel: boolean
}

/** The list item's fields, but `invoices` is the invoice rows here (the backend replaces the counts). */
export type D2cDetail = Omit<D2cListItem, 'invoices'> & {
  lines: D2cLine[]
  invoices: D2cInvoice[]
  route: D2cRoute | null
  /** Active Uniware channels of the sender + location (2+ = the edit form asks which). */
  routeChannels: { routeId: number; uniwareChannelCode: string | null }[]
  fileUrl: string | null
  batchId: string | null
  /** Send it back with PATCH: a change by someone else meanwhile gives 409 D2C_STALE. */
  editToken: string
  can: {
    edit: boolean; cancel: boolean; changeExpiry: boolean
    /** Phase 5: a draft that may be sent to Uniware; an SO with units still open; Uniware writes allowed for its sender (gate). */
    createSo: boolean; closeShort: boolean; uniwareWrite: boolean
  }
  editBlockedBecause: string | null
  timeline: D2cTimelineItem[]
  /** POST / PATCH answers only. */
  warnings?: { row: number; field: string; message: string }[]
  changed?: string[]
}

/** One route row = sender + location + Uniware channel: a sender + location may have 2+ (Ops pick one). */
export type D2cRouteOption = {
  routeId: number; senderId: number; senderCode: string; isActive: boolean; uniwareChannelCode: string | null
  missingVendor: boolean; missingCustomer: boolean; missingChannel: boolean
}
export type D2cLocationOption = {
  id: string; location: string | null; poPrefix: string | null; isActive: boolean; receivingFacilityId: number; receivingCode: string
  receivingUsable: boolean; routes: D2cRouteOption[]
}
export type D2cOptions = {
  senders: { id: number; code: string; name: string | null }[]
  receivingFacilities: { id: number; code: string }[]
  channels: string[]
  locations: { channel: string; locations: D2cLocationOption[] }[]
  types: string[]
  priorities: string[]
  stages: string[]
  sources: string[]
  defaults: { priority: string; type: string; poDate: string; expiryDays: number }
  live: boolean
  /** Production gate: Uniware writes for every sender only when `open` (settings.live AND env D2C_UNIWARE_WRITES); else only testFacilities. */
  uniwareGate: D2cGate
  /** Local TEST ONLY mode (backend env D2C_TEST_ONLY): only transfers between test facilities (TEST_FACILITY) can be made or sent. */
  testOnly?: boolean
}
/**
 * The backend's Uniware write gate. testOnly (local test mode) or not open: sender AND receiving facility must both be
 * test facilities. Open: an SO / cancel / close short needs the sender, an inward PO the receiving facility.
 */
export type D2cGate = { live: boolean; envWrites: boolean; open: boolean; testFacilities: string[]; testOnly?: boolean }
/** The backend gate's rule (so.service.ts uniwareWritesAllowed); the backend re-checks every write. */
export const gateAllows = (gate: D2cGate | undefined, sender: string | null, receiving: string | null, at: 'sender' | 'receiving') => {
  if (!gate) return false
  if (gate.open && !gate.testOnly) return !!(at === 'sender' ? sender : receiving)
  const test = (c: string | null) => !!c && gate.testFacilities.includes(c)
  return test(sender) && test(receiving)
}

/* Phase 5: Uniware sale orders (POST_FG modules/d2c-transfers/so.service.ts). */
export type D2cStockLine = {
  lineId: string; skuCode: string; needed: number; inventory: number; openSale: number; inventoryBlocked: number
  /** inventory - openSale - inventoryBlocked, never below 0. */
  available: number
  short: boolean
  /** The selected transfers of this sender together need more than is available. */
  shortOverall: boolean
}
export type D2cStockCheck = {
  formula: string
  transfers: { uid: string; transferCode: string | null; facility: string | null; stage: string | null; error: string | null; short: boolean; lines: D2cStockLine[] }[]
}
export type D2cSoOutcome = 'created' | 'failed' | 'unknown' | 'skipped'
export type D2cSoResult = { uid: string; transferCode: string | null; outcome: D2cSoOutcome; soCode: string | null; error: string | null; code?: string }
export type D2cSoJob = { id: string; status: 'running' | 'done'; total: number; done: number; startedAt: string; finishedAt: string | null; results: D2cSoResult[] }
export type D2cCloseShortResult = {
  uid: string; stage: string; cancelled: { itemCode: string; sku: string }[]; refused: { itemCode: string; sku: string; why: string }[]
  skipped: { itemCode: string; sku: string; why: string }[]; updated: string[]
}

/** GET /sync-status (d2c:sync + this server's timer). */
export type D2cSyncCounts = {
  reconciled: number; candidates: number; read: number; changed: number; unchanged: number; errors: number; notStarted: number
  /** Phase 7: inward PO requests looked up; invoices whose GRN was read / changed / failed. */
  reconciledInward?: number; grnRead?: number; grnChanged?: number; grnErrors?: number
}
export type D2cSyncStatus = {
  lastStartedAt: string | null; lastEndedAt: string | null; lastOkAt: string | null; lastError: string | null; counts: D2cSyncCounts | null
  nextDelayMin: number | null; trigger: string | null; timerOn: boolean; running: boolean; queued: boolean; nextRunAt: string | null
  syncMinutes: number; minutesAgo: number | null
  /** Local TEST ONLY mode: no timer, Sync now reads test-facility transfers only. */
  testOnly?: boolean
}
export type D2cSku = { code: string; name: string | null; brand: string | null; mrp: number | null; soUnitPrice: number | null }
export type D2cCounts = Record<D2cTab, number>
export type D2cIssue = { field: string; message: string }

export type D2cProposedTransfer = {
  key: string; group: string | null; rows: number[]; valid: boolean; senderId: number | null; senderCode: string | null; channel: string | null
  locationId: string | null; location: string | null; receivingId: number | null; receivingCode: string | null; prefix: string | null
  poDate: string | null; priority: string | null; type: string | null; expiry: string | null; remarks: string | null
  route: { id: number; customerCode: string | null; vendorCode: string | null; uniwareChannelCode: string | null } | null
  /** Active Uniware channels of the sender + location (2+ = the file must fill "Uniware Channel"). */
  routeChannels: string[]
  lines: { skuCode: string; skuName: string | null; brand: string | null; qty: number; mrp: number; gmv: number; poValue: number; rows: number[] }[]
  totalUnits: number
  referencePreview: string | null
}
export type D2cUploadPreview = {
  fileName: string | null; rowCount: number; canImport: boolean; errorCount: number; warningCount: number
  rows: { row: number; errors: D2cIssue[]; warnings: D2cIssue[] }[]
  transfers: D2cProposedTransfer[]
}
export type D2cUploadImport = {
  batchId: string; fileUrl: string | null; notices: string[]
  transfers: { uid: string; transferCode: string; reference: string; group: string | null; rows: number[] }[]
  warnings: { row: number; field: string; message: string }[]
}

/** POST /d2c-transfers and PATCH header (a draft). */
export type D2cHeaderBody = {
  senderId: number; channel: string; locationId: string; poDate: string; priority: string; type: string; expiry: string; remarks: string
  /** The chosen route (needed when the sender + location has 2+ Uniware channels). */
  routeId?: number
}
export type D2cLineBody = { skuCode: string; qty: number }
/** 422 D2C_INVALID details: row = form line number (1 = first). */
export type D2cProblem = { row?: number; field: string; message: string }

/** Query parameters: a list repeats the parameter (?stage=a&stage=b); empty values are left out. */
export type D2cParams = Record<string, string | string[] | number | undefined>
const d2cQuery = (params: D2cParams) => {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (Array.isArray(v)) v.filter(Boolean).forEach((x) => s.append(k, x))
    else if (v !== undefined && v !== '') s.set(k, String(v))
  }
  return s.toString()
}

/**
 * DEV-ONLY stand-in (src/dev/d2cTransfersPreview.ts, registered by the in-transit preview when the preview user is on):
 * answers every call below offline with made-up data. Never set in a build.
 */
export type D2cStandIn = {
  on: () => boolean
  list: (p: D2cParams) => Promise<{ data: D2cListItem[]; meta: { total: number } }>
  counts: (p: D2cParams) => Promise<D2cCounts>
  options: () => Promise<D2cOptions>
  skus: (q: string) => Promise<D2cSku[]>
  nextReference: (p: { locationId: string; poDate: string; type: string }) => Promise<{ reference: string; note: string }>
  get: (id: string) => Promise<D2cDetail>
  create: (h: D2cHeaderBody, lines: D2cLineBody[]) => Promise<D2cDetail>
  edit: (id: string, token: string, h: D2cHeaderBody, lines: D2cLineBody[]) => Promise<D2cDetail>
  cancel: (id: string, reason: string) => Promise<D2cDetail>
  expiry: (id: string, date: string, remark: string) => Promise<D2cDetail>
  stockCheck: (ids: string[]) => Promise<D2cStockCheck>
  createSo: (ids: string[], stockWarnings: Record<string, string>) => Promise<D2cSoJob>
  soJob: (jobId: string) => Promise<D2cSoJob>
  closeShort: (id: string, reason: string) => Promise<D2cDetail & { closeShort: D2cCloseShortResult }>
  syncStatus: () => Promise<D2cSyncStatus>
  syncNow: (ids?: string[], full?: boolean) => Promise<D2cSyncStatus & { state: 'started' | 'queued' }>
  invoices: (p: D2cParams) => Promise<{ data: D2cInvoiceRow[]; meta: { total: number } }>
  createInwardPo: (invoiceIds: string[]) => Promise<D2cInwardJob>
  inwardJob: (jobId: string) => Promise<D2cInwardJob>
  varianceReason: (invoiceId: string, reason: string, note: string) => Promise<D2cDetail>
  preview: (file: File) => Promise<D2cUploadPreview>
  importFile: (file: File) => Promise<D2cUploadImport>
  template: () => string
  exportCsv: (p: D2cParams, level: string) => Promise<string>
}
let standIn: D2cStandIn | null = null
export const setD2cStandIn = (s: D2cStandIn) => { standIn = s }
const offline = () => (standIn?.on() ? standIn : null)
/** True while the dev preview answers (no live updates then). */
export const isD2cOffline = () => !!offline()

export const listTransfers = (params: D2cParams, signal?: AbortSignal) =>
  offline()?.list(params) ?? apiWithMeta<D2cListItem[], { page: number; pageSize: number; total: number }>(`${D2C_ENDPOINT.LIST}?${d2cQuery(params)}`, { signal })
export const getCounts = (params: D2cParams, signal?: AbortSignal) =>
  offline()?.counts(params) ?? api<D2cCounts>(`${D2C_ENDPOINT.COUNTS}?${d2cQuery(params)}`, { signal })
export const getOptions = (signal?: AbortSignal) => offline()?.options() ?? api<D2cOptions>(D2C_ENDPOINT.OPTIONS, { signal })
export const searchSkus = (q: string, signal?: AbortSignal) =>
  offline()?.skus(q) ?? api<D2cSku[]>(`${D2C_ENDPOINT.SKUS}?${d2cQuery({ q })}`, { signal })
export const nextReference = (p: { locationId: string; poDate: string; type: string }, signal?: AbortSignal) =>
  offline()?.nextReference(p) ?? api<{ reference: string; note: string }>(`${D2C_ENDPOINT.NEXT_REFERENCE}?${d2cQuery(p)}`, { signal })
export const getTransfer = (id: string, signal?: AbortSignal) => offline()?.get(id) ?? api<D2cDetail>(D2C_ENDPOINT.ONE(id), { signal })

export const createTransfer = (h: D2cHeaderBody, lines: D2cLineBody[]) =>
  offline()?.create(h, lines) ?? api<D2cDetail>(D2C_ENDPOINT.LIST, { method: 'POST', body: JSON.stringify({ ...h, lines }) })
export const editTransfer = (id: string, token: string, h: D2cHeaderBody, lines: D2cLineBody[]) =>
  offline()?.edit(id, token, h, lines) ?? api<D2cDetail>(D2C_ENDPOINT.ONE(id), { method: 'PATCH', body: JSON.stringify({ token, header: h, lines }) })
export const cancelTransfer = (id: string, reason: string) =>
  offline()?.cancel(id, reason) ?? api<D2cDetail>(D2C_ENDPOINT.CANCEL(id), { method: 'POST', body: JSON.stringify({ reason }) })
export const changeExpiry = (id: string, date: string, remark: string) =>
  offline()?.expiry(id, date, remark) ?? api<D2cDetail>(D2C_ENDPOINT.EXPIRY(id), { method: 'POST', body: JSON.stringify({ date, remark: remark || undefined }) })

/** POST /stock-check { ids }: read only, per line needed vs available at the sender. */
export const stockCheck = (ids: string[]) =>
  offline()?.stockCheck(ids) ?? api<D2cStockCheck>(D2C_ENDPOINT.STOCK_CHECK, { method: 'POST', body: JSON.stringify({ ids }) })
/** POST /create-so { ids, stockWarnings } -> 202 job (409 D2C_NOT_LIVE when the gate refuses every id). */
export const createSo = (ids: string[], stockWarnings: Record<string, string>) =>
  offline()?.createSo(ids, stockWarnings) ?? api<D2cSoJob>(D2C_ENDPOINT.CREATE_SO, { method: 'POST', body: JSON.stringify({ ids, stockWarnings }) })
export const getSoJob = (jobId: string, signal?: AbortSignal) => offline()?.soJob(jobId) ?? api<D2cSoJob>(D2C_ENDPOINT.JOB(jobId), { signal })
/** POST /:id/close-short { reason }: every open SO item cancelled in Uniware; the answer lists what was and was not. */
export const closeShort = (id: string, reason: string) =>
  offline()?.closeShort(id, reason) ?? api<D2cDetail & { closeShort: D2cCloseShortResult }>(D2C_ENDPOINT.CLOSE_SHORT(id), { method: 'POST', body: JSON.stringify({ reason }) })

/* Phase 7: inward POs (one per dispatched invoice) + GRN + variance reason. */
/** GET /invoices?tab=create_inward_po|inward_pos&<filters>: invoice rows of the two invoice tabs. */
export const listInvoices = (params: D2cParams, signal?: AbortSignal) =>
  offline()?.invoices(params) ?? apiWithMeta<D2cInvoiceRow[], { page: number; pageSize: number; total: number }>(`${D2C_ENDPOINT.INVOICES}?${d2cQuery(params)}`, { signal })
/** POST /create-inward-po { invoiceIds } -> 202 job (409 D2C_NOT_LIVE when the gate refuses every invoice). */
export const createInwardPo = (invoiceIds: string[]) =>
  offline()?.createInwardPo(invoiceIds) ?? api<D2cInwardJob>(D2C_ENDPOINT.CREATE_INWARD_PO, { method: 'POST', body: JSON.stringify({ invoiceIds }) })
/** The inward PO job (same /jobs/:jobId as the SO jobs). */
export const getInwardJob = (jobId: string, signal?: AbortSignal) => offline()?.inwardJob(jobId) ?? api<D2cInwardJob>(D2C_ENDPOINT.JOB(jobId), { signal })
/** POST /invoices/:invoiceId/variance-reason { reason, note }: answers the transfer. */
export const setVarianceReason = (invoiceId: string, reason: string, note: string) =>
  offline()?.varianceReason(invoiceId, reason, note) ?? api<D2cDetail>(D2C_ENDPOINT.VARIANCE_REASON(invoiceId), { method: 'POST', body: JSON.stringify({ reason, note: note || undefined }) })

/* Multipart (the .csv). Not api(): the browser sets the multipart Content-Type itself. */
async function sendFile<T>(path: string, file: File): Promise<T> {
  const form = new FormData()
  form.append('file', file)
  let res: Response
  try {
    res = await fetch(apiUrl(path), { method: 'POST', body: form, credentials: 'include', headers: { Accept: 'application/json' } })
  } catch {
    throw new ApiError(0, ERROR_CODE.NETWORK, 'Cannot reach the server')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = body?.error
    if (res.status !== 401) rememberError({ status: res.status, code: err?.code ?? `HTTP_${res.status}`, message: err?.message ?? res.statusText, requestId: err?.requestId, path })
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText, err?.details)
  }
  return body?.data as T
}
/* Phase 6: the Uniware status sync (read only on Uniware). */
export const getSyncStatus = (signal?: AbortSignal) => offline()?.syncStatus() ?? api<D2cSyncStatus>(D2C_ENDPOINT.SYNC_STATUS, { signal })
/** Sync now (editor): 202 started / queued; full = also closed / cancelled (needs the full-resync permission). */
export const syncNow = (ids?: string[], full?: boolean) =>
  offline()?.syncNow(ids, full) ?? api<D2cSyncStatus & { state: 'started' | 'queued' }>(D2C_ENDPOINT.SYNC, { method: 'POST', body: JSON.stringify({ ids, full: full || undefined }) })

export const previewUpload = (file: File) => offline()?.preview(file) ?? sendFile<D2cUploadPreview>(D2C_ENDPOINT.UPLOAD_PREVIEW, file)
export const importUpload = (file: File) => offline()?.importFile(file) ?? sendFile<D2cUploadImport>(D2C_ENDPOINT.UPLOAD_IMPORT, file)

/** A CSV the server sends as text (template, export). */
async function getText(path: string): Promise<string> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), { credentials: 'include' })
  } catch {
    throw new ApiError(0, ERROR_CODE.NETWORK, 'Cannot reach the server')
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null))?.error
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText, err?.details)
  }
  return (await res.text()).replace(/^\uFEFF/, '')
}
export const getTemplate = async () => { const s = offline(); return s ? s.template() : getText(D2C_ENDPOINT.TEMPLATE) }
/** GET /export?level=po|sku&<filters>: every matching row (at most 20,000), as CSV text. */
export const exportCsv = (params: D2cParams, level: string) =>
  offline()?.exportCsv(params, level) ?? getText(`${D2C_ENDPOINT.EXPORT}?${d2cQuery({ ...params, level })}`)

/* Live updates: SSE at D2C_ENDPOINT.EVENTS (transfers only, PO Overview's bus); the fallback polls "changes since". */
export type D2cChange = { uid: string; logId: string; action: string; fields: string[]; by: string | null }
export const getChanges = (after?: string, signal?: AbortSignal) =>
  api<{ lastId: string; changes: D2cChange[] }>(`${D2C_ENDPOINT.CHANGES}${after ? `?after=${encodeURIComponent(after)}` : ''}`, { signal })
