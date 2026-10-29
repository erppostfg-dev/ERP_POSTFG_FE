import { describe, expect, it } from 'vitest'
import { applyFilters } from '../../components/kit'
import { DATE_SORT_KEY, dateSortOf, groupByChannel, orderRows, SORT_FILTER_KEY } from '../listOrder'

/*
 * Processed + In Review lists (2026-10-29, user): Newest / Oldest first from the PO Date and Processed At headers, and
 * Sort by channel in the Filters panel. Orders, never filters.
 */
const rows = [
  { id: '1', channel: 'Zepto', poDate: '2026-10-20', processedIso: '2026-10-28T09:00:00.000Z' },
  { id: '2', channel: 'Blinkit', poDate: '2026-10-25', processedIso: '2026-10-29T05:00:00.000Z' },
  { id: '3', channel: 'Zepto', poDate: '2026-10-26', processedIso: '2026-10-27T11:00:00.000Z' },
  { id: '4', channel: '', poDate: '', processedIso: '2026-10-29T06:00:00.000Z' },
  { id: '5', channel: 'Blinkit', poDate: '2026-10-28', processedIso: '2026-10-28T08:00:00.000Z' },
]
const ids = (r: { id: string }[]) => r.map((x) => x.id)
const dates = { poDate: (r: (typeof rows)[number]) => r.poDate, processedAt: (r: (typeof rows)[number]) => r.processedIso }

describe('orders are not filters', () => {
  it('every row stays whatever the sort', () => {
    expect(ids(applyFilters(rows, { [SORT_FILTER_KEY]: 'channel', [DATE_SORT_KEY]: 'poDate:newest' }))).toEqual(['1', '2', '3', '4', '5'])
  })
})

describe('header sort: newest / oldest first', () => {
  it('PO Date both ways; a row without a PO date is always last', () => {
    expect(ids(orderRows(rows, { [DATE_SORT_KEY]: 'poDate:newest' }, dates))).toEqual(['5', '3', '2', '1', '4'])
    expect(ids(orderRows(rows, { [DATE_SORT_KEY]: 'poDate:oldest' }, dates))).toEqual(['1', '2', '3', '5', '4'])
  })

  it('Processed At by the time, not only the day', () => {
    expect(ids(orderRows(rows, { [DATE_SORT_KEY]: 'processedAt:newest' }, dates))).toEqual(['4', '2', '1', '5', '3'])
    expect(dateSortOf({ [DATE_SORT_KEY]: 'processedAt:oldest' }, 'processedAt')).toBe('oldest')
    expect(dateSortOf({ [DATE_SORT_KEY]: 'processedAt:oldest' }, 'poDate')).toBe('')
  })

  it('no sort = the list order; the input is never changed', () => {
    expect(ids(orderRows(rows, {}, dates))).toEqual(['1', '2', '3', '4', '5'])
    orderRows(rows, { [DATE_SORT_KEY]: 'poDate:newest', [SORT_FILTER_KEY]: 'channel' }, dates)
    expect(ids(rows)).toEqual(['1', '2', '3', '4', '5'])
  })
})

describe('sort by channel', () => {
  it('each channel together, A-Z, no channel last; the list order inside a channel', () => {
    expect(ids(groupByChannel(rows))).toEqual(['2', '5', '1', '3', '4'])
  })

  it('with a header sort: grouped by channel, newest first inside each', () => {
    expect(ids(orderRows(rows, { [SORT_FILTER_KEY]: 'channel', [DATE_SORT_KEY]: 'poDate:newest' }, dates))).toEqual(['5', '2', '3', '1', '4'])
  })
})
