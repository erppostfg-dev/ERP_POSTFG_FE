import { api } from './client'
import { PRICE_DIFFS_ENDPOINT, type PriceDiffStatus, type PriceDiffView } from '../constants/priceDifferences'

/* POST_FG /price-differences (API #91-94, 2026-10-30): approved lines kept at our price / MRP, to tell the channel. */

export interface PriceDiffPoGroup {
  uploadId: string
  poNumber: string
  poDate: string | null
  channel: string
  lines: number
  /** Price lines: (PO price - ours) x qty. */
  valueDifference: number
  openLines: number
  approvedAt: string
  sentAt: string | null
}

export interface PriceDiffChannelGroup {
  channel: string
  pos: number
  lines: number
  valueDifference: number
  openLines: number
  oldestOpen: string | null
  lastApproved: string
}

export interface PriceDiffLine {
  id: string
  uploadId: string
  poNumber: string
  poDate: string | null
  channel: string
  lineNo: string
  channelSkuCode: string
  pepCode: string
  productName: string
  field: string
  qty: number | null
  poValue: number
  ourValue: number
  difference: number
  approvedAt: string
  sentAt: string | null
  sentBy: string | null
}

export interface PriceDiffDraft {
  to: string
  subject: string
  body: string
  /** Without the extension. */
  fileName: string
  lineIds: string[]
  lines: PriceDiffLine[]
}

/** One PO (uploadId) or one channel. */
export type PriceDiffScope = { uploadId: string } | { channel: string }

const qs = (p: Record<string, string | undefined>) => new URLSearchParams(Object.entries(p).filter((e): e is [string, string] => !!e[1])).toString()
const scopeOf = (s: PriceDiffScope) => ('uploadId' in s ? { uploadId: s.uploadId } : { channel: s.channel })

export const priceDiffsKey = (view: PriceDiffView, status: PriceDiffStatus) => ['price-differences', view, status] as const

export const listPriceDiffs = <V extends PriceDiffView>(view: V, status: PriceDiffStatus, signal?: AbortSignal) =>
  api<V extends 'po' ? PriceDiffPoGroup[] : PriceDiffChannelGroup[]>(`${PRICE_DIFFS_ENDPOINT}?${qs({ view, status })}`, { signal })

export const priceDiffDraft = (scope: PriceDiffScope, status: PriceDiffStatus, signal?: AbortSignal) =>
  api<PriceDiffDraft>(`${PRICE_DIFFS_ENDPOINT}/draft?${qs({ ...scopeOf(scope), status })}`, { signal })

export const markPriceDiffsSent = (ids: string[]) =>
  api<{ marked: number; batch: string }>(`${PRICE_DIFFS_ENDPOINT}/sent`, { method: 'POST', body: JSON.stringify({ ids }) })
