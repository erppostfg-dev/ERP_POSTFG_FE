import { api } from './client'
import { PO_VERIFY_ENDPOINT, PO_VERIFY_SETTINGS_ENDPOINT, VERIFY_STATES_BATCH, type VerifyState } from '../constants/poVerify'

/* PO verification before Uniware (2026-10-22): backend routes/po-verify.routes.ts. */

export interface VerifyStateItem { uploadId: string; state: VerifyState; required: boolean; by: string | null; at: string | null; remark: string | null }

export interface VerifyLine {
  lineNo: number
  skuCode: string
  channelSkuCode: string
  name: string | null
  qty: number
  rate: number
  value: number
  /** rate = the PO's unit price with GST; rateBeforeGst = its unit cost when the PO is priced before GST (Purplle). */
  po: { description: string; qty: number; rate: number | null; rateBeforeGst?: number | null; mrp: number | null; channelSkuCode: string } | null
  qtyDiffers: boolean
  rateDiffers: boolean
}

export interface VerifyDetail {
  uploadId: string
  poNumber: string | null
  channel: string | null
  fileName: string
  fileType: string | null
  required: boolean
  state: VerifyState
  canAct: boolean
  last: { action: 'verified' | 'sent_back'; by: string | null; at: string; remark: string | null } | null
  header: {
    saleOrderCode: string | null; poDate: string | null; expiryDate: string | null; poLocation: string | null
    customerCode: string | null; facilityCode: string | null; uniwareChannel: string | null
  }
  lines: VerifyLine[]
  /** po.value as the PO says; valueBasis = with or before GST (2026-11-03); valueWithGst = the PO with GST, to compare with saved. */
  totals: {
    po: { lines: number; units: number; value: number; valueBasis?: 'with_gst' | 'before_gst'; valueWithGst?: number | null }
    saved: { lines: number; units: number; value: number }
  }
  /** processed.json as the OCR / API made it. */
  processed: Record<string, unknown> & { line_items: Record<string, unknown>[] }
}

const one = (uploadId: string) => `${PO_VERIFY_ENDPOINT}/${encodeURIComponent(uploadId)}`

/* GET /po-verify?uploadIds=…: Verified / To verify per PO, and whether the check is switched on. */
/** States of any number of POs: asked in batches of VERIFY_STATES_BATCH (the server takes at most 500 per call), merged. */
export async function getVerifyStates(uploadIds: string[], signal?: AbortSignal) {
  const batches: string[][] = []
  for (let i = 0; i < uploadIds.length; i += VERIFY_STATES_BATCH) batches.push(uploadIds.slice(i, i + VERIFY_STATES_BATCH))
  const parts = await Promise.all(batches.map((ids) =>
    api<{ required: boolean; items: VerifyStateItem[] }>(`${PO_VERIFY_ENDPOINT}?uploadIds=${ids.map(encodeURIComponent).join(',')}`, { signal })))
  return { required: parts.some((p) => p.required), items: parts.flatMap((p) => p.items) }
}

export function getVerifyDetail(uploadId: string, signal?: AbortSignal) {
  return api<VerifyDetail>(one(uploadId), { signal })
}

export function verifyPo(uploadId: string, body: { remark?: string; linesChecked: number; lineCount: number }) {
  return api<{ state: VerifyState }>(`${one(uploadId)}/verify`, { method: 'POST', body: JSON.stringify(body) })
}

/** POST /po-verify/verify (API #95): up to 200 POs at once; only those still to verify are verified. */
export interface VerifyManyResult { verified: string[]; skipped: { uploadId: string; reason: 'not_found' | 'not_ready' | 'already_verified' | 'in_uniware' | 'not_required' }[] }
export function verifyMany(uploadIds: string[], remark?: string) {
  return api<VerifyManyResult>(`${PO_VERIFY_ENDPOINT}/verify`, { method: 'POST', body: JSON.stringify({ uploadIds, remark }) })
}

export function sendBackPo(uploadId: string, remark: string) {
  return api<{ status: string; issues: number }>(`${one(uploadId)}/send-back`, { method: 'POST', body: JSON.stringify({ remark }) })
}

export interface VerifyChannelSetting {
  channel: string; required: boolean; isDefault: boolean; updatedBy: string | null; updatedAt: string | null; verified: number; sentBack: number
}

/* GET /po-verify/settings: the switch per channel (admin / developer). */
export function listVerifySettings(signal?: AbortSignal) {
  return api<{ defaultRequired: boolean; channels: VerifyChannelSetting[] }>(PO_VERIFY_SETTINGS_ENDPOINT, { signal })
}

/* PATCH /po-verify/settings/:channel { required }. */
export function updateVerifySetting(channel: string, required: boolean) {
  return api<VerifyChannelSetting>(`${PO_VERIFY_SETTINGS_ENDPOINT}/${encodeURIComponent(channel)}`, { method: 'PATCH', body: JSON.stringify({ required }) })
}
