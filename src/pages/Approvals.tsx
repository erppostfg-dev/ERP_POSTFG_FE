import { useCallback, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { AlertTriangle, ArrowRight, Check, Download, ExternalLink, MessageSquareText, Search, X } from 'lucide-react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Drawer, PageTitle, SubTabs } from '../components/ui'
import { DataGrid, inputCls } from '../components/kit'
import { ApiError } from '../api/client'
import { approveSubmission, getApproval, listApprovals, rejectSubmission, type ApprovalDetail, type ApprovalItem } from '../api/approvals'
import type { Num } from '../api/poReview'
import { APPROVAL_ERROR, APPROVAL_STATUS, APPROVAL_TABS, APPROVAL_TEXT, FIX_FIELD_LABEL, ISSUE_LABELS, PO_REVIEW_REMARK_MAX, type ApprovalStatus } from '../constants/poReview'
import { SEARCH_DELAY_MS } from '../constants/poOverview'
import { REVIEW_LIVE } from '../constants/poReview'
import { useLiveReview } from '../lib/liveReview'
import { LiveDot } from '../components/LiveDot'
import { istDateTime } from '../lib/time'
import { PATHS, URL_PARAM } from '../constants/pages'
import { oneOf, useUrlParam } from '../lib/urlState'
import { fmtDate, type ColKind } from '../lib/ops'

/*
 * Approvals (2026-10-15, user): PO reviews the reviewers submitted. Pending (oldest first) / Approved / Rejected tabs
 * with counts; a row opens everything about it: who submitted and when, what the reviewer fixed (old -> new), how each
 * issue was resolved, the PO header and its lines as they will be saved, the PO file. Approvers (admin, developer)
 * Approve (creates the PO, sale order, Uniware CSV) or Reject with a reason. Other approval types (appointment change,
 * qty update...) are not built yet and not shown.
 */

type Row = {
  id: string; poNumber: string; channel: string; submittedBy: string; submittedAt: string; issues: number; changes: number
  decidedBy: string; decidedAt: string; saleOrder: string; reason: string; item: ApprovalItem
}

const who = (p: { name: string | null; email: string | null } | null) => p?.name || p?.email || '—'
const toRow = (a: ApprovalItem): Row => ({
  id: a.id, poNumber: a.poNumber ?? '—', channel: a.channel ?? '—', submittedBy: who(a.submittedBy), submittedAt: istDateTime(a.submittedAt),
  issues: a.issueCount, changes: a.changeCount, decidedBy: who(a.decidedBy), decidedAt: istDateTime(a.decidedAt), saleOrder: a.saleOrderCode ?? '—',
  reason: a.decisionRemark ?? '—', item: a,
})

const BASE: [string, keyof Row, ColKind][] = [['PO Number', 'poNumber', 'mono'], ['Channel', 'channel', 'text'], ['Submitted by', 'submittedBy', 'text'], ['Submitted at', 'submittedAt', 'mono'], ['Issues resolved', 'issues', 'num'], ['Fields changed', 'changes', 'num']]
const COLS: Record<ApprovalStatus, [string, keyof Row, ColKind][]> = {
  [APPROVAL_STATUS.PENDING]: BASE,
  [APPROVAL_STATUS.APPROVED]: [...BASE, ['Approved by', 'decidedBy', 'text'], ['Approved at', 'decidedAt', 'mono'], ['Sale order', 'saleOrder', 'mono']],
  [APPROVAL_STATUS.REJECTED]: [...BASE, ['Rejected by', 'decidedBy', 'text'], ['Rejected at', 'decidedAt', 'mono'], ['Reason', 'reason', 'text']],
}

const money = (v: Num | number | unknown) => (v === '' || v === null || v === undefined ? '—' : `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const shown = (v: unknown) => (v === null || v === undefined || v === '' ? '' : String(v))

export default function Approvals() {
  const qc = useQueryClient()
  const [tab, setTab] = useUrlParam<ApprovalStatus>(PATHS.APPROVALS, URL_PARAM.TAB, oneOf(Object.values(APPROVAL_STATUS)), APPROVAL_STATUS.PENDING)
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [sel, setSel] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null)
  useEffect(() => { const t = setTimeout(() => setSearch(q), SEARCH_DELAY_MS); return () => clearTimeout(t) }, [q])

  const list = useQuery({ queryKey: ['approvals', tab, search], queryFn: ({ signal }) => listApprovals(tab, search, signal), placeholderData: keepPreviousData })
  const rows = useMemo(() => (list.data?.data ?? []).map(toRow), [list.data])
  const counts = list.data?.meta.counts ?? {}
  const canDecide = list.data?.meta.canDecide ?? false
  const refresh = () => void qc.invalidateQueries({ queryKey: ['approvals'] })
  // Live (2026-10-15): a new submission or someone else's decision reloads the tabs, counts and the open panel.
  const live = useLiveReview(REVIEW_LIVE.APPROVALS_BASE, useCallback(() => void qc.invalidateQueries({ queryKey: ['approvals'] }), [qc]))

  return (
    <div className="space-y-5">
      <PageTitle title="Approvals" sub={APPROVAL_TEXT.SUB} right={<LiveDot mode={live} />} />
      <SubTabs value={tab} onChange={(t) => { setTab(t); setNotice(null) }} tabs={APPROVAL_TABS.map((t) => ({ ...t, count: counts[t.key] ?? 0 }))} />
      {notice && (
        <div className={`pf-tab-in flex items-start gap-2 rounded-[var(--radius)] px-3 py-2 text-[12.5px] ${notice.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
          {notice.tone === 'ok' ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)}><X className="size-4" /></button>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-9 w-full max-w-[360px] items-center gap-2 rounded-[var(--radius)] border border-line bg-surface px-3">
          <Search className="size-4 text-ink-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search PO number, channel or person…" className="w-full bg-transparent text-[13px] outline-none" />
        </label>
        {!canDecide && list.data && <span className="text-[12px] text-ink-600">{APPROVAL_TEXT.VIEW_ONLY}</span>}
      </div>
      {list.isError ? (
        <div className="rounded-[var(--radius)] bg-crit-soft px-3 py-2 text-[12.5px] text-crit">
          {list.error instanceof ApiError ? list.error.message : String(list.error)} <button onClick={() => void list.refetch()} className="font-semibold underline">Try again</button>
        </div>
      ) : (
        <div key={tab} className="pf-tab-in">
          <DataGrid cols={COLS[tab]} rows={list.isPending ? [] : rows} rowKey={(r) => r.id} onRowClick={(r) => setSel(r.id)} pageSize={25}
            rowMenu={(r) => [{ label: 'Open', onClick: () => setSel(r.id) }]} />
          {list.isPending && <p className="mt-2 text-[12.5px] text-ink-400">Loading…</p>}
        </div>
      )}
      {sel && (
        <ApprovalDrawer id={sel} canDecide={canDecide} onClose={() => setSel(null)}
          onDone={(n) => { setNotice(n); setSel(null); refresh() }} />
      )}
    </div>
  )
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center gap-3 text-[11px] font-semibold uppercase tracking-wide text-ink-600">{title}<span className="h-px flex-1 bg-line" />{right}</div>
      {children}
    </section>
  )
}

function Info({ label, value, mono }: { label: string; value: ReactNode; mono?: boolean }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-ink-400">{label}</div>
      <div className={`truncate text-[13px] text-ink-900 ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
    </div>
  )
}

function OldNew({ from, to, fmt = shown }: { from: unknown; to: unknown; fmt?: (v: unknown) => string }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {fmt(from) ? <span className="text-ink-600 line-through decoration-ink-400">{fmt(from)}</span> : <span className="italic text-ink-400">empty</span>}
      <ArrowRight className="size-3 shrink-0 text-ink-400" />
      <span className="font-semibold text-ink-900">{fmt(to)}</span>
    </span>
  )
}

function ApprovalDrawer({ id, canDecide, onClose, onDone }: {
  id: string; canDecide: boolean; onClose: () => void; onDone: (n: { tone: 'ok' | 'warn'; text: string }) => void
}) {
  const d = useQuery({ queryKey: ['approvals', 'one', id], queryFn: ({ signal }) => getApproval(id, signal) })
  const [mode, setMode] = useState<'none' | 'reject'>('none')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const a = d.data
  const pending = a?.status === APPROVAL_STATUS.PENDING

  const act = (run: () => Promise<{ tone: 'ok' | 'warn'; text: string }>) => {
    setBusy(true)
    setError(null)
    run()
      .then(onDone)
      .catch((e: unknown) => {
        // The system sent it back to In Review, or someone else decided first: the list is refreshed either way.
        if (e instanceof ApiError && (e.code === APPROVAL_ERROR.RETURNED || e.code === APPROVAL_ERROR.NOT_PENDING)) onDone({ tone: 'warn', text: e.message })
        else setError(e instanceof ApiError ? e.message : String(e))
      })
      .finally(() => setBusy(false))
  }
  const po = a?.review.po.poNumber || a?.poNumber || ''
  const approve = () => act(async () => {
    const r = await approveSubmission(id, remark.trim() || undefined)
    return { tone: 'ok', text: APPROVAL_TEXT.APPROVED(po, r.saleOrderCode) }
  })
  const reject = () => act(async () => {
    await rejectSubmission(id, remark.trim())
    return { tone: 'ok', text: APPROVAL_TEXT.REJECTED(po) }
  })

  return (
    <Drawer open wide onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><span className="font-mono">{po || '…'}</span>{a && <StatusBadge s={a.status} />}</span>}
      sub={a ? `${a.channel ?? ''} · submitted by ${who(a.submittedBy)} on ${istDateTime(a.submittedAt)}` : 'Loading…'}
      footer={(close) => (
        <div className="flex w-full flex-wrap items-center gap-2">
          {error && <span className="mr-auto flex items-center gap-1 text-[12px] text-crit"><AlertTriangle className="size-3.5" />{error}</span>}
          {pending && canDecide && mode === 'reject' ? (
            <>
              <input autoFocus value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={PO_REVIEW_REMARK_MAX} placeholder={APPROVAL_TEXT.REJECT_PROMPT}
                onKeyDown={(e) => e.key === 'Enter' && remark.trim() && reject()} className={`${inputCls} min-w-[240px] flex-1`} />
              <Button onClick={() => { setMode('none'); setRemark('') }} disabled={busy}>Cancel</Button>
              <button onClick={reject} disabled={busy || !remark.trim()}
                className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-crit px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                {busy ? 'Rejecting…' : APPROVAL_TEXT.REJECT}
              </button>
            </>
          ) : pending && canDecide ? (
            <>
              <input value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={PO_REVIEW_REMARK_MAX} placeholder={APPROVAL_TEXT.APPROVE_REMARK} className={`${inputCls} min-w-[200px] flex-1`} />
              <Button icon={<X className="size-3.5" />} onClick={() => setMode('reject')} disabled={busy}>{APPROVAL_TEXT.REJECT}</Button>
              <Button variant="primary" icon={<Check className="size-3.5" />} onClick={approve} disabled={busy || !a}>{busy ? 'Approving…' : APPROVAL_TEXT.APPROVE}</Button>
            </>
          ) : (
            <Button onClick={close}>Close</Button>
          )}
        </div>
      )}>
      {d.isPending ? <p className="text-[12.5px] text-ink-400">Loading the PO…</p>
        : d.isError ? <p className="text-[12.5px] text-crit">{d.error instanceof ApiError ? d.error.message : String(d.error)}</p>
        : a && <ApprovalBody a={a} />}
    </Drawer>
  )
}

function StatusBadge({ s }: { s: string }) {
  const tone = s === APPROVAL_STATUS.APPROVED ? 'ok' : s === APPROVAL_STATUS.REJECTED ? 'crit' : 'warn'
  return <Badge tone={tone}>{s.charAt(0).toUpperCase() + s.slice(1)}</Badge>
}

function ApprovalBody({ a }: { a: ApprovalDetail }) {
  const r = a.review
  const fixes = a.fixes
  // The lines as they will be saved: the PO's lines with the reviewer's changes on top.
  const lineFix = new Map((fixes?.lines ?? []).map((l) => [l.lineNo, new Map(l.changes.map((c) => [c.field, c]))]))
  const final = (lineNo: Num, field: string, value: unknown) => {
    const c = lineFix.get(String(lineNo))?.get(field)
    return c ? { value: c.to, changed: true } : { value, changed: false }
  }
  const cell = (lineNo: Num, field: string, value: unknown, fmt: (v: unknown) => string = shown, mono = false) => {
    const f = final(lineNo, field, value)
    return <span className={`${f.changed ? 'rounded bg-primary-soft px-1 font-semibold text-primary' : ''} ${mono ? 'font-mono' : ''}`} title={f.changed ? `Changed by the reviewer (was ${fmt(value) || 'empty'})` : undefined}>{fmt(f.value) || '—'}</span>
  }

  return (
    <div className="text-[13px]">
      {/* who + decision */}
      <div className="mb-5 grid gap-3 rounded-[var(--radius-card)] border border-line p-3 sm:grid-cols-2">
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-400">Submitted</div>
          <div className="font-medium text-ink-900">{who(a.submittedBy)}</div>
          <div className="text-[12px] text-ink-600">{istDateTime(a.submittedAt)}</div>
          {a.submitRemark && <div className="mt-1 flex items-start gap-1.5 text-[12.5px] text-ink-600"><MessageSquareText className="mt-0.5 size-3.5 shrink-0" />{a.submitRemark}</div>}
        </div>
        <div>
          <div className="text-[11px] uppercase tracking-wide text-ink-400">Decision</div>
          {a.decidedAt ? (
            <>
              <div className="font-medium text-ink-900">{a.status === APPROVAL_STATUS.APPROVED ? 'Approved' : 'Rejected'} by {who(a.decidedBy)}</div>
              <div className="text-[12px] text-ink-600">{istDateTime(a.decidedAt)}{a.saleOrderCode && <> · sale order <span className="font-mono">{a.saleOrderCode}</span></>}</div>
              {a.decisionRemark && <div className="mt-1 flex items-start gap-1.5 text-[12.5px] text-ink-600"><MessageSquareText className="mt-0.5 size-3.5 shrink-0" />{a.decisionRemark}</div>}
            </>
          ) : <div className="text-ink-600">Waiting for an approver</div>}
        </div>
      </div>

      <Section title="PO" right={r.files.poFile && (
        <span className="flex gap-3 normal-case tracking-normal">
          <a href={r.files.poFile} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"><ExternalLink className="size-3.5" />Open PO file</a>
          {r.files.poFileDownload && <a href={r.files.poFileDownload} className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"><Download className="size-3.5" />Download</a>}
        </span>
      )}>
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4">
          <Info label="PO number" value={r.po.poNumber} mono />
          <Info label="Channel" value={r.upload.channel} />
          <Info label="PO date" value={r.po.poDate ? fmtDate(r.po.poDate) : ''} />
          <Info label="Expiry date" value={r.po.expiryDate ? fmtDate(r.po.expiryDate) : ''} />
          <Info label="Delivery location" value={fixes?.location?.to ?? r.location?.locationCode ?? r.po.deliveryFacility} mono />
          <Info label="Facility" value={r.location?.facilityCode} mono />
          <Info label="PO value" value={money(r.po.poValue)} />
          <Info label="Lines" value={String(r.lines.length)} />
        </div>
        <div className="mt-2 text-[11.5px] text-ink-400">From {r.upload.emailFrom ?? r.upload.source} · {r.upload.fileName}</div>
      </Section>

      <Section title="What the reviewer changed">
        {!fixes || (!fixes.location && !fixes.lines.length) ? <p className="text-[12.5px] text-ink-400">No field changed (issues accepted only).</p> : (
          <div className="overflow-hidden rounded-[var(--radius)] border border-line">
            <table className="w-full text-[12.5px]">
              <thead className="bg-alt"><tr>{['Where', 'Field', 'Change'].map((h) => <th key={h} className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600">{h}</th>)}</tr></thead>
              <tbody>
                {fixes.location && (
                  <tr className="border-t border-line"><td className="px-3 py-2 text-ink-600">PO header</td><td className="px-3 py-2">Delivery location</td><td className="px-3 py-2 font-mono"><OldNew from={fixes.location.from} to={fixes.location.to} /></td></tr>
                )}
                {fixes.lines.flatMap((l) => l.changes.map((c, i) => (
                  <tr key={`${l.lineNo}-${c.field}`} className="border-t border-line">
                    {i === 0 && <td rowSpan={l.changes.length} className="px-3 py-2 align-top text-ink-600">Line {l.lineNo}<div className="max-w-[220px] truncate font-mono text-[11px] text-ink-400" title={l.description ?? undefined}>{l.channelSku}</div></td>}
                    <td className="px-3 py-2">{FIX_FIELD_LABEL[c.field] ?? c.field}</td>
                    <td className="px-3 py-2"><OldNew from={c.from} to={c.to} fmt={c.field === 'mrp' || c.field === 'rate' ? (v) => (shown(v) ? money(v) : '') : shown} /></td>
                  </tr>
                )))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title={`Issues resolved (${fixes?.issues.length ?? 0})`}>
        <ul className="space-y-1.5">
          {(fixes?.issues ?? []).map((i) => (
            <li key={i.issueId} className="flex items-start gap-2 rounded-md border border-line px-3 py-2 text-[12.5px]">
              <Check className="mt-0.5 size-3.5 shrink-0 text-ok" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-ink-900">{ISSUE_LABELS[i.type] ?? i.type}</span>
                  {i.lineNo && <span className="text-ink-600">Line {i.lineNo}</span>}
                  <Badge tone={i.how === 'accepted' ? 'warn' : 'ok'}>{i.how === 'accepted' ? 'Accepted as is' : 'Fixed'}</Badge>
                </div>
                {i.message && <div className="mt-0.5 text-ink-600">{i.message}</div>}
                {i.remark && <div className="mt-0.5 italic text-ink-600">“{i.remark}”</div>}
              </div>
            </li>
          ))}
        </ul>
      </Section>

      <Section title="Lines as they will be saved">
        <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
          <table className="w-full text-[12.5px]">
            <thead className="bg-alt"><tr>{['#', 'Channel SKU', 'Internal SKU', 'Qty', 'MRP', 'Rate'].map((h) => <th key={h} className="whitespace-nowrap px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600">{h}</th>)}</tr></thead>
            <tbody>
              {r.lines.map((l) => (
                <tr key={String(l.lineNo)} className="border-t border-line align-top">
                  <td className="px-2.5 py-2 text-ink-400">{shown(l.lineNo)}</td>
                  <td className="px-2.5 py-2"><div className="font-mono">{l.channelSkuCode || '—'}</div><div className="max-w-[220px] truncate text-[11px] text-ink-600" title={l.description}>{l.description}</div></td>
                  <td className="px-2.5 py-2">{cell(l.lineNo, 'pepCode', l.pepCode, shown, true)}</td>
                  <td className="px-2.5 py-2">{cell(l.lineNo, 'qty', l.qty)}</td>
                  <td className="px-2.5 py-2">{cell(l.lineNo, 'mrp', l.poMrp, (v) => (shown(v) ? money(v) : ''))}</td>
                  <td className="px-2.5 py-2">{cell(l.lineNo, 'rate', l.poUnitPrice, (v) => (shown(v) ? money(v) : ''))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-1.5 text-[11.5px] text-ink-400"><span className="rounded bg-primary-soft px-1 font-semibold text-primary">Highlighted</span> = changed by the reviewer (hover for the old value).</div>
      </Section>
    </div>
  )
}
