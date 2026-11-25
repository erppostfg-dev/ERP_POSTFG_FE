import { api } from './client'
import { UNIWARE_OUTSIDE_ENDPOINT, type OutsideAction, type OutsideKind } from '../constants/uniwareOutside'

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
export const resolveOutside = (id: string, action: OutsideAction, remark: string) =>
  api<{ id: string; uploadId: string; action: OutsideAction; kind: OutsideKind }>(UNIWARE_OUTSIDE_ENDPOINT.RESOLVE(id), { method: 'POST', body: JSON.stringify({ action, remark }) })
