import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery } from '@tanstack/react-query'
import { ChevronRight, Download, Filter, Search } from 'lucide-react'
import { getTeamBulkOrder, listTeamBulkOrders, type BulkOrder } from '../../api/bulkOrders'
import { useAuth } from '../../auth/AuthContext'
import { CAPABILITY } from '../../constants/reviewEdit'
import { Badge } from '../../components/ui'
import { FilterChips, FilterPanel, countActive, type FilterDef, type FilterValues } from '../../components/kit'
import { Reveal } from '../../components/shell'
import { BULK_LIMIT, BULK_LIST_READY, BULK_PAYMENT_LABEL, BULK_PAYMENT_TONE, BULK_STATUS, BULK_STATUS_LABEL, BULK_STATUS_TONE, BULK_TEXT, BULK_TYPE_LABEL, BULK_TYPES } from '../../constants/bulkOrders'
import { PATHS, URL_PARAM } from '../../constants/pages'
import { rupees } from '../../lib/bulkPrice'
import { downloadExcel } from '../../lib/excelExport'
import { oneOf, useUrlParam } from '../../lib/urlState'
import BulkOrderDrawer from '../bulk/BulkOrderDrawer'

/*
 * PO Processing & Review > Bulk Orders (2026-11-11, Bulk Orders step 3a): the portal's Marketing / Institutional orders
 * for our team, READ ONLY (GET /po-review/bulk-orders, PO review access). Approved = waiting for us (the tab count);
 * processing them (warehouse, customer code, Create PO -> the same sale order / CSV chain) is step 3b.
 * 2026-11-12: Payment column (unpaid orders can still be processed) + documents in the drawer (PO review editors upload).
 * 2026-11-13: "Payments to verify" chip (proof uploaded, open orders; count per type) + Verify / Refuse / Not needed in the
 * drawer for people with "Bulk Orders: verify payments" (admin / developer now; a role can get it in the Roles tab).
 */

/** 2026-11-25 (user): two views on top, everything else in the Filters panel (like Processed / In Review). */
const VIEWS = { PLACE: 'to-place', ALL: 'all' } as const
type View = (typeof VIEWS)[keyof typeof VIEWS]
const STATUS_FILTER = [BULK_STATUS.SUBMITTED, BULK_STATUS.APPROVED, BULK_STATUS.PENDING, BULK_STATUS.PROCESSING, BULK_STATUS.DISPATCHED, BULK_STATUS.DELIVERED, BULK_STATUS.REJECTED, BULK_STATUS.CANCELLED]
/** A label picked in the panel -> its code. */
const codeOf = (labels: Record<string, string>, picked: string | string[] | undefined) =>
  (Array.isArray(picked) ? picked : []).map((l) => Object.keys(labels).find((k) => labels[k] === l) ?? l).join(',')

const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function BulkOrdersTab({ onCount, canEdit }: { onCount: (n: number) => void; canEdit: boolean }) {
  // the view in the address (?section=), like the other tabs' views
  const [view, setView] = useUrlParam<View>(PATHS.PO_REVIEW, URL_PARAM.SECTION, oneOf(Object.values(VIEWS)), VIEWS.PLACE)
  const { can } = useAuth()
  const canVerifyPayment = can(CAPABILITY.BULK_PAYMENT_VERIFY)
  const canPaymentDetails = can(CAPABILITY.BULK_PAYMENT_DETAILS)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [openId, setOpenId] = useState<string | null>(null)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<FilterValues>({})
  const [exporting, setExporting] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), 300)
    return () => clearTimeout(t)
  }, [text])

  const defs: FilterDef[] = useMemo(() => [
    { key: 'type', label: BULK_TEXT.F_TYPE, type: 'multi', options: BULK_TYPES.map((t) => BULK_TYPE_LABEL[t]), placeholder: BULK_TEXT.F_ANY },
    // "To place" is already approved + submitted: the status filter only on All orders
    ...(view === VIEWS.ALL ? [{ key: 'status', label: BULK_TEXT.F_STATUS, type: 'multi' as const, options: STATUS_FILTER.map((x) => BULK_STATUS_LABEL[x] ?? x), placeholder: BULK_TEXT.F_ANY }] : []),
    { key: 'payment', label: BULK_TEXT.F_PAYMENT, type: 'multi', options: Object.values(BULK_PAYMENT_LABEL), placeholder: BULK_TEXT.F_ANY },
    { key: 'waiting', label: BULK_TEXT.F_WAITING, type: 'text', placeholder: BULK_TEXT.F_WAITING_HINT },
  ], [view])
  const typeLabels = Object.fromEntries(BULK_TYPES.map((t) => [t, BULK_TYPE_LABEL[t]]))
  const waitText = typeof filters.waiting === 'string' ? filters.waiting.trim() : ''
  const query = {
    type: codeOf(typeLabels, filters.type),
    status: view === VIEWS.PLACE ? BULK_LIST_READY : codeOf(BULK_STATUS_LABEL, filters.status),
    payment: codeOf(BULK_PAYMENT_LABEL, filters.payment),
    waitingDays: /^[1-9]\d{0,2}$/.test(waitText) ? Number(waitText) : undefined,
    q,
  }

  const list = useInfiniteQuery({
    queryKey: ['bulk', 'team-orders', view, query.type, query.status, query.payment, query.waitingDays ?? 0, q],
    queryFn: ({ pageParam }) => listTeamBulkOrders({ ...query, page: pageParam }),
    initialPageParam: 1,
    getNextPageParam: (last) => (last.meta.page * last.meta.pageSize < last.meta.total ? last.meta.page + 1 : undefined),
  })
  const waiting = list.data?.pages[0]?.meta.waiting
  const toPlace = waiting ? BULK_TYPES.reduce((n, t) => n + (waiting[t] ?? 0), 0) : 0
  useEffect(() => {
    if (waiting) onCount(toPlace)
  }, [waiting, toPlace, onCount])
  const rows: BulkOrder[] = list.data?.pages.flatMap((p) => p.data) ?? []
  const total = list.data?.pages[0]?.meta.total ?? 0
  /** Every order the view + filters show (all pages, BULK_LIMIT.PAGE_SIZE_MAX each) as an Excel file. */
  const exportExcel = async () => {
    setExporting(true)
    try {
      const all: BulkOrder[] = []
      for (let page = 1; page <= 50; page += 1) {
        const r = await listTeamBulkOrders({ ...query, page, pageSize: BULK_LIMIT.PAGE_SIZE_MAX })
        all.push(...r.data)
        if (page * r.meta.pageSize >= r.meta.total) break
      }
      const d = (s: string | null) => (s ? s.slice(0, 10) : '')
      await downloadExcel(`bulk-orders-${view}-${new Date().toISOString().slice(0, 10)}.xlsx`, [{
        name: view === VIEWS.PLACE ? BULK_TEXT.VIEW_TO_PLACE : BULK_TEXT.VIEW_ALL,
        header: ['PO number', 'Type', 'Status', 'Brand', 'Ordered by', 'Receiver', 'Receivers', 'City', 'Units', 'Value', 'Payment', 'Requested', 'Approved', 'Needed by', 'Sale order'],
        rows: all.map((o) => [o.poNumber, BULK_TYPE_LABEL[o.type], BULK_STATUS_LABEL[o.status] ?? o.status, o.brand ?? '', o.orderedBy, o.receiverName, o.receiverCount, o.location.address.city,
          o.totalUnits, o.totalValue ?? '', o.payment ? BULK_PAYMENT_LABEL[o.payment.status] ?? o.payment.status : '', d(o.createdAt), d(o.decidedAt), o.neededBy ?? '', o.saleOrder?.code ?? '']),
      }])
    } finally {
      setExporting(false)
    }
  }
  const active = countActive(filters)

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-ink-600">{BULK_TEXT.TEAM_SUB}</p>
      {/* two views (like In Review / Processed); everything else in Filters */}
      <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
        {([[VIEWS.PLACE, BULK_TEXT.VIEW_TO_PLACE], [VIEWS.ALL, BULK_TEXT.VIEW_ALL]] as const).map(([v, label]) => (
          <button key={v} onClick={() => { setView(v); if (v === VIEWS.PLACE && filters.status) setFilters({ ...filters, status: [] }) }}
            className={`rounded px-3 py-1 text-[12.5px] transition-colors duration-200 ${view === v ? 'bg-primary-soft font-semibold text-primary' : 'text-ink-600 hover:text-ink-900'}`}>
            {label}{v === VIEWS.PLACE && toPlace > 0 && <span className="ml-1.5 rounded-full bg-warn px-1.5 text-[11px] font-semibold text-white">{toPlace}</span>}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[220px] flex-1 items-center sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 size-4 text-ink-400" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={BULK_TEXT.SEARCH}
            className="h-9 w-full rounded-[var(--radius)] border border-line bg-surface pl-9 pr-3 text-[13px] outline-none transition-shadow placeholder:text-ink-400 focus:border-primary focus:ring-2 focus:ring-primary/15" />
        </label>
        <button onClick={() => setFiltersOpen(!filtersOpen)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border px-3 text-[13px] font-medium transition-colors ${filtersOpen || active ? 'border-primary/40 bg-primary-soft text-primary' : 'border-line bg-surface text-ink-900 hover:bg-canvas'}`}>
          <Filter className="size-4" /> Filters
          {active > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{active}</span>}
        </button>
        <button onClick={() => void exportExcel()} disabled={exporting || !rows.length}
          className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-primary-soft px-3 text-[13px] font-medium text-primary hover:bg-primary/15 disabled:opacity-50">
          <Download className="size-4" />{exporting ? BULK_TEXT.EXPORTING : BULK_TEXT.EXPORT_EXCEL}
        </button>
      </div>
      <Reveal open={filtersOpen}><FilterPanel defs={defs} value={filters} onApply={setFilters} onClose={() => setFiltersOpen(false)} /></Reveal>
      {!filtersOpen && <FilterChips defs={defs} value={filters} onChange={setFilters} />}

      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        {list.isPending ? <div className="px-4 py-10 text-center text-[13px] text-ink-600">{BULK_TEXT.LOADING}</div>
          : list.isError ? <div className="px-4 py-10 text-center text-[13px] text-crit">{list.error.message}</div>
          : !rows.length ? <div className="px-4 py-10 text-center text-[13px] text-ink-600">{q || active ? BULK_TEXT.EMPTY_FILTERED : BULK_TEXT.EMPTY}</div>
          : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1080px] text-left">
                <thead className="bg-alt/60 text-[11px] font-semibold uppercase tracking-wide text-ink-600">
                  <tr>
                    {[BULK_TEXT.COL_PO, BULK_TEXT.ORDERED_BY, BULK_TEXT.COL_NEEDED, BULK_TEXT.COL_LOCATION, BULK_TEXT.MODE, BULK_TEXT.PRIORITY, BULK_TEXT.COL_ITEMS, BULK_TEXT.COL_VALUE, BULK_TEXT.COL_STATUS, BULK_TEXT.COL_PAYMENT, BULK_TEXT.COL_APPROVED, ''].map((h, i) => (
                      <th key={i} className={`px-3 py-2 ${h === BULK_TEXT.COL_VALUE ? 'text-right' : ''}`}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((o) => (
                    <tr key={o.id} onClick={() => setOpenId(o.id)} className="cursor-pointer border-t border-line text-[13px] hover:bg-alt/50">
                      <td className="px-3 py-2.5"><div className="font-mono font-semibold">{o.poNumber}{o.editCount > 0 && <span title={BULK_TEXT.EDITED_TAG_TITLE(o.editCount)} className="ml-1.5 rounded bg-warn-soft px-1.5 py-0.5 text-[10px] font-semibold text-warn">{BULK_TEXT.EDITED_TAG}</span>}</div><div className="text-[11px] text-ink-600">{when(o.createdAt)}</div></td>
                      <td className="px-3 py-2.5"><div className="font-medium">{o.orderedBy}</div><div className="text-[11px] text-ink-600">{o.createdBy.name}</div></td>
                      <td className="whitespace-nowrap px-3 py-2.5">{o.neededBy ? day(o.neededBy) : "–"}</td>
                      <td className="px-3 py-2.5"><div className="max-w-[200px] truncate">{o.location.label ?? o.location.address.line}</div><div className="text-[11px] text-ink-600">{o.location.address.city} {o.location.address.pincode}</div></td>
                      <td className="px-3 py-2.5">{o.mode ?? '–'}</td>
                      <td className="px-3 py-2.5">{o.priority === 'Fast-track' ? <Badge tone="warn">{o.priority}</Badge> : o.priority}</td>
                      <td className="px-3 py-2.5 tnum">{o.totalUnits} {BULK_TEXT.TOTAL_UNITS}<div className="text-[11px] text-ink-600">{o.lineCount} SKU{o.lineCount === 1 ? '' : 's'}</div></td>
                      <td className="px-3 py-2.5 text-right tnum">{rupees(o.totalValue)}</td>
                      <td className="px-3 py-2.5"><Badge tone={BULK_STATUS_TONE[o.status] ?? 'neutral'}>{BULK_STATUS_LABEL[o.status] ?? o.status}</Badge></td>
                      <td className="px-3 py-2.5">{o.payment ? <Badge tone={BULK_PAYMENT_TONE[o.payment.status] ?? 'neutral'}>{BULK_PAYMENT_LABEL[o.payment.status] ?? o.payment.status}</Badge> : <span className="text-ink-400">–</span>}</td>
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

      <BulkOrderDrawer id={openId} load={getTeamBulkOrder} teamCanUpload={canEdit} teamCanVerifyPayment={canVerifyPayment} teamCanPaymentDetails={canPaymentDetails} onClose={() => setOpenId(null)} />
    </div>
  )
}
