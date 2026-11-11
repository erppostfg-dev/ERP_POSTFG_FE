import { useEffect, useState } from 'react'
import { useInfiniteQuery, useQueries, useQuery } from '@tanstack/react-query'
import { ChevronRight, Plus, Search } from 'lucide-react'
import { getBulkOrder, listBulkOrders, type BulkOrder, type BulkRights } from '../../api/bulkOrders'
import { Badge, Drawer, PageTitle } from '../../components/ui'
import { BULK_STATUS, BULK_STATUS_LABEL, BULK_STATUS_TONE, BULK_TEXT, BULK_TYPE_LABEL, type BulkType } from '../../constants/bulkOrders'
import { rupees } from '../../lib/bulkPrice'
import BulkCreateOrder from './BulkCreateOrder'

/* Bulk Orders portal: the order worklist (design: figma-make-bulk-orders Order worklist), newest first, server paging. */

const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

function Stat({ label, value, tone }: { label: string; value: number | undefined; tone: string }) {
  return (
    <div className="flex items-start justify-between rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
      <div>
        <div className="text-[12px] text-ink-600">{label}</div>
        <div className="mt-1 text-[22px] font-semibold text-ink-900 tnum">{value ?? '–'}</div>
      </div>
      <span className={`mt-1 h-8 w-1 rounded-full ${tone}`} />
    </div>
  )
}

export default function BulkOrders({ rights }: { rights: BulkRights }) {
  const [type, setType] = useState<BulkType | ''>('')
  const [status, setStatus] = useState('')
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [creating, setCreating] = useState(false)
  const [openId, setOpenId] = useState<string | null>(null)
  const [toast, setToast] = useState('')

  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300)
    return () => clearTimeout(t)
  }, [text])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(''), 3500)
    return () => clearTimeout(t)
  }, [toast])

  const list = useInfiniteQuery({
    queryKey: ['bulk', 'orders', type, status, q],
    queryFn: ({ pageParam }) => listBulkOrders({ type, status, q, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page * last.meta.pageSize < last.meta.total ? last.meta.page + 1 : undefined),
  })
  // the tiles: one count per status (pageSize 1 = the total only)
  const counts = useQueries({
    queries: ['', BULK_STATUS.PENDING, BULK_STATUS.APPROVED, BULK_STATUS.REJECTED].map((s) => ({
      queryKey: ['bulk', 'orders', 'count', type, s],
      queryFn: () => listBulkOrders({ type, status: s, pageSize: 1 }).then((r) => r.meta.total),
    })),
  })
  const rows: BulkOrder[] = list.data?.pages.flatMap((p) => p.data) ?? []
  const total = list.data?.pages[0]?.meta.total ?? 0

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={BULK_TEXT.ORDERS_TITLE} sub={BULK_TEXT.ORDERS_SUB}
        right={rights.create.length > 0 && (
          <button onClick={() => setCreating(true)} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 text-[13px] font-semibold text-white hover:opacity-90">
            <Plus className="size-4" />{BULK_TEXT.CREATE}
          </button>
        )} />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={BULK_TEXT.STAT_TOTAL} value={counts[0].data} tone="bg-primary" />
        <Stat label={BULK_TEXT.STAT_PENDING} value={counts[1].data} tone="bg-warn" />
        <Stat label={BULK_TEXT.STAT_APPROVED} value={counts[2].data} tone="bg-ok" />
        <Stat label={BULK_TEXT.STAT_REJECTED} value={counts[3].data} tone="bg-crit" />
      </div>

      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2.5">
          <div className="flex min-w-[220px] flex-1 items-center gap-2 rounded-md border border-line px-2.5 py-1.5">
            <Search className="size-4 text-ink-400" />
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder={BULK_TEXT.SEARCH} className="w-full bg-transparent text-[13px] outline-none" />
          </div>
          {rights.view.length > 1 && (
            <div className="inline-flex rounded-md border border-line p-0.5">
              {([['', BULK_TEXT.ALL_TYPES], ...rights.view.map((t) => [t, BULK_TYPE_LABEL[t]])] as [BulkType | '', string][]).map(([k, label]) => (
                <button key={k || 'all'} onClick={() => setType(k)} className={`rounded px-2.5 py-1 text-[12px] ${type === k ? 'bg-primary-soft font-semibold text-primary' : 'text-ink-600'}`}>{label}</button>
              ))}
            </div>
          )}
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-[12px]">
            <option value="">{BULK_TEXT.ALL_STATUSES}</option>
            {Object.values(BULK_STATUS).map((s) => <option key={s} value={s}>{BULK_STATUS_LABEL[s]}</option>)}
          </select>
          <span className="ml-auto text-[12px] text-ink-600">{list.data ? BULK_TEXT.SHOWING(rows.length, total) : ''}</span>
        </div>

        {list.isPending ? (
          <div className="px-4 py-10 text-center text-[13px] text-ink-600">{BULK_TEXT.LOADING}</div>
        ) : list.isError ? (
          <div className="px-4 py-10 text-center text-[13px] text-crit">{list.error.message}</div>
        ) : !rows.length ? (
          <div className="px-4 py-12 text-center">
            <div className="text-[14px] font-semibold text-ink-900">{BULK_TEXT.EMPTY}</div>
            {(q || status || type) && <div className="mt-1 text-[12px] text-ink-600">{BULK_TEXT.EMPTY_FILTERED}</div>}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left">
              <thead className="bg-alt/60 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                <tr>
                  {[BULK_TEXT.COL_PO, BULK_TEXT.COL_BUYER, BULK_TEXT.COL_ITEMS, BULK_TEXT.COL_NEEDED, BULK_TEXT.COL_LOCATION, BULK_TEXT.COL_VALUE, BULK_TEXT.COL_STATUS, ''].map((h, i) => (
                    <th key={i} className={`px-3 py-2 ${h === BULK_TEXT.COL_VALUE ? 'text-right' : ''}`}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((o) => (
                  <tr key={o.id} onClick={() => setOpenId(o.id)} className="cursor-pointer border-t border-line text-[13px] hover:bg-alt/50">
                    <td className="px-3 py-2.5"><div className="font-mono font-semibold text-ink-900">{o.poNumber}</div><div className="text-[11px] text-ink-600">{when(o.createdAt)}</div></td>
                    <td className="px-3 py-2.5"><div className="font-medium text-ink-900">{o.orderedBy}</div><div className="text-[11px] text-ink-600">{BULK_TYPE_LABEL[o.type]}</div></td>
                    <td className="px-3 py-2.5"><div className="font-medium tnum">{o.totalUnits} {BULK_TEXT.TOTAL_UNITS}</div><div className="text-[11px] text-ink-600">{o.lineCount} SKU{o.lineCount === 1 ? '' : 's'}</div></td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{day(o.neededBy)}</td>
                    <td className="px-3 py-2.5"><div className="max-w-[220px] truncate">{o.location.label ?? o.location.address.line}</div><div className="text-[11px] text-ink-600">{o.location.address.city} {o.location.address.pincode}</div></td>
                    <td className="px-3 py-2.5 text-right tnum">{rupees(o.totalValue)}</td>
                    <td className="px-3 py-2.5"><Badge tone={BULK_STATUS_TONE[o.status] ?? 'neutral'}>{BULK_STATUS_LABEL[o.status] ?? o.status}</Badge></td>
                    <td className="px-3 py-2.5 text-ink-400"><ChevronRight className="size-4" /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {list.hasNextPage && (
          <div className="border-t border-line px-3 py-2.5 text-center">
            <button onClick={() => void list.fetchNextPage()} disabled={list.isFetchingNextPage} className="text-[13px] font-semibold text-primary disabled:opacity-50">{BULK_TEXT.LOAD_MORE}</button>
          </div>
        )}
      </div>

      {creating && (
        <BulkCreateOrder types={rights.create} onClose={() => setCreating(false)}
          onCreated={(o) => { setCreating(false); setOpenId(o.id); setToast(BULK_TEXT.SUBMITTED(o.poNumber)) }} />
      )}
      <OrderDrawer id={openId} onClose={() => setOpenId(null)} />
      {toast && <div className="fixed bottom-5 left-1/2 z-[60] -translate-x-1/2 rounded-md bg-ink-900 px-4 py-2 text-[13px] text-white shadow-lg">✓ {toast}</div>}
    </div>
  )
}

function OrderDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const o = useQuery({ queryKey: ['bulk', 'order', id], queryFn: () => getBulkOrder(id!), enabled: !!id })
  const d = o.data
  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1.5 text-[13px]"><span className="text-ink-600">{k}</span><span className="text-right text-ink-900">{v}</span></div>
  )
  return (
    <Drawer open={!!id} onClose={onClose} wide
      title={d ? <span className="font-mono">{d.poNumber}</span> : BULK_TEXT.LOADING}
      sub={d && <span className="inline-flex items-center gap-2">{BULK_TYPE_LABEL[d.type]} · <Badge tone={BULK_STATUS_TONE[d.status] ?? 'neutral'}>{BULK_STATUS_LABEL[d.status] ?? d.status}</Badge></span>}>
      {o.isError && <div className="text-[13px] text-crit">{o.error.message}</div>}
      {d && (
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.DRAWER_ORDER}</h3>
              {row(BULK_TEXT.ORDERED_BY, d.orderedBy)}
              {row(BULK_TEXT.CREATED_BY, `${d.createdBy.name ?? ''} · ${when(d.createdAt)}`)}
              {row(BULK_TEXT.PRIORITY, d.priority)}
              {d.mode && row(BULK_TEXT.MODE, d.mode)}
              {row(BULK_TEXT.TOTAL_MRP, rupees(d.totalMrp))}
              {row(BULK_TEXT.TOTAL_VALUE, <strong>{rupees(d.totalValue)}</strong>)}
              {d.note && <p className="mt-2 rounded-md bg-alt px-3 py-2 text-[12px] text-ink-600">{d.note}</p>}
            </section>
            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.DRAWER_DELIVERY}</h3>
              {row(BULK_TEXT.NEEDED_BY, day(d.neededBy))}
              {row(BULK_TEXT.RECEIVER_NAME, d.receiverName)}
              {row(BULK_TEXT.RECEIVER_PHONE, d.receiverPhone)}
              {d.location.label && row(BULK_TEXT.LOCATION, d.location.label)}
              <p className="mt-1 text-right text-[13px] text-ink-900">{d.location.address.line}<br />{d.location.address.city}, {d.location.address.state} {d.location.address.pincode}</p>
            </section>
          </div>
          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.DRAWER_LINES} ({d.lines.length})</h3>
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="bg-alt/60 text-[11px] font-semibold uppercase text-ink-600">
                  <tr><th className="px-3 py-2">{BULK_TEXT.COL_SKU}</th><th className="px-3 py-2 text-right">{BULK_TEXT.COL_MRP}</th><th className="px-3 py-2 text-right">{BULK_TEXT.COL_QTY}</th><th className="px-3 py-2 text-right">{BULK_TEXT.COL_DISCOUNT}</th><th className="px-3 py-2 text-right">{BULK_TEXT.COL_PRICE}</th><th className="px-3 py-2 text-right">{BULK_TEXT.COL_TOTAL}</th></tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => (
                    <tr key={l.lineNo} className="border-t border-line">
                      <td className="px-3 py-2"><div className="font-mono text-[12px] font-semibold">{l.pepCode}</div><div className="text-[11px] text-ink-600">{l.name}</div>
                        {(l.qty !== l.requestedQty || l.discountPct !== l.requestedDiscountPct) && <div className="text-[11px] text-warn">{BULK_TEXT.CHANGED_BY_APPROVER(l.requestedQty, l.requestedDiscountPct)}</div>}</td>
                      <td className="px-3 py-2 text-right tnum">{rupees(l.mrp)}</td>
                      <td className="px-3 py-2 text-right tnum">{l.qty}</td>
                      <td className="px-3 py-2 text-right tnum">{l.discountPct}%</td>
                      <td className="px-3 py-2 text-right tnum">{rupees(l.unitPrice)}</td>
                      <td className="px-3 py-2 text-right font-semibold tnum">{rupees(l.lineTotal)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      )}
    </Drawer>
  )
}
