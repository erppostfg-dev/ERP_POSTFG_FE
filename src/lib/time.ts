import { DISPLAY_TIME_ZONE } from '../constants/poReview'

/* Dates from the API are UTC instants; the screens show them in Indian time. */

/** YYYY-MM-DD of a moment in Indian time. */
export const istDay = (d: Date) => new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TIME_ZONE }).format(d)

/** "2026-10-08 18:10" in Indian time; "" for no date. */
export const istDateTime = (isoText: string | null) => {
  if (!isoText) return ''
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('en-CA', { timeZone: DISPLAY_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(new Date(isoText))
      .map((x) => [x.type, x.value]),
  )
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`
}
