import { useMemo, useState } from 'react'
import { SlidersHorizontal, Truck } from 'lucide-react'
import { Badge, Button, Drawer, PageTitle } from '../../components/ui'
import { DataGrid, FilterPanel, PrimaryBtn, SectionToolbar, exportRows, inputCls, useSection, type FilterDef } from '../../components/kit'
import { Reveal } from '../../components/shell'
import {
  CITIES, FACILITIES, OPS_CHANNELS, SHIPMENTS, ST_WAREHOUSE, TRANSPORTERS, daysUntil, fmtDate, shipmentCriticality, type ColKind, type Shipment,
} from '../../lib/ops'

type Row = Shipment & { priority: number; crit: 'Critical' | 'High' | 'Medium' | 'Low'; score: number; dLeft: number | null }
const CRIT_TONE = { Critical: 'crit', High: 'warn', Medium: 'info', Low: 'neutral' } as const

const COLS: [string, keyof Row, ColKind][] = [
  ['PO Number', 'poNumber', 'mono'], ['UID', 'uid', 'mono'], ['Channel', 'channel', 'text'], ['Location', 'location', 'text'], ['Facility', 'facility', 'mono'],
  ['Updated Qty', 'updatedQty', 'num'], ['Updated PoValue', 'updatedPoValue', 'money'], ['Current Appt', 'currentApptDate', 'date'],
  ['Status (Warehouse)', 'statusWarehouse', 'status'], ['Status (Logistics)', 'statusLogistics', 'status'], ['Transporter', 't1', 'text'],
  ['Rates/kg', 'ratePerKg', 'money'], ['Remarks (Planning)', 'remarksPlanning', 'text'],
]

export default function POWorking({ prio, setPrio }: { prio: Record<string, number>; setPrio: (p: Record<string, number>) => void }) {
  const [edits, setEdits] = useState<Record<string, Partial<Shipment>>>({})
  const [prioOpen, setPrioOpen] = useState(false)
  const [sel, setSel] = useState<Row | null>(null)

  const rows: Row[] = useMemo(
    () => SHIPMENTS.filter((s) => !['Delivered', 'Closed', 'Cancelled'].includes(s.status))
      .map((s) => ({ ...s, ...edits[s.uid] }))
      .map((s) => { const p = prio[s.channel] ?? 3; const c = shipmentCriticality(s, p); return { ...s, priority: p, crit: c.level, score: c.score, dLeft: daysUntil(s.currentApptDate) } })
      .sort((a, b) => b.score - a.score),
    [prio, edits],
  )
  const s = useSection<Row>(rows, ['poNumber', 'uid', 'channel'])
  const counts = { Critical: rows.filter((r) => r.crit === 'Critical').length, High: rows.filter((r) => r.crit === 'High').length }

  const defs: FilterDef[] = [
    { key: 'crit', label: 'Criticality', type: 'multi', options: ['Critical', 'High', 'Medium', 'Low'] },
    { key: 'channel', label: 'Channel', type: 'multi', options: OPS_CHANNELS },
    { key: 'facility', label: 'Facility', type: 'multi', options: FACILITIES },
    { key: 'location', label: 'Location', type: 'multi', options: CITIES },
    { key: 'statusWarehouse', label: 'Status Warehouse', type: 'multi', options: ST_WAREHOUSE },
    { key: 't1', label: 'Transporter', type: 'multi', options: TRANSPORTERS },
    { key: 'currentApptDateFrom', label: 'Appt From', type: 'date' }, { key: 'currentApptDateTo', label: 'Appt To', type: 'date' },
  ]

  return (
    <div className="space-y-5">
      <PageTitle title="PO Working" sub={<>All active POs until delivered · ranked by appointment urgency × channel priority · <span className="text-crit">{counts.Critical} critical</span>, {counts.High} high</>} />

      <SectionToolbar q={s.q} setQ={s.setQ} placeholder="Search PO number, UID, channel…" filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)} activeFilters={s.active}
        entity="PO Working updates" onExport={(e) => exportRows('po_working', e, COLS, s.filtered)}
        extra={<Button icon={<SlidersHorizontal className="size-3.5" />} onClick={() => setPrioOpen(true)}>Channel priority</Button>}
        primary={<PrimaryBtn icon={<Truck className="size-4" />}>Bulk logistics update</PrimaryBtn>} />
      <Reveal open={s.open}><FilterPanel defs={defs} value={s.filters} onApply={s.setFilters} onClose={() => s.setOpen(false)} /></Reveal>

      <DataGrid cols={COLS} rows={s.filtered} rowKey={(r) => r.uid} onRowClick={setSel}
        rowClass={(r) => (r.crit === 'Critical' ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-crit)]' : '')}
        trailing={[
          { label: 'Criticality', render: (r) => <Badge tone={CRIT_TONE[r.crit]}>{r.crit}</Badge> },
          { label: 'Appt in', render: (r) => r.dLeft === null ? <span className="text-warn">Not booked</span> : <span className={`tnum ${r.dLeft <= 1 ? 'text-crit' : 'text-ink-600'}`}>{r.dLeft <= 0 ? 'Today/overdue' : `${r.dLeft}d`}</span> },
          { label: 'Priority', render: (r) => <span className="tnum font-medium">{r.priority}</span> },
        ]}
        rowMenu={(r) => [{ label: 'Add remark', onClick: () => setSel(r) }, { label: 'Change appointment', onClick: () => setSel(r) }, { label: 'Logistics update', onClick: () => setSel(r) }]} />

      {prioOpen && (
        <Drawer open onClose={() => setPrioOpen(false)} title="Channel priority" sub="Order channels by priority — 1 is served first. Same number = equal priority. Changes recompute criticality instantly and are logged to Approvals."
          footer={<Button variant="primary" onClick={() => setPrioOpen(false)}>Done</Button>}>
          <div className="divide-y divide-line">
            {[...OPS_CHANNELS].sort((a, b) => (prio[a] ?? 99) - (prio[b] ?? 99)).map((c) => (
              <div key={c} className="flex items-center gap-3 py-2.5">
                <span className="tnum flex size-7 items-center justify-center rounded-full bg-primary-soft text-[12px] font-semibold text-primary">{prio[c]}</span>
                <span className="flex-1 text-[13px] font-medium">{c}</span>
                <span className="text-[12px] text-ink-400">Order</span>
                <input type="number" min={1} max={OPS_CHANNELS.length} value={prio[c] ?? ''} onChange={(e) => setPrio({ ...prio, [c]: Math.max(1, Number(e.target.value) || 1) })} className={`${inputCls} tnum w-20 text-center`} />
              </div>
            ))}
          </div>
        </Drawer>
      )}
      {sel && <WorkDrawer row={sel} onClose={() => setSel(null)} onSave={(p) => { setEdits({ ...edits, [sel.uid]: { ...edits[sel.uid], ...p } }); setSel(null) }} />}
    </div>
  )
}

function WorkDrawer({ row, onClose, onSave }: { row: Row; onClose: () => void; onSave: (p: Partial<Shipment>) => void }) {
  const [f, setF] = useState({ currentApptDate: row.currentApptDate, reason: '', remarksPlanning: row.remarksPlanning, b2bRemarks: row.b2bRemarks, t1: row.t1, d1: row.d1, ratePerKg: String(row.ratePerKg), deliveryType: row.deliveryType, dedicatedVehicle: row.dedicatedVehicle })
  const apptChanged = f.currentApptDate !== row.currentApptDate
  const ok = !apptChanged || f.reason.trim().length > 0
  const L = ({ children }: { children: string }) => <div className="mb-1 text-[12px] font-medium text-ink-600">{children}</div>
  return (
    <Drawer open onClose={onClose} title={<span className="font-mono">{row.poNumber}</span>} sub={<>{row.channel} · {row.location} · <Badge tone={CRIT_TONE[row.crit]}>{row.crit}</Badge></>}
      footer={<><Button onClick={onClose}>Cancel</Button><Button variant="primary" onClick={() => ok && onSave({ currentApptDate: f.currentApptDate, remarksPlanning: f.remarksPlanning, b2bRemarks: f.b2bRemarks, t1: f.t1, d1: f.d1, ratePerKg: Number(f.ratePerKg), deliveryType: f.deliveryType, dedicatedVehicle: f.dedicatedVehicle })}>Save</Button></>}>
      <section className="space-y-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-600">Appointment</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><L>Current appointment</L><input type="date" value={f.currentApptDate} onChange={(e) => setF({ ...f, currentApptDate: e.target.value })} className={inputCls} /></div>
          <div><L>First appointment</L><div className="tnum flex h-9 items-center text-[13px] text-ink-600">{fmtDate(row.firstApptDate)}</div></div>
        </div>
        {apptChanged && (
          <div><L>Reason for change (required)</L><input value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. Channel slot unavailable" className={`${inputCls} ${f.reason ? '' : 'border-crit/50'}`} /></div>
        )}
      </section>
      <section className="mt-6 space-y-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-600">Remarks</h3>
        <div><L>Remarks (Planning)</L><textarea rows={2} value={f.remarksPlanning} onChange={(e) => setF({ ...f, remarksPlanning: e.target.value })} className={`${inputCls} h-auto py-2`} /></div>
        <div><L>B2B Working Team Remarks</L><textarea rows={2} value={f.b2bRemarks} onChange={(e) => setF({ ...f, b2bRemarks: e.target.value })} className={`${inputCls} h-auto py-2`} /></div>
      </section>
      <section className="mt-6 space-y-3">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-600">Logistics</h3>
        <div className="grid grid-cols-2 gap-3">
          <div><L>Pickup partner (first mile)</L><select value={f.t1} onChange={(e) => setF({ ...f, t1: e.target.value })} className={inputCls}><option value="">Not assigned</option>{TRANSPORTERS.map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><L>Docket / vehicle no.</L><input value={f.d1} onChange={(e) => setF({ ...f, d1: e.target.value })} className={`${inputCls} font-mono`} /></div>
          <div><L>Rate / kg (₹)</L><input type="number" value={f.ratePerKg} onChange={(e) => setF({ ...f, ratePerKg: e.target.value })} className={`${inputCls} tnum`} /></div>
          <div><L>Delivery type</L><select value={f.deliveryType} onChange={(e) => setF({ ...f, deliveryType: e.target.value })} className={inputCls}>{['Surface', 'Air', 'FTL'].map((t) => <option key={t}>{t}</option>)}</select></div>
          <div><L>Dedicated vehicle</L><select value={f.dedicatedVehicle} onChange={(e) => setF({ ...f, dedicatedVehicle: e.target.value })} className={inputCls}><option>No</option><option>Yes</option></select></div>
          <div><L>Est. freight</L><div className="tnum flex h-9 items-center text-[13px]">₹{(row.chargeableWeight * Number(f.ratePerKg || 0)).toLocaleString('en-IN')}<span className="ml-1 text-ink-400">· {row.chargeableWeight} kg</span></div></div>
        </div>
      </section>
    </Drawer>
  )
}
