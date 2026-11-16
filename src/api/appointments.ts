import { api } from './client'
import { APPOINTMENT_ENDPOINT } from '../constants/appointments'

/* GET /po-overview/shipments/:uid/appointments (2026-11-16): one shipment's appointment history, newest first. */

export type AppointmentHistoryItem = {
  at: string
  /** email = a channel appointment email; change = a person's (or the app's) change of the date. */
  kind: 'email' | 'change'
  /** email: Scootsy / Zepto; change: the person (null = the app). */
  by: string | null
  byEmail: string | null
  /** created / rescheduled / cancelled (email); set / cleared (change). */
  action: string
  date: string | null
  previousDate: string | null
  slot: string | null
  appointmentRef: string | null
  hub: string | null
  quantity: number | null
  remark: string | null
  /** email: applied / older / waiting. */
  outcome: string | null
  subject: string | null
  /** This entry decides today's date. */
  current: boolean
}

export const getAppointmentHistory = (uid: string, signal?: AbortSignal) =>
  api<AppointmentHistoryItem[]>(APPOINTMENT_ENDPOINT.HISTORY(uid), { signal })
