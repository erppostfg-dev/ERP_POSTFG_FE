import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Check, Clock, Loader2, RefreshCw, X as XIcon } from 'lucide-react'
import { Badge, Drawer, KPI, PageTitle, SubTabs } from '../../components/ui'
import { DataGrid, FilterChips, FilterPanel, SectionToolbar, exportRows, useSection, type FilterDef } from '../../components/kit'
import { Reveal } from '../../components/shell'
import { ApiError } from '../../api/client'
import {
  getPlan, getShipment, getSyncState, listLimits, listPlans, listShipments, refreshShipment, updateLimit,
  type InboundEvent, type PlanItem, type ShipmentItem,
} from '../../api/amazonInbound'
import {
  EVENT_LABEL, EVENT_SOURCE_LABEL, INBOUND_TEXT, SHIPMENT_STEPS, STATUS_FILL, STATUS_LABEL, STATUS_TONE, UNIWARE_LABEL,
} from '../../constants/amazonInbound'
import { useAuth } from '../../auth/AuthContext'
import { ACCESS } from '../../constants/auth'
import { PATHS } from '../../constants/pages'
import { fmtDate, type ColKind } from '../../lib/ops'
import { istDateTime } from '../../lib/time'

/*
 * Amazon Inbound (2026-10-19). Plans tab: every inbound plan with a bar of its shipments by status; a plan opens its
 * shipments on the status path + history. Shipments tab: every FBA shipment (status, days in it, stuck, PO / Uniware);
 * a shipment opens its lines (planned / received) + history + Refresh from Amazon. Stuck limits tab: the days per status
 * (editors change them). Reads only POST_FG (GET /amazon/inbound/*); only Refresh asks Amazon.
 */

type Tab = 'plans' | 'shipments' | 'limits'
const label = (s: string) => STATUS_LABEL[s] ?? s
const n = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('en-IN'))
const short = (planId: string | null) => (planId ? `${planId.slice(0, 10)}…` : INBOUND_TEXT.NO_PLAN)

function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONE[status] ?? 'neutral'}>{label(status)}</Badge>
}

/** A plan's shipments as one bar, one segment per status (width = shipments). */
function PlanBar({ byStatus, total }: { byStatus: Record<string, number>; total: number }) {
  const parts = Object.entries(byStatus).filter(([, v]) => v > 0)
  if (!total) return <span className="text-[12px] text-ink-400">Not split yet</span>
  return (
    <div className="flex w-[180px] items-center gap-2">
      <div className="flex h-2.5 flex-1 overflow-hidden rounded-full bg-alt" title={parts.map(([k, v]) => `${label(k)}: ${v}`).join(' · ')}>
        {parts.map(([k, v]) => <div key={k} className={STATUS_FILL[k] ?? 'bg-slate-400'} style={{ width: `${(v / total) * 100}%` }} />)}
      </div>
      <span className="tnum w-[42px] text-right text-[11.5px] text-ink-600">{(byStatus.CLOSED ?? 0)}/{total}</span>
    </div>
  )
}

/** One shipment on Amazon's status path (filled up to where it is). */
function StatusPath({ status }: { status: string }) {
  const at = SHIPMENT_STEPS.indexOf(status as (typeof SHIPMENT_STEPS)[number])
  const stopped = at < 0
  return (
    <div className="flex items-center" title={label(status)}>
      {SHIPMENT_STEPS.map((s, i) => (
        <div key={s} className="flex items-center">
          {i > 0 && <span className={`h-0.5 w-4 ${!stopped && i <= at ? 'bg-ink-400' : 'bg-line'}`} />}
          <span className={`block rounded-full ${i === at ? `size-3.5 ring-2 ring-offset-1 ring-offset-surface ${STATUS_FILL[s]} ring-current text-ink-900` : `size-2 ${!stopped && i < at ? 'bg-ink-400' : 'bg-line'}`}`} />
        </div>
      ))}
      {stopped && <span className="ml-2"><StatusBadge status={status} /></span>}
    </div>
  )
}

function Timeline({ events }: { events: InboundEvent[] }) {
  if (!events.length) return <p className="text-[13px] text-ink-400">No history yet.</p>
  return (
    <ol className="space-y-2.5">
      {events.map((e) => (
        <li key={e.id} className="flex gap-3 text-[13px]">
          <span className={`mt-1.5 size-2 shrink-0 rounded-full ${e.kind === 'attention' ? 'bg-crit' : e.kind === 'status_changed' ? 'bg-primary' : 'bg-ink-400'}`} />
          <div className="min-w-0">
            <div className="font-medium text-ink-900">
              {EVENT_LABEL[e.kind] ?? e.kind}
              {e.externalId && <span className="ml-1.5 font-mono text-[12px] text-ink-600">{e.externalId}</span>}
            </div>
            <div className="text-ink-600">
              {e.kind === 'status_changed' ? <>{label(e.oldValue ?? '')} <ArrowRight className="inline size-3" /> {label(e.newValue ?? '')}</>
                : e.kind === 'discovered' ? <>Status {label(e.newValue ?? '')}</>
                  : e.kind === 'received_updated' ? <>Received {e.newValue}{e.oldValue ? ` (was ${e.oldValue})` : ''}</>
                    : <>{e.oldValue ? `${e.oldValue} → ` : ''}{e.newValue}</>}
            </div>
            <div className="text-[11.5px] text-ink-400">{istDateTime(e.seenAt)} · {EVENT_SOURCE_LABEL[e.source] ?? e.source}</div>
          </div>
        </li>
      ))}
    </ol>
  )
}

// ---- Shipment drawer ----------------------------------------------------------------------------------------------
function ShipmentDrawer({ id, onClose, canEdit }: { id: string; onClose: () => void; canEdit: boolean }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['amazon-inbound', 'shipment', id], queryFn: ({ signal }) => getShipment(id, signal) })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const refresh = async () => {
    setBusy(true)
    try {
      const r = await refreshShipment(id)
      qc.setQueryData(['amazon-inbound', 'shipment', id], r)
      setNote({ ok: true, text: INBOUND_TEXT.REFRESHED(r.changes?.length ?? 0, r.calls ?? 0) })
      void qc.invalidateQueries({ queryKey: ['amazon-inbound', 'list'] })
    } catch (e) {
      setNote({ ok: false, text: e instanceof ApiError ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  const d = q.data
  const s = d?.shipment
  return (
    <Drawer open onClose={onClose} wide title={<span className="font-mono">{id}</span>}
      sub={s ? <>{s.fcCode} {s.fcCity ? `· ${s.fcCity}` : ''} {s.fcPincode ? `· ${s.fcPincode}` : ''} · <StatusBadge status={s.status} /></> : undefined}
      footer={canEdit ? (
        <button onClick={() => void refresh()} disabled={busy} className="pf-press inline-flex h-9 items-center gap-2 rounded-[var(--radius)] border border-line px-3 text-[13px] font-medium hover:bg-alt disabled:opacity-60">
          {busy ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}{busy ? INBOUND_TEXT.REFRESHING : INBOUND_TEXT.REFRESH}
        </button>
      ) : undefined}>
      {!d ? <div className="flex items-center gap-2 text-[13px] text-ink-400"><Loader2 className="size-4 animate-spin" />Loading…</div> : (
        <div className="space-y-6">
          {note && (
            <div className={`flex items-start gap-2 rounded-[var(--radius)] px-3 py-2 text-[12.5px] ${note.ok ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'}`}>
              {note.ok ? <Check className="mt-0.5 size-4" /> : <AlertTriangle className="mt-0.5 size-4" />}<span className="flex-1">{note.text}</span>
              <button onClick={() => setNote(null)}><XIcon className="size-4" /></button>
            </div>
          )}
          {s!.attention && <div className="flex gap-2 rounded-[var(--radius)] bg-crit-soft px-3 py-2 text-[13px] text-crit"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{s!.attention}</div>}
          <StatusPath status={s!.status} />
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-[13px] sm:grid-cols-3">
            <div><dt className="text-ink-400">Plan</dt><dd className="font-mono text-[12.5px]">{s!.planId ?? INBOUND_TEXT.NO_PLAN}</dd></div>
            <div><dt className="text-ink-400">In this status</dt><dd title={INBOUND_TEXT.SINCE_HINT}>{s!.daysInStatus} day(s){s!.stuck && <span className="ml-1.5"><Badge tone="crit">Stuck · limit {s!.limitDays} d</Badge></span>}</dd></div>
            <div><dt className="text-ink-400">Units</dt><dd className="tnum">{n(s!.unitsPlanned)} planned · {n(s!.unitsReceived)} received</dd></div>
            <div><dt className="text-ink-400">Our PO</dt><dd>{s!.po ? <span className="font-mono text-[12.5px]">{s!.po.poNumber}{s!.po.saleOrder ? ` · ${s!.po.saleOrder}` : ''}</span> : '—'}</dd></div>
            <div><dt className="text-ink-400">Uniware</dt><dd>{UNIWARE_LABEL[s!.po?.uniware ?? 'none']}</dd></div>
            <div><dt className="text-ink-400">First seen · last checked</dt><dd className="text-[12.5px]">{istDateTime(s!.firstSeenAt)} · {istDateTime(s!.lastSeenAt)}</dd></div>
          </dl>
          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-900">Lines ({d.lines.length})</h3>
            <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
              <table className="w-full text-[12.5px]">
                <thead className="bg-alt text-left text-[11px] uppercase tracking-wide text-ink-600">
                  <tr><th className="px-3 py-2">Seller SKU</th><th className="px-3 py-2">FNSKU</th><th className="px-3 py-2">PEP code</th><th className="px-3 py-2">Product</th><th className="px-3 py-2 text-right">Planned</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Short</th></tr>
                </thead>
                <tbody>
                  {d.lines.map((l) => {
                    const shortBy = l.qtyReceived === null ? null : l.qtyPlanned - l.qtyReceived
                    return (
                      <tr key={l.sellerSku} className="border-t border-line">
                        <td className="px-3 py-1.5 font-mono">{l.sellerSku}</td><td className="px-3 py-1.5 font-mono">{l.fnsku ?? '—'}</td>
                        <td className="px-3 py-1.5 font-mono">{l.pepCode ?? <span className="text-warn">not in master</span>}</td>
                        <td className="max-w-[260px] truncate px-3 py-1.5" title={l.productName ?? ''}>{l.productName ?? '—'}</td>
                        <td className="tnum px-3 py-1.5 text-right">{n(l.qtyPlanned)}</td><td className="tnum px-3 py-1.5 text-right">{n(l.qtyReceived)}</td>
                        <td className={`tnum px-3 py-1.5 text-right ${shortBy && shortBy > 0 && s!.status === 'CLOSED' ? 'font-semibold text-crit' : 'text-ink-600'}`}>{shortBy === null ? '—' : shortBy}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section><h3 className="mb-2 text-[13px] font-semibold text-ink-900">History</h3><Timeline events={d.events} /></section>
        </div>
      )}
    </Drawer>
  )
}

// ---- Plan drawer --------------------------------------------------------------------------------------------------
function PlanDrawer({ planId, onClose, onShipment }: { planId: string; onClose: () => void; onShipment: (id: string) => void }) {
  const q = useQuery({ queryKey: ['amazon-inbound', 'plan', planId], queryFn: ({ signal }) => getPlan(planId, signal) })
  const p = q.data?.plan
  return (
    <Drawer open onClose={onClose} wide title={<span className="font-mono">{planId}</span>}
      sub={p ? <>Created {fmtDate(p.createdAt)} · {p.shipFrom ?? '—'} · {p.shipmentCount} shipment(s) · {n(p.unitsPlanned)} units</> : undefined}>
      {!q.data ? <div className="flex items-center gap-2 text-[13px] text-ink-400"><Loader2 className="size-4 animate-spin" />Loading…</div> : (
        <div className="space-y-6">
          {p?.unitsMismatch && <div className="flex gap-2 rounded-[var(--radius)] bg-warn-soft px-3 py-2 text-[13px] text-warn"><AlertTriangle className="mt-0.5 size-4" />The plan asked for {n(p.planUnits)} units; its shipments hold {n(p.unitsPlanned)}.</div>}
          <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
            <table className="w-full text-[12.5px]">
              <thead className="bg-alt text-left text-[11px] uppercase tracking-wide text-ink-600">
                <tr><th className="px-3 py-2">Shipment → FC</th><th className="px-3 py-2">Path</th><th className="px-3 py-2">Status</th><th className="px-3 py-2 text-right">Units</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2">Our PO</th></tr>
              </thead>
              <tbody>
                {q.data.shipments.map((s) => (
                  <tr key={s.externalId} onClick={() => onShipment(s.externalId)} className={`cursor-pointer border-t border-line hover:bg-canvas ${s.attention ? 'bg-crit-soft/40' : ''}`}>
                    <td className="px-3 py-2"><div className="font-mono">{s.externalId} → {s.fcCode}</div><div className="text-[11.5px] text-ink-400">{s.fcCity}</div></td>
                    <td className="px-3 py-2"><StatusPath status={s.status} /></td>
                    <td className="px-3 py-2"><StatusBadge status={s.status} /> <span className="text-[11.5px] text-ink-400">{s.daysInStatus} d</span>{s.stuck && <span className="ml-1"><Badge tone="crit">Stuck</Badge></span>}</td>
                    <td className="tnum px-3 py-2 text-right">{n(s.unitsPlanned)}</td><td className="tnum px-3 py-2 text-right">{n(s.unitsReceived)}</td>
                    <td className="px-3 py-2 text-[12px]">{s.po ? UNIWARE_LABEL[s.po.uniware] : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <section><h3 className="mb-2 text-[13px] font-semibold text-ink-900">History</h3><Timeline events={q.data.events} /></section>
        </div>
      )}
    </Drawer>
  )
}

// ---- Plans tab ----------------------------------------------------------------------------------------------------
type PlanRow = PlanItem & { plan: string; created: string; received: string; shipments: number }
const PLAN_COLS: [string, keyof PlanRow, ColKind][] = [
  ['Plan', 'plan', 'mono'], ['Created', 'created', 'date'], ['From', 'shipFrom', 'text'], ['Shipments', 'shipments', 'num'],
  ['Units', 'unitsPlanned', 'num'], ['Received', 'received', 'text'],
]

function Plans({ onPlan }: { onPlan: (id: string) => void }) {
  const q = useQuery({ queryKey: ['amazon-inbound', 'list', 'plans'], queryFn: ({ signal }) => listPlans(signal) })
  const rows: PlanRow[] = useMemo(() => (q.data?.data ?? []).map((p) => ({
    ...p, plan: p.planId, created: p.createdAt ?? '', shipments: p.shipmentCount,
    received: p.unitsPlanned ? `${Math.round((p.unitsReceived / p.unitsPlanned) * 100)}%` : '—',
  })), [q.data])
  const s = useSection<PlanRow>(rows, ['plan', 'shipFrom'])
  const defs: FilterDef[] = [
    { key: 'shipFrom', label: 'From', type: 'multi', options: [...new Set(rows.map((r) => r.shipFrom ?? '').filter(Boolean))].sort() },
    { key: 'createdFrom', label: 'Created from', type: 'date' }, { key: 'createdTo', label: 'Created to', type: 'date' },
  ]
  const t = q.data?.meta.totals ?? {}
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <KPI label="Plans" value={n(t.plans)} />
        <KPI label="Working" value={n(t.WORKING)} tone="warn" hint="not shipped yet" />
        <KPI label="On the way" value={n((t.SHIPPED ?? 0) + (t.IN_TRANSIT ?? 0) + (t.DELIVERED ?? 0))} tone="info" hint={`${n(t.unitsInTransit)} units`} />
        <KPI label="Receiving" value={n((t.CHECKED_IN ?? 0) + (t.RECEIVING ?? 0))} tone="primary" />
        <KPI label="Closed" value={n(t.CLOSED)} tone="ok" />
        <KPI label="Stuck · attention" value={`${n(t.stuck)} · ${n(t.attention)}`} tone={(t.stuck || t.attention) ? 'crit' : 'neutral'} />
      </div>
      <SectionToolbar q={s.q} setQ={s.setQ} placeholder="Search plan id, warehouse…" filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)} activeFilters={s.active}
        entity="Amazon plans" onExport={(e) => exportRows('amazon_plans', e, PLAN_COLS, s.filtered)} />
      <Reveal open={s.open}><FilterPanel defs={defs} value={s.filters} onApply={s.setFilters} onClose={() => s.setOpen(false)} /></Reveal>
      {!s.open && <FilterChips defs={defs} value={s.filters} onChange={s.setFilters} />}
      {q.isPending ? <div className="flex items-center gap-2 py-10 text-[13px] text-ink-400"><Loader2 className="size-4 animate-spin" />Loading plans…</div>
        : !rows.length ? <p className="py-10 text-center text-[13px] text-ink-400">{INBOUND_TEXT.EMPTY}</p>
          : <DataGrid cols={PLAN_COLS} rows={s.filtered} rowKey={(r) => r.planId} onRowClick={(r) => onPlan(r.planId)} pageSize={25}
            trailing={[
              { label: 'Shipments by status', render: (r) => <PlanBar byStatus={r.byStatus} total={r.shipmentCount} />, sortValue: (r) => (r.shipmentCount ? (r.byStatus.CLOSED ?? 0) / r.shipmentCount : -1) },
              { label: 'Flags', render: (r) => (
                <span className="inline-flex gap-1">
                  {r.stuck > 0 && <Badge tone="crit">{r.stuck} stuck</Badge>}
                  {r.attention > 0 && <Badge tone="crit">{r.attention} attention</Badge>}
                  {r.unitsMismatch && <Badge tone="warn">units differ</Badge>}
                  {!r.stuck && !r.attention && !r.unitsMismatch && <span className="text-ink-400">—</span>}
                </span>
              ), sortValue: (r) => r.stuck + r.attention + (r.unitsMismatch ? 1 : 0) },
              { label: 'Open', render: (r) => <button onClick={() => onPlan(r.planId)} className="pf-press inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline">View <ArrowRight className="size-3.5" /></button> },
            ]} />}
    </div>
  )
}

// ---- Shipments tab ------------------------------------------------------------------------------------------------
type ShipRow = ShipmentItem & { fbaId: string; plan: string; fc: string; statusText: string; uniware: string; since: string }
const SHIP_COLS: [string, keyof ShipRow, ColKind][] = [
  ['FBA ID', 'fbaId', 'mono'], ['Plan', 'plan', 'mono'], ['FC', 'fc', 'text'], ['Status', 'statusText', 'text'],
  ['Since', 'since', 'date'], ['Units', 'unitsPlanned', 'num'], ['Received', 'unitsReceived', 'num'], ['Uniware', 'uniware', 'text'],
]

function Shipments({ onShipment }: { onShipment: (id: string) => void }) {
  const q = useQuery({ queryKey: ['amazon-inbound', 'list', 'shipments'], queryFn: ({ signal }) => listShipments(signal) })
  const rows: ShipRow[] = useMemo(() => (q.data ?? []).map((s) => ({
    ...s, fbaId: s.externalId, plan: short(s.planId), fc: [s.fcCode, s.fcCity].filter(Boolean).join(' · '), statusText: label(s.status),
    uniware: UNIWARE_LABEL[s.po?.uniware ?? 'none'], since: s.statusSince,
  })), [q.data])
  const s = useSection<ShipRow>(rows, ['fbaId', 'planId', 'fcCode', 'fcCity'])
  const defs: FilterDef[] = [
    { key: 'statusText', label: 'Status', type: 'multi', options: [...SHIPMENT_STEPS, 'CANCELLED', 'DELETED'].map(label) },
    { key: 'fcCode', label: 'FC', type: 'multi', options: [...new Set(rows.map((r) => r.fcCode ?? '').filter(Boolean))].sort() },
    { key: 'uniware', label: 'Uniware', type: 'multi', options: Object.values(UNIWARE_LABEL) },
  ]
  return (
    <div className="space-y-4">
      <SectionToolbar q={s.q} setQ={s.setQ} placeholder="Search FBA id, plan, FC, city…" filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)} activeFilters={s.active}
        entity="Amazon shipments" onExport={(e) => exportRows('amazon_shipments', e, SHIP_COLS, s.filtered)} />
      <Reveal open={s.open}><FilterPanel defs={defs} value={s.filters} onApply={s.setFilters} onClose={() => s.setOpen(false)} /></Reveal>
      {!s.open && <FilterChips defs={defs} value={s.filters} onChange={s.setFilters} />}
      {q.isPending ? <div className="flex items-center gap-2 py-10 text-[13px] text-ink-400"><Loader2 className="size-4 animate-spin" />Loading shipments…</div>
        : <DataGrid cols={SHIP_COLS} rows={s.filtered} rowKey={(r) => r.externalId} onRowClick={(r) => onShipment(r.externalId)} pageSize={25}
          rowClass={(r) => (r.stuck || r.attention ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-crit)]' : '')}
          trailing={[
            { label: 'Path', render: (r) => <StatusPath status={r.status} />, sortValue: (r) => SHIPMENT_STEPS.indexOf(r.status as (typeof SHIPMENT_STEPS)[number]) },
            { label: 'Days', render: (r) => (
              <span className="inline-flex items-center gap-1" title={INBOUND_TEXT.SINCE_HINT}>
                <Badge tone={r.stuck ? 'crit' : 'neutral'}><Clock className="size-3" />{r.daysInStatus} d</Badge>
              </span>
            ), sortValue: (r) => r.daysInStatus },
            { label: 'Flags', render: (r) => r.attention ? <span title={r.attention}><Badge tone="crit">attention</Badge></span> : r.stuck ? <Badge tone="crit">stuck</Badge> : <span className="text-ink-400">—</span>,
              sortValue: (r) => (r.attention ? 2 : r.stuck ? 1 : 0) },
            { label: 'Open', render: (r) => <button onClick={() => onShipment(r.externalId)} className="pf-press inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline">View <ArrowRight className="size-3.5" /></button> },
          ]} />}
    </div>
  )
}

// ---- Stuck limits tab ---------------------------------------------------------------------------------------------
function Limits({ canEdit }: { canEdit: boolean }) {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['amazon-inbound', 'limits'], queryFn: ({ signal }) => listLimits(signal) })
  const [draft, setDraft] = useState<Record<number, string>>({})
  const [msg, setMsg] = useState<string | null>(null)
  const save = async (id: number) => {
    try {
      await updateLimit(id, Number(draft[id]))
      setMsg(INBOUND_TEXT.SAVED)
      setDraft((d) => { const x = { ...d }; delete x[id]; return x })
      void qc.invalidateQueries({ queryKey: ['amazon-inbound'] })
    } catch (e) {
      setMsg(e instanceof ApiError ? e.message : String(e))
    }
  }
  return (
    <div className="max-w-[640px] space-y-3">
      <p className="text-[13px] text-ink-600">{INBOUND_TEXT.LIMITS_HINT}</p>
      {msg && <p className="text-[12.5px] text-ink-600">{msg}</p>}
      <div className="overflow-hidden rounded-[var(--radius)] border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-alt text-left text-[11px] uppercase tracking-wide text-ink-600">
            <tr><th className="px-3 py-2">Status</th><th className="px-3 py-2">Courier</th><th className="px-3 py-2">Stuck after (days)</th><th className="px-3 py-2">Last changed</th></tr>
          </thead>
          <tbody>
            {(q.data ?? []).map((l) => (
              <tr key={l.id} className="border-t border-line">
                <td className="px-3 py-2"><StatusBadge status={l.status} /></td>
                <td className="px-3 py-2 text-ink-600">{l.courier ?? 'All couriers'}</td>
                <td className="px-3 py-2">
                  {canEdit ? (
                    <span className="inline-flex items-center gap-2">
                      <input id={`limit-${l.id}`} type="number" min={1} max={365} value={draft[l.id] ?? String(l.maxDays)} onChange={(e) => setDraft({ ...draft, [l.id]: e.target.value })}
                        className="tnum h-8 w-20 rounded-md border border-line bg-surface px-2 text-center outline-none focus:border-primary" />
                      {draft[l.id] !== undefined && draft[l.id] !== String(l.maxDays) && (
                        <button onClick={() => void save(l.id)} className="pf-press h-8 rounded-md bg-primary px-3 text-[12.5px] font-semibold text-white hover:opacity-90">Save</button>
                      )}
                    </span>
                  ) : <span className="tnum">{l.maxDays}</span>}
                </td>
                <td className="px-3 py-2 text-[12px] text-ink-400">{l.updatedBy ? `${l.updatedBy} · ${istDateTime(l.updatedAt)}` : 'Default'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

export default function AmazonInbound() {
  const [tab, setTab] = useState<Tab>('plans')
  const [plan, setPlan] = useState<string | null>(null)
  const [ship, setShip] = useState<string | null>(null)
  const { accessFor } = useAuth()
  const canEdit = accessFor(PATHS.AMAZON_INBOUND) === ACCESS.EDITOR
  const sync = useQuery({ queryKey: ['amazon-inbound', 'sync'], queryFn: ({ signal }) => getSyncState(signal) }).data
  return (
    <div className="space-y-5">
      <PageTitle title={INBOUND_TEXT.TITLE} sub={INBOUND_TEXT.SUB}
        right={sync?.lastSuccessAt ? <span className="text-[12px] text-ink-400">Last checked {istDateTime(sync.lastSuccessAt)}{sync.lastError ? ' · some items failed' : ''}</span> : undefined} />
      <SubTabs value={tab} onChange={setTab} tabs={[{ key: 'plans', label: 'Plans' }, { key: 'shipments', label: 'Shipments' }, { key: 'limits', label: 'Stuck limits' }]} />
      {tab === 'plans' && <Plans onPlan={setPlan} />}
      {tab === 'shipments' && <Shipments onShipment={setShip} />}
      {tab === 'limits' && <Limits canEdit={canEdit} />}
      {plan && <PlanDrawer planId={plan} onClose={() => setPlan(null)} onShipment={(id) => setShip(id)} />}
      {ship && <ShipmentDrawer id={ship} onClose={() => setShip(null)} canEdit={canEdit} />}
    </div>
  )
}
