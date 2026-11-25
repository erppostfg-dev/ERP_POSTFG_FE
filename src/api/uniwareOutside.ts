import { api } from './client'
import { UNIWARE_OUTSIDE_ENDPOINT, type GuardAction, type OutsideAction, type OutsideKind } from '../constants/uniwareOutside'

/** 2026-11-25: a Uniware order punched outside POST_FG for a PO here (GET /po-review items, uniwareOutside). */
export interface OutsideFinding {
  id: string
  code: string
  channel: string
  status: string | null
  createdAt: string | null
  firstSeenAt: string
  kind: OutsideKind
  actions: OutsideAction[]
  more: number
}

export interface OutsideStatus {
  counts: Record<OutsideKind, number>
  lastRun: { at: string | null; okAt: string | null; error: string | null; trigger: string | null; checkedTo: string | null; calls: number; orders: number; findings: number; newFindings: number; ms: number }
  timerOn: boolean
  running: boolean
  nextRunAt: string | null
  everyMinutes: number
  button: { lastAt: string | null; lastBy: string | null; everyMinutes: number; nextAt: string | null }
}

export const getOutsideStatus = (signal?: AbortSignal) => api<OutsideStatus>(UNIWARE_OUTSIDE_ENDPOINT.STATUS, { signal })
export const checkOutsideNow = () => api<OutsideStatus & { state: string }>(UNIWARE_OUTSIDE_ENDPOINT.CHECK, { method: 'POST' })
/** 2026-11-25: before an action: Uniware read up to now + these POs' findings. */
export interface OutsidePrecheck { checked: boolean; error: string | null; found: { id: string; uploadId: string; poNumber: string | null; code: string; channel: string; status: string | null }[] }
export const precheckOutside = (uploadIds: string[]) => api<OutsidePrecheck>(UNIWARE_OUTSIDE_ENDPOINT.PRECHECK, { method: 'POST', body: JSON.stringify({ uploadIds }) })
export const ackOutside = (ids: string[], action: GuardAction, remark: string) =>
  api<{ recorded: number }>(UNIWARE_OUTSIDE_ENDPOINT.ACK, { method: 'POST', body: JSON.stringify({ ids, action, remark }) })
export interface OutsideLive { id: string; state: string; status: string | null; closed: boolean; checked: boolean; otherCodes: string[] }
export const getOutsideLive = (id: string, signal?: AbortSignal) => api<OutsideLive>(UNIWARE_OUTSIDE_ENDPOINT.LIVE(id), { signal })
export const bulkResolveOutside = (ids: string[], action: OutsideAction, remark: string) =>
  api<{ id: string; result: 'done' | 'skipped'; reason?: string }[]>(UNIWARE_OUTSIDE_ENDPOINT.BULK_RESOLVE, { method: 'POST', body: JSON.stringify({ ids, action, remark }) })
export const resolveOutside = (id: string, action: OutsideAction, remark: string) =>
  api<{ id: string; uploadId: string; action: OutsideAction; kind: OutsideKind }>(UNIWARE_OUTSIDE_ENDPOINT.RESOLVE(id), { method: 'POST', body: JSON.stringify({ action, remark }) })
