/*
 * List order (2026-10-29, user: Processed + In Review). Kept in the section's filter values so the chips show it, but
 * never filters a row (applyFilters skips these keys):
 *   SORT_FILTER_KEY  the Filters panel's "Sort by": 'channel' = each channel's POs together, A-Z
 *   DATE_SORT_KEY    a column header's Newest / Oldest first ('<field>:newest' | '<field>:oldest'; PO Date, Processed At)
 * Both together: grouped by channel, newest / oldest first inside each channel.
 */

export const SORT_FILTER_KEY = 'sortBy'
export const DATE_SORT_KEY = 'sortDate'
export type DateSortDir = 'newest' | 'oldest'

export const isOrderKey = (k: string) => k === SORT_FILTER_KEY || k === DATE_SORT_KEY

/** Rows of one channel together, channels A-Z; the order they come in is kept inside each channel (a stable sort). */
export const groupByChannel = <T extends { channel: string }>(rows: T[]): T[] =>
  [...rows].sort((a, b) => (!a.channel ? 1 : 0) - (!b.channel ? 1 : 0) || a.channel.localeCompare(b.channel))

/** The header sort of `field` now ('' = none). */
export const dateSortOf = (filters: Record<string, string | string[]>, field: string): DateSortDir | '' => {
  const v = filters[DATE_SORT_KEY]
  if (typeof v !== 'string') return ''
  const [f, dir] = v.split(':')
  return f === field && (dir === 'newest' || dir === 'oldest') ? dir : ''
}

/**
 * The rows in the chosen order: the header's date sort (`dates` = field -> its sortable value: ISO date / time, '' =
 * none, always last), then grouped by channel when asked. No choice = the list's own order.
 */
export const orderRows = <T extends { channel: string }>(rows: T[], filters: Record<string, string | string[]>, dates: Record<string, (r: T) => string>): T[] => {
  let out = rows
  const v = filters[DATE_SORT_KEY]
  if (typeof v === 'string' && v) {
    const [field, dir] = v.split(':')
    const get = dates[field]
    if (get) {
      const sign = dir === 'oldest' ? 1 : -1
      out = [...out].sort((a, b) => {
        const x = get(a), y = get(b)
        if (!x || !y) return (x ? 0 : 1) - (y ? 0 : 1)
        return (x < y ? -1 : x > y ? 1 : 0) * sign
      })
    }
  }
  return filters[SORT_FILTER_KEY] === 'channel' ? groupByChannel(out) : out
}
