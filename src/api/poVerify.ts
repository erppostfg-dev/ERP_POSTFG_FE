import { api } from './client'
import { PO_VERIFY_ENDPOINT, PO_VERIFY_SETTINGS_ENDPOINT, type VerifyState } from '../constants/poVerify'

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
  po: { description: string; qty: number; rate: number | null; mrp: number | null; channelSkuCode: string } | null
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
  totals: { po: { lines: number; units: number; value: number }; saved: { lines: number; units: number; value: number } }
  /** processed.json as the OCR / API made it. */
  processed: Record<string, unknown> & { line_items: Record<string, unknown>[] }
}

const one = (uploadId: string) => `${PO_VERIFY_ENDPOINT}/${encodeURIComponent(uploadId)}`

/* GET /po-verify?uploadIds=…: Verified / To verify per PO, and whether the check is switched on. */
export function getVerifyStates(uploadIds: string[], signal?: AbortSignal) {
  return api<{ required: boolean; items: VerifyStateItem[] }>(`${PO_VERIFY_ENDPOINT}?uploadIds=${uploadIds.map(encodeURIComponent).join(',')}`, { signal })
}

export function getVerifyDetail(uploadId: string, signal?: AbortSignal) {
  return api<VerifyDetail>(one(uploadId), { signal })
}

export function verifyPo(uploadId: string, body: { remark?: string; linesChecked: number; lineCount: number }) {
  return api<{ state: VerifyState }>(`${one(uploadId)}/verify`, { method: 'POST', body: JSON.stringify(body) })
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
