import { useEffect, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronRight, Search } from 'lucide-react'
import { getTeamBulkOrder, listTeamBulkOrders, type BulkOrder } from '../../api/bulkOrders'
import { Badge } from '../../components/ui'
import { BULK_STATUS, BULK_STATUS_LABEL, BULK_STATUS_TONE, BULK_TEXT, BULK_TYPE_LABEL, BULK_TYPES, type BulkType } from '../../constants/bulkOrders'
import { PATHS, URL_PARAM } from '../../constants/pages'
import { rupees } from '../../lib/bulkPrice'
import { oneOf, useUrlParam } from '../../lib/urlState'
import BulkOrderDrawer from '../bulk/BulkOrderDrawer'

/*
 * PO Processing & Review > Bulk Orders (2026-11-11, Bulk Orders step 3a): the portal's Marketing / Institutional orders
 * for our team, READ ONLY (GET /po-review/bulk-orders, PO review access). Approved = waiting for us (the tab count);
 * processing them (warehouse, customer code, Create PO -> the same sale order / CSV chain) is step 3b.
 */

const STATUS_CHIPS: [string, string][] = [
  [BULK_STATUS.APPROVED, BULK_STATUS_LABEL[BULK_STATUS.APPROVED]],
  [BULK_STATUS.PENDING, BULK_STATUS_LABEL[BULK_STATUS.PENDING]],
  [BULK_STATUS.REJECTED, BULK_STATUS_LABEL[BULK_STATUS.REJECTED]],
  [BULK_STATUS.CANCELLED, BULK_STATUS_LABEL[BULK_STATUS.CANCELLED]],
  ['', BULK_TEXT.TEAM_ALL],
]
const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function BulkOrdersTab({ onCount }: { onCount: (n: number) => void }) {
  // Marketing / Institutional in the address (?section=), like the other tabs' views
  const [type, setType] = useUrlParam<BulkType>(PATHS.PO_REVIEW, URL_PARAM.SECTION, oneOf(BULK_TYPES), BULK_TYPES[0])
  const [status, setStatus] = useState<string>(BULK_STATUS.APPROVED)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300)
    return () => clearTimeout(t)
  }, [text])

  const list = useInfiniteQuery({
    queryKey: ['bulk', 'team-orders', type, status, q],
    queryFn: ({ pageParam }) => listTeamBulkOrders({ type, status, q, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page * last.meta.pageSize < last.meta.total ? last.meta.page + 1 : undefined),
  })
  const waiting = list.data?.pages[0]?.meta.waiting
  useEffect(() => {
    if (waiting) onCount(BULK_TYPES.reduce((n, t) => n + (waiting[t] ?? 0), 0))
  }, [waiting, onCount])
  const rows: BulkOrder[] = list.data?.pages.flatMap((p) => p.data) ?? []
  const total = list.data?.pages[0]?.meta.total ?? 0

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-ink-600">{BULK_TEXT.TEAM_SUB}</p>
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
          {BULK_TYPES.map((t) => (
            <button key={t} onClick={() => setType(t)} className={`rounded px-3 py-1 text-[12px] ${type === t ? 'bg-primary-soft font-semibold text-primary' : 'text-ink-600'}`}>
              {BULK_TYPE_LABEL[t]}{waiting && waiting[t] > 0 && <span className="ml-1.5 rounded-full bg-warn px-1.5 text-[11px] font-semibold text-white">{waiting[t]}</span>}
            </button>
          ))}
        </div>
        <div className="flex flex-wrap gap-1">
          {STATUS_CHIPS.map(([k, label]) => (
            <button key={k || 'all'} onClick={() => setStatus(k)} className={`rounded-full border px-2.5 py-1 text-[12px] ${status === k ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-line text-ink-600 hover:bg-alt'}`}>{label}</button>
          ))}
        </div>
        <div className="ml-auto flex min-w-[240px] items-center gap-2 rounded-md border border-line bg-surface px-2.5 py-1.5">
          <Search className="size-4 text-ink-400" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={BULK_TEXT.SEARCH} className="w-full bg-transparent text-[13px] outline-none" />
        </div>
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        {list.isPending ? <div className="px-4 py-10 text-center text-[13px] text-ink-600">{BULK_TEXT.LOADING}</div>
          : list.isError ? <div className="px-4 py-10 text-center text-[13px] text-crit">{list.error.message}</div>
          : !rows.length ? <div className="px-4 py-10 text-center text-[13px] text-ink-600">{q ? BULK_TEXT.EMPTY_FILTERED : BULK_TEXT.EMPTY}</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[980px] text-left">
                <thead className="bg-alt/60 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                  <tr>
                    {[BULK_TEXT.COL_PO, BULK_TEXT.ORDERED_BY, BULK_TEXT.COL_NEEDED, BULK_TEXT.COL_LOCATION, BULK_TEXT.MODE, BULK_TEXT.PRIORITY, BULK_TEXT.COL_ITEMS, BULK_TEXT.COL_VALUE, BULK_TEXT.COL_STATUS, BULK_TEXT.COL_APPROVED, ''].map((h, i) => (
                      <th key={i} className={`px-3 py-2 ${h === BULK_TEXT.COL_VALUE ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id} onClick={() => setOpenId(o.id)} className="cursor-pointer border-t border-line text-[13px] hover:bg-alt/50">
                      <td className="px-3 py-2.5"><div className="font-mono font-semibold">{o.poNumber}</div><div className="text-[11px] text-ink-600">{when(o.createdAt)}</div></td>
                      <td className="px-3 py-2.5"><div className="font-medium">{o.orderedBy}</div><div className="text-[11px] text-ink-600">{o.createdBy.name}</div></td>
                      <td className="whitespace-nowrap px-3 py-2.5">{day(o.neededBy)}</td>
                      <td className="px-3 py-2.5"><div className="max-w-[200px] truncate">{o.location.label ?? o.location.address.line}</div><div className="text-[11px] text-ink-600">{o.location.address.city} {o.location.address.pincode}</div></td>
                      <td className="px-3 py-2.5">{o.mode ?? '–'}</td>
                      <td className="px-3 py-2.5">{o.priority === 'Fast-track' ? <Badge tone="warn">{o.priority}</Badge> : o.priority}</td>
                      <td className="px-3 py-2.5 tnum">{o.totalUnits} {BULK_TEXT.TOTAL_UNITS}<div className="text-[11px] text-ink-600">{o.lineCount} SKU{o.lineCount === 1 ? '' : 's'}</div></td>
                      <td className="px-3 py-2.5 text-right tnum">{rupees(o.totalValue)}</td>
                      <td className="px-3 py-2.5"><Badge tone={BULK_STATUS_TONE[o.status] ?? 'neutral'}>{BULK_STATUS_LABEL[o.status] ?? o.status}</Badge></td>
                      <td className="px-3 py-2.5">{o.decidedBy ? <><div>{o.decidedBy.name}</div><div className="text-[11px] text-ink-600">{o.decidedAt && when(o.decidedAt)}</div></> : '–'}</td>
                      <td className="px-3 py-2.5 text-ink-400"><ChevronRight className="size-4" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        <div className="flex items-center justify-between border-t border-line px-3 py-2 text-[12px] text-ink-600">
          <span>{list.data ? BULK_TEXT.SHOWING(rows.length, total) : ''}</span>
          {list.hasNextPage && <button onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage} className="font-semibold text-primary disabled:opacity-50">{BULK_TEXT.LOAD_MORE}</button>}
        </div>
      </div>

      <BulkOrderDrawer id={openId} load={getTeamBulkOrder} onClose={() => setOpenId(null)} />
    </div>
  )
}
