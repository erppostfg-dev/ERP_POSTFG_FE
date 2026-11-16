/*
 * Appointment dates from email (2026-11-16, backend constants/appointments.ts): PO Overview's Current Appointment Date
 * shows where the date came from (✉ email / ✎ typed / Cancelled) and a click opens that row's appointment history.
 * Revert = remove this file, api/appointments.ts, pages/ops/AppointmentCell.tsx and the few lines in POOverview.tsx.
 */

export const APPOINTMENT_ENDPOINT = {
  HISTORY: (uid: string) => `/po-overview/shipments/${encodeURIComponent(uid)}/appointments`,
} as const

/** The field and the filter (query `appointmentSource`, values as the API takes them). */
export const APPOINTMENT_FIELD = 'currentAppointmentDate'
export const APPOINTMENT_FILTER = { KEY: 'appointmentSource', LABEL: 'Appointment date from', OPTIONS: ['email', 'typed', 'cancelled', 'none'] } as const

export type AppointmentSource = 'email' | 'typed' | 'cancelled' | 'none'

export const APPOINTMENT_TEXT = {
  OPEN: 'Appointment history',
  TITLE: (po: string) => `Appointment history · PO ${po}`,
  SUB: 'Newest first. Dates from the channel emails (Scootsy, Zepto, Blinkit) and changes made by people; the newest change wins.',
  CLOSE: 'Close',
  LOADING: 'Loading…',
  EMPTY: 'No appointment yet: no email for this PO and nobody set a date.',
  FAILED: 'Could not load the history.',
  CANCELLED: 'Cancelled',
  MARK: { email: '✉ email', typed: '✎ typed', cancelled: 'by email', none: '' } as Record<AppointmentSource, string>,
  MARK_TITLE: {
    email: 'Set from the channel appointment email',
    typed: 'Set by a person (or before the emails were read)',
    cancelled: 'Cancelled / un-scheduled by the channel email: no date now',
    none: 'No appointment date yet',
  } as Record<AppointmentSource, string>,
  ACTION: { created: 'Created', rescheduled: 'Rescheduled', cancelled: 'Cancelled', set: 'Set', cleared: 'Cleared' } as Record<string, string>,
  OUTCOME: {
    applied: '',
    older: 'Not applied: a newer change came first',
    waiting: 'Waiting for the PO',
    unreadable: 'Not readable',
  } as Record<string, string>,
  CURRENT: 'Current',
  LEGEND: {
    TITLE: 'Appointment date:',
    EMAIL: 'from the channel email',
    CANCELLED: 'cancelled by the channel email',
    PLAIN: 'plain = typed by a person',
    CLICK: '· click a date to see its history',
  },
  EMAIL_BY: (channel: string) => `${channel} email`,
  BY_APP: 'The app',
  WAS: (d: string) => `was ${d}`,
  SLOT: 'Slot',
  ID: 'ID',
  HUB: 'Hub',
  QTY: 'Qty',
} as const
