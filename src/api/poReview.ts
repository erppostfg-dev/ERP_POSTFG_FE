import { api, apiUrl, ApiError } from './client'
import { ERROR_CODE } from '../constants/auth'
import { LINE_ITEMS, PO_REVIEW_ENDPOINT, PO_REVIEW_MAX_PAGE_SIZE, PO_REVIEW_MAX_PAGES } from '../constants/poReview'
import type { PriceChoice } from '../constants/priceDifferences'

/* GET /po-review: one row per PO upload (API contract "PO review"). */

export type PoReviewItem = {
  uploadId: string
  poNumber: string | null
  channel: string | null
  status: string
  ocrStatus: string
  source: string
  /** Email subject; for an API PO the channel's name for it (Amazon: the shipment name). */
  subject: string | null
  /** Uniware hand-off (completed POs): first CSV download and the uploaded-into-Uniware mark. */
  csvDownloadedAt: string | null
  csvDownloadedBy: string | null
  uniwareUploadedAt: string | null
  uniwareUploadedBy: string | null
  fileName: string
  /** The PO's own date (YYYY-MM-DD): the saved PO's, else as read from the PO (In Review). */
  poDate: string | null
  receivedAt: string | null
  completedAt: string | null
  /** When the system processed it: completed = completedAt; else when the PO was read (OCR done) or the row was made. */
  processedAt: string | null
  brand: string | null
  saleOrderCode: string | null
  lines: number | null
  units: number | null
  poValue: number | null
  openIssues: number
  issueTypes: string[]
}

export type PoReviewListParams = {
  status: string
  channel?: string
  q?: string
  from?: string
  to?: string
  page?: number
  pageSize?: number
}

export function listPoReview(params: PoReviewListParams, signal?: AbortSignal) {
  const qs = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') qs.set(k, String(v))
  return api<PoReviewItem[]>(`${PO_REVIEW_ENDPOINT}?${qs}`, { signal })
}

/* Every PO of a status: GET /po-review page by page (500 each) until a short page (2026-10-26, Processed tab shows all). */
export async function listAllPoReview(params: Omit<PoReviewListParams, 'page' | 'pageSize'>, signal?: AbortSignal) {
  const all: PoReviewItem[] = []
  for (let page = 1; page <= PO_REVIEW_MAX_PAGES; page++) {
    const items = await listPoReview({ ...params, page, pageSize: PO_REVIEW_MAX_PAGE_SIZE }, signal)
    all.push(...items)
    if (items.length < PO_REVIEW_MAX_PAGE_SIZE) break
  }
  return all
}

/* GET /po-review/:uploadId: one PO for the review panel. A number field is "" when the PO doesn't have it. */

export type Num = number | ''

export type PoReviewLocation = {
  detailsChannelId: string
  locationCode: string | null
  customerCode: string | null
  facilityCode: string | null
  address: string | null
  pincode: string | null
}

export type PoReviewLine = {
  lineNo: Num
  channelSkuCode: string
  ean: string
  description: string
  qty: Num
  freeQty: Num
  poMrp: Num
  poUnitPrice: Num
  poLineValue: Num
  pepCode: string
  skuName: string
  ourMrp: Num
  ourRate: Num
}

export type PoReviewIssue = {
  issueId: string
  type: string
  field: string | null
  lineNo: number | null
  details: string | null
  originalValues: Record<string, unknown> | null
  status: string
  canAccept: boolean
}

export type PoReviewDetail = {
  upload: {
    uploadId: string
    status: string
    channel: string | null
    source: string
    fileName: string
    emailFrom: string | null
    emailSubject: string | null
    receivedAt: string | null
  }
  po: {
    poNumber: string
    poDate: string
    expiryDate: string
    poType: string
    revised: boolean
    deliveryFacility: string
    shippingAddress: string
    pincode: string
    deliveryGstin: string
    totalQty: Num
    poValue: Num
    netAmount: Num
  }
  location: PoReviewLocation | null
  locationCandidates: PoReviewLocation[]
  lines: PoReviewLine[]
  totals: { poValue: Num; ourValue: Num; difference: Num }
  issues: PoReviewIssue[]
  warnings: { code: string; message: string }[]
  /** The channel's SKUs a line can be mapped to. */
  skuOptions: PoReviewSkuOption[]
  /** The latest approval round of this PO (e.g. returned to In Review by the system, with the reason). */
  lastSubmission: LastSubmission | null
  /** Short-lived download links (15 min); null when the file is not in S3. */
  files: {
    /** Opens in the browser tab. */
    poFile: string | null
    /** The same file, saved by the browser instead of opened. */
    poFileDownload: string | null
    poFileType: string | null
    processedJson: string | null
    uniwareCsv: string | null
  }
}

export type LastSubmission = {
  id: string
  type: string
  status: string
  submittedBy: string | null
  submittedAt: string
  decidedBy: string | null
  decidedAt: string | null
  remark: string | null
}

export type PoReviewSkuOption = {
  pepCode: string
  skuName: string | null
  channelSkuCode: string | null
  mrp: number | null
  rate: number | null
}

const one = (uploadId: string) => `${PO_REVIEW_ENDPOINT}/${encodeURIComponent(uploadId)}`

export function getPoReview(uploadId: string, signal?: AbortSignal) {
  return api<PoReviewDetail>(one(uploadId), { signal })
}

/* GET /po-review/:uploadId/file: the PO file's bytes, passed on from S3 by the backend (for the PDF viewer). */
export async function getPoFile(uploadId: string, signal?: AbortSignal): Promise<ArrayBuffer> {
  let res: Response
  try {
    res = await fetch(apiUrl(`${one(uploadId)}/file`), { credentials: 'include', signal })
  } catch {
    throw new ApiError(0, ERROR_CODE.NETWORK, 'Cannot reach the server')
  }
  if (!res.ok) {
    const err = (await res.json().catch(() => null))?.error
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText, err?.details)
  }
  return res.arrayBuffer()
}

/*
 * POST /po-review/:uploadId/submit (2026-10-15, replaces /resubmit): corrections + accepts -> validated again -> must
 * pass completely -> pending_approval; an approver creates the PO on the Approvals page.
 */

export type LineCorrection = {
  lineNo: string; pepCode?: string; qty?: number; mrp?: number; rate?: number
  /** Price check (2026-10-30): a price / MRP mismatch decided by a click; updateMaster with a channel choice. */
  priceFrom?: PriceChoice; mrpFrom?: PriceChoice; updateMaster?: boolean
}

export type ResubmitBody = {
  location?: { detailsChannelId: string }
  lines?: LineCorrection[]
  accept?: { issueId: string; remark?: string }[]
  remark?: string
}

export type SubmitResult = { status: string; submissionId: string }

/** details of a REVIEW_INCOMPLETE error: what is still failing after the corrections. */
export type StillOpen = { openIssues: { type: string; field: string; lineNo: number | null; message: string }[] }

export function submitPo(uploadId: string, body: ResubmitBody) {
  return api<SubmitResult>(`${one(uploadId)}/submit`, { method: 'POST', body: JSON.stringify(body) })
}

/* POST /po-review/:uploadId/reject: the reviewer rejects directly; the PO leaves the list (who / why kept). */
export function rejectPo(uploadId: string, remark: string) {
  return api<{ status: string; rejectedIssues: string[] }>(`${one(uploadId)}/reject`, { method: 'POST', body: JSON.stringify({ remark }) })
}

/* POST /po-review/uniware-uploaded: mark POs uploaded into Uniware (or undo); they then show in PO Overview. */
export function markUniwareUploaded(uploadIds: string[], undo = false) {
  return api<{ changed: string[] }>(`${PO_REVIEW_ENDPOINT}/uniware-uploaded`, { method: 'POST', body: JSON.stringify({ uploadIds, undo }) })
}


/* POST /po-review/line-items (2026-10-26): every line of the ticked processed POs (DB lines + the PO's JSON in S3),
   for the line items CSV / Excel. Read only. */
type LineNum = number | '' | null
export interface LineItemRow {
  uploadId: string
  poNumber: string | null
  poDate: string | null
  channel: string | null
  location: string | null
  facility: string | null
  saleOrderCode: string | null
  processedAt: string | null
  srNo: string | null
  lineNo: LineNum
  pepSkuCode: string | null
  channelSkuCode: string | null
  ean: string | null
  skuName: string | null
  description: string | null
  brand: string | null
  hsn: string | null
  qty: number | null
  freeQty: LineNum
  channelMrp: LineNum
  ourMrp: number | null
  ourRate: number | null
  landingRate: LineNum
  unitCost: LineNum
  gstPercent: LineNum
  lineTotal: LineNum
  margin: LineNum
  gmv: number | null
  poValue: number | null
  /** True only when the PO was verified. */
  isVerified: boolean
  /** The PO's JSON could not be read from S3: only the DB columns are filled. */
  s3Missing: boolean
}

export function getLineItems(uploadIds: string[]) {
  return api<LineItemRow[]>(LINE_ITEMS.ENDPOINT, { method: 'POST', body: JSON.stringify({ uploadIds }) })
}


/* POST /po-review/recheck (2026-10-22): re-check every PO in review against today's master now; issues the master
   fixed close, POs with nothing left pass (sale order + CSV). The server also does it every 30 min and after a master
   load. */
export function recheckReview() {
  return api<{ checked: number; issuesClosed: number; completed: { uploadId: string; poNumber: string | null; saleOrder: string }[]; partly: number; failed: number }>(
    `${PO_REVIEW_ENDPOINT}/recheck`, { method: 'POST' },
  )
}
