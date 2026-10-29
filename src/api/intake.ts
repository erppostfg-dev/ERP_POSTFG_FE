import { api } from './client'
import { PO_INTAKE_ENDPOINT } from '../constants/intake'

/* PO intake per channel (2026-10-23): backend routes/po-intake-control.routes.ts (admin / developer). */

export interface IntakeChannel {
  channel: string; name: string; source: 'email' | 'api'; enabled: boolean; dailyLimit: number | null
  /** ISO; older POs are not taken (emails stay in Gmail). null = no start. */
  processFrom: string | null
  today: number; held: number; heldBeforeStart: number; updatedBy: string | null; updatedAt: string | null
  /** Email channels: the last Gmail catch-up (2026-10-29); null = never asked, or an API channel. */
  catchUp: IntakeCatchUp | null
}

export interface IntakeCatchUp {
  status: 'waiting' | 'running' | 'done' | 'failed'
  /** ISO: emails received from then on. */
  from: string
  /** Failed tries so far; it is tried again by itself at nextTryAt. */
  attempts: number; nextTryAt: string | null; lastError: string | null
  /** Last finished pass: the channel's emails looked at, and how many were newly sent. */
  found: number | null; sent: number | null; finishedAt: string | null
}

export interface IntakeUniversal { processFrom: string | null; updatedBy: string | null; updatedAt: string | null }

export const listIntake = (signal?: AbortSignal) => api<{ universal: IntakeUniversal; channels: IntakeChannel[] }>(PO_INTAKE_ENDPOINT, { signal })

/* PATCH /admin/po-intake/universal: the same start on every channel (overwrites their own). */
export const setUniversalStart = (processFrom: string | null) =>
  api<{ universal: IntakeUniversal; channels: IntakeChannel[] }>(`${PO_INTAKE_ENDPOINT}/universal`, { method: 'PATCH', body: JSON.stringify({ processFrom }) })

export const updateIntake = (channel: string, change: { enabled?: boolean; dailyLimit?: number | null; processFrom?: string | null }) =>
  api<IntakeChannel>(`${PO_INTAKE_ENDPOINT}/${encodeURIComponent(channel)}`, { method: 'PATCH', body: JSON.stringify(change) })
