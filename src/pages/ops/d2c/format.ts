import { ApiError } from '../../../api/client'
import type { D2cProblem } from '../../../api/d2cTransfers'

/* Formatting helpers of the D2C Internal Transfers screens (2026-11-03). */

export const num = (n: number | null | undefined) => (n === null || n === undefined ? '—' : n.toLocaleString('en-IN'))
export const money = (n: number | null | undefined) => (n === null || n === undefined ? '—' : `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`)

/** 03-11-2026 14:05 (local time). */
export const fmtDateTime = (iso: string | null | undefined) => {
  if (!iso) return '—'
  const d = new Date(iso)
  const day = `${String(d.getDate()).padStart(2, '0')}-${String(d.getMonth() + 1).padStart(2, '0')}-${d.getFullYear()}`
  return `${day} ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`
}

/** Today in India (YYYY-MM-DD), as the backend counts days. */
export const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10)

/** The message of a failed call, and its per-field problems (422 / 400 details). */
export const errorOf = (e: unknown): { message: string; code: string; problems: D2cProblem[] } => {
  if (e instanceof ApiError) {
    const problems = Array.isArray(e.details) ? (e.details as D2cProblem[]).filter((p) => p && typeof p.message === 'string') : []
    return { message: e.message, code: e.code, problems }
  }
  return { message: e instanceof Error ? e.message : String(e), code: '', problems: [] }
}

