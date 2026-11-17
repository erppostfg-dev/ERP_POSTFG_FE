import { useState } from 'react'
import { ArrowRight, Check, X } from 'lucide-react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, SubTabs } from '../components/ui'
import { inputCls } from '../components/kit'
import { ApiError } from '../api/client'
import { approveMarginRequest, listMarginRequests, rejectMarginRequest, type MarginPerson, type MarginRequest } from '../api/approvals'
import { marginStatusLabel, MARGIN_TABS, MARGIN_TEXT as T, PO_REVIEW_REMARK_MAX } from '../constants/poReview'
import { istDateTime } from '../lib/time'

/*
 * Approvals → Margin changes (2026-11-06): a channel SKU's margin % / rate after margin (Masters Edit, price check
 * "update master"): Operations Manager approves first (layer 1), then an Admin (layer 2) approves and it is applied to
 * the master. A new channel SKU (Masters Add) needs ONE approval (2026-11-10, approvalsNeeded 1): it is added at once. Rejecting needs a reason. The server decides who
 * may act (canDecide, whyNot): not the requester, and layer 2 not the layer 1 person.
 */

type Tab = (typeof MARGIN_TABS)[number]['key']

const who = (p: MarginPerson | null) => p?.name || p?.email || '—'
const pct = (v: number | null) => (v === null ? '—' : `${v}%`)
const rs = (v: number | null) => (v === null ? '—' : `₹${v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const str = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v) : '')
const tone = (s: string) => (s === 'applied' ? 'ok' : s === 'rejected' ? 'crit' : 'warn')

function Change({ label, from, to, fmt }: { label: string; from: number | null; to: number | null; fmt: (v: number | null) => string }) {
  if (to === null) return null
  return (
    <div className="flex flex-wrap items-center gap-1.5 text-[13px]">
      <span className="w-28 text-ink-600">{label}</span>
      <span className="tnum text-ink-400 line-through decoration-ink-400/60">{fmt(from)}</span>
      <ArrowRight className="size-3.5 text-ink-400" />
      <span className="tnum font-semibold text-ink-900">{fmt(to)}</span>
    </div>
  )
}

function RequestCard({ r, onDone }: { r: MarginRequest; onDone: (text: string) => void }) {
  const qc = useQueryClient()
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const act = async (fn: () => Promise<MarginRequest>, text: string) => {
    setBusy(true)
    setError('')
    try {
      await fn()
      onDone(text)
      void qc.invalidateQueries({ queryKey: ['approvals', 'margins'] })
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const single = r.approvalsNeeded === 1
  const layer2 = r.status === 'pending_l2'
  const open = r.status === 'pending_l1' || r.status === 'pending_l2'
  return (
    <div className="space-y-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="text-[13.5px] font-semibold text-ink-900">#{r.id} · {T.KIND[r.kind] ?? r.kind} · {T.NEEDS[r.approvalsNeeded]} · {r.channel} <span className="font-mono">{r.channelCode}</span></div>
          <div className="text-[12px] text-ink-600">PEP <span className="font-mono">{r.pepCode}</span> · {T.SOURCE[r.source] ?? r.source} · asked by {who(r.requestedBy)} · {istDateTime(r.requestedAt)}</div>
        </div>
        <Badge tone={tone(r.status)}>{marginStatusLabel(r.status, r.approvalsNeeded)}</Badge>
      </div>
      <div className="space-y-1">
        <Change label="Margin" from={r.oldMarginPercent} to={r.newMarginPercent} fmt={pct} />
        <Change label="Rate after margin" from={r.oldRate} to={r.newRate} fmt={rs} />
        {r.row && <div className="text-[12px] text-ink-600">New row: {str(r.row.productName)} · MRP {rs(r.row.mrp === null || r.row.mrp === undefined ? null : Number(r.row.mrp))} · EAN <span className="font-mono">{str(r.row.eanCode) || '—'}</span></div>}
      </div>
      {r.remark && <div className="rounded-md bg-alt px-3 py-2 text-[12.5px] text-ink-700">“{r.remark}”</div>}
      <div className="space-y-0.5 text-[12px] text-ink-600">
        {r.l1 && <div>{single ? T.APPROVED_BY : T.STEP1_BY} {who(r.l1.by)} · {istDateTime(r.l1.at)}{r.l1.remark ? ` · “${r.l1.remark}”` : ''}</div>}
        {r.l2 && <div>{single ? T.APPROVED_BY : T.STEP2_BY} {who(r.l2.by)} · {istDateTime(r.l2.at)}{r.l2.remark ? ` · “${r.l2.remark}”` : ''}</div>}
        {r.rejected && <div className="text-crit">Rejected by {who(r.rejected.by)} · {istDateTime(r.rejected.at)} · “{r.rejected.reason}”</div>}
      </div>
      {open && (r.canDecide ? (
        <div className="space-y-2">
          <textarea id={`margin-remark-${r.id}`} value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={PO_REVIEW_REMARK_MAX} rows={2} placeholder={T.REMARK} className={`${inputCls} w-full`} />
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="primary" icon={<Check className="size-4" />} disabled={busy}
              onClick={() => void act(() => approveMarginRequest(r.id, remark.trim() || undefined), single ? T.ADDED(r.id) : layer2 ? T.APPLIED(r.id) : T.APPROVED_L1(r.id))}>
              {single ? T.APPROVE_ADD : layer2 ? T.APPROVE_L2 : T.APPROVE_L1}
            </Button>
            <Button icon={<X className="size-4" />} disabled={busy}
              onClick={() => (remark.trim() ? void act(() => rejectMarginRequest(r.id, remark.trim()), T.REJECTED(r.id)) : setError(T.REMARK_NEEDED))}>
              {T.REJECT}
            </Button>
            {error && <span className="text-[12px] text-crit">{error}</span>}
          </div>
        </div>
      ) : (
        <div className="text-[12px] text-ink-400">You can't decide this one: {r.whyNot}</div>
      ))}
    </div>
  )
}

export default function MarginApprovals() {
  const [tab, setTab] = useState<Tab>('open')
  const [notice, setNotice] = useState('')
  const list = useQuery({ queryKey: ['approvals', 'margins', tab], queryFn: ({ signal }) => listMarginRequests(tab, signal), placeholderData: keepPreviousData })
  const counts = list.data?.counts
  const items = list.data?.items
  return (
    <div className="space-y-4">
      <p className="text-[12.5px] text-ink-600">{T.SUB}</p>
      <SubTabs value={tab} onChange={(t) => { setTab(t); setNotice('') }}
        tabs={MARGIN_TABS.map((t) => ({ ...t, ...(t.key === 'open' && counts ? { count: counts.open } : {}) }))} />
      {notice && <div className="rounded-md bg-ok-soft px-3 py-2 text-[12.5px] text-ok">{notice}</div>}
      {list.error && <div className="rounded-md bg-crit-soft px-3 py-2 text-[12.5px] text-crit">{list.error instanceof ApiError ? list.error.message : String(list.error)}</div>}
      {tab === 'open' && items && <div className="text-[12px] text-ink-600">{T.WAITING_SUMMARY(items.filter((r) => r.approvalsNeeded === 1).length, items.filter((r) => r.approvalsNeeded === 2 && r.status === 'pending_l1').length, items.filter((r) => r.approvalsNeeded === 2 && r.status === 'pending_l2').length)}</div>}
      {list.isPending ? <div className="text-[13px] text-ink-400">Loading…</div> : !list.data?.items.length ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-10 text-center text-[13px] text-ink-400">{T.EMPTY}</div>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {list.data.items.map((r) => <RequestCard key={r.id} r={r} onDone={setNotice} />)}
        </div>
      )}
    </div>
  )
}
