import { useMemo, useState } from 'react'
import { CalendarClock, Check, MessageSquareText, PackagePlus, Trash2 } from 'lucide-react'
import { Badge, BulkUpload, Button, Drawer, PageTitle, SubTabs, downloadCsv } from '../../components/ui'
import { DataGrid, PrimaryBtn, SectionToolbar, exportRows, inputCls, useSection } from '../../components/kit'
import { overallInventory } from '../../lib/data'
import { PO_LINES, SHIPMENTS, TODAY, fmtDate, type ColKind } from '../../lib/ops'

type Win = 'all' | 'week' | 'next'
type Virtual = { id: number; qty: number; eta: string; note: string }
type Remark = { id: number; date: string; text: string }
type Impact = { poNumber: string; uid: string; channel: string; location: string; due: string; qty: number; priority: number }

type SRow = { code: string; name: string; required: number; soh: number; incoming: number; gross: number; net: number; pos: number; nextEta: string; remark: string; impacts: Impact[] }
const SCOLS: [string, keyof SRow, ColKind][] = [
  ['SKU Code', 'code', 'mono'], ['SKU Name', 'name', 'text'], ['Impacted POs', 'pos', 'num'], ['Required', 'required', 'num'], ['SOH', 'soh', 'num'],
  ['Gross short', 'gross', 'num'], ['Virtual inv.', 'incoming', 'num'], ['Next ETA', 'nextEta', 'date'], ['Demand remarks', 'remark', 'text'],
]

const addDays = (n: number) => { const d = new Date(TODAY + 'T00:00:00'); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10) }
// Week = Mon–Sun containing TODAY
const dow = (new Date(TODAY + 'T00:00:00').getDay() + 6) % 7
const WEEK_END = addDays(6 - dow)
const NEXT_START = addDays(7 - dow)
const NEXT_END = addDays(13 - dow)
const WIN_LABEL: Record<Win, string> = { all: 'All open POs', week: 'This week', next: 'Next week' }
const WEEK_START = addDays(-dow)
const inWin = (w: Win, d: string) => w === 'all' || (w === 'week' ? d >= WEEK_START && d <= WEEK_END : d >= NEXT_START && d <= NEXT_END)

const shipByUid = new Map(SHIPMENTS.map((s) => [s.uid, s]))
const sohBySku = new Map(overallInventory().map((o) => [o.sku, o.soh]))
const dueOf = (uid: string) => { const s = shipByUid.get(uid)!; return s.currentApptDate || s.dispatchTentative }

export default function ShortSkus({ priority }: { priority: Record<string, number> }) {
  const [win, setWin] = useState<Win>('all')
  const [virtual, setVirtual] = useState<Record<string, Virtual[]>>({})
  const [remarks, setRemarks] = useState<Record<string, Remark[]>>({})
  const [canProcess, setCanProcess] = useState<Record<string, string[]>>({})
  const [sel, setSel] = useState<string | null>(null)

  const compute = (w: Win) => {
    const end = w === 'week' ? WEEK_END : w === 'next' ? NEXT_END : '9999'
    const m = new Map<string, { code: string; name: string; required: number; impacts: Impact[] }>()
    for (const l of PO_LINES) {
      if (['Delivered', 'Closed', 'Cancelled', 'In transit'].includes(l.status)) continue
      const due = dueOf(l.shipmentUid)
      if (w === 'week' && due > WEEK_END) continue
      if (w === 'next' && (due < NEXT_START || due > NEXT_END)) continue
      const e = m.get(l.skuCode) ?? { code: l.skuCode, name: l.skuName, required: 0, impacts: [] }
      e.required += l.updatedQuantity
      e.impacts.push({ poNumber: l.poNumber, uid: l.shipmentUid, channel: l.channel, location: l.location, due, qty: l.updatedQuantity, priority: priority[l.channel] ?? 3 })
      m.set(l.skuCode, e)
    }
    // next week: SOH is net of what this week consumes
    const thisWeek = w === 'next' ? compute('week') : []
    return [...m.values()].map((e) => {
      const used = thisWeek.find((x) => x.code === e.code)?.required ?? 0
      const soh = Math.max(0, (sohBySku.get(e.code) ?? 0) - used)
      const incoming = (virtual[e.code] ?? []).filter((v) => v.eta && v.eta <= end).reduce((a, v) => a + v.qty, 0)
      const gross = Math.max(0, e.required - soh)
      return { ...e, soh, incoming, gross, net: Math.max(0, e.required - soh - incoming), impacts: e.impacts.sort((a, b) => a.priority - b.priority || a.due.localeCompare(b.due)) }
    }).filter((e) => e.gross > 0).sort((a, b) => b.net - a.net)
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const all = useMemo(() => ({ all: compute('all'), week: compute('week'), next: compute('next') }), [virtual, priority])
  const rows: SRow[] = all[win].map((r) => ({ ...r, pos: r.impacts.length, nextEta: (virtual[r.code] ?? []).filter((v) => win !== 'week' || v.eta <= WEEK_END).filter((v) => win !== 'next' || v.eta <= NEXT_END).map((v) => v.eta).sort()[0] ?? '', remark: (remarks[r.code] ?? []).filter((m) => inWin(win, m.date)).map((m) => `${fmtDate(m.date)}: ${m.text}`).join(' · ') }))
  const s = useSection<SRow>(rows, ['code', 'name', 'remark'])
  const cur = sel ? all[win].find((r) => r.code === sel) ?? all.all.find((r) => r.code === sel) : null
  const [bulk, setBulk] = useState<null | 'virtual' | 'remarks'>(null)

  return (
    <div className="space-y-5">
      <PageTitle title="SKUs Short" sub="Required vs SOH + virtual inventory for open POs · remarks and incoming stock show in the window their date falls in · click a SKU for impacted POs" />
      <SubTabs value={win} onChange={setWin} tabs={(['all', 'week', 'next'] as Win[]).map((k) => ({ key: k, label: WIN_LABEL[k], count: all[k].filter((r) => r.net > 0).length, danger: all[k].some((r) => r.net > 0) }))} />
      <SectionToolbar q={s.q} setQ={s.setQ} placeholder="Search SKU code, name, remark…" entity="Short SKUs"
        onExport={(e) => exportRows(`short_skus_${win}`, e, SCOLS, s.filtered)}
        extra={<Button icon={<MessageSquareText className="size-3.5" />} onClick={() => setBulk('remarks')}>Bulk remarks</Button>}
        primary={<PrimaryBtn icon={<PackagePlus className="size-4" />} onClick={() => setBulk('virtual')}>Bulk virtual inventory</PrimaryBtn>} />
      {rows.length === 0 ? (
        <div className="flex items-center gap-2 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-6 text-[13px] text-ok"><Check className="size-4" /> No shortages in this window</div>
      ) : (
        <DataGrid pageSizeKey="short-skus" cols={SCOLS} rows={s.filtered} rowKey={(r) => r.code} sticky={1} onRowClick={(r) => setSel(r.code)}
          rowClass={(r) => (r.net > 0 ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-crit)]' : '')}
          trailing={[
            { label: 'Net short', render: (r) => r.net === 0 ? <Badge tone="ok">Covered by incoming</Badge> : <span className="tnum font-semibold text-crit">−{r.net.toLocaleString('en-IN')}</span> },
            { label: 'Coverage', render: (r) => {
              const pct = Math.min(100, Math.round((r.soh / r.required) * 100)); const vPct = Math.min(100 - pct, Math.round((r.incoming / r.required) * 100))
              return <div className="flex w-28 items-center gap-2"><div className="flex h-1.5 flex-1 overflow-hidden rounded-full bg-alt"><div className="h-full bg-crit" style={{ width: `${pct}%` }} /><div className="h-full bg-warn/70" style={{ width: `${vPct}%` }} /></div><span className="tnum text-[11px] text-ink-400">{pct + vPct}%</span></div>
            } },
            { label: '', render: () => <span className="text-[12px] font-semibold text-primary">Impacted POs →</span> },
          ]}
          rowMenu={(r) => [{ label: 'View impacted POs', onClick: () => setSel(r.code) }, { label: 'Add virtual inventory', onClick: () => setSel(r.code) }, { label: 'Add remark', onClick: () => setSel(r.code) }]} />
      )}

      <BulkUpload open={bulk === 'virtual'} onClose={() => setBulk(null)} entity="Virtual inventory"
        onDownloadTemplate={() => downloadCsv('virtual_inventory_template.csv', ['SKU Code', 'Qty', 'ETA (YYYY-MM-DD)', 'Source / note'], rows.map((r) => [r.code, '', '', '']))} />
      <BulkUpload open={bulk === 'remarks'} onClose={() => setBulk(null)} entity="Demand team remarks"
        onDownloadTemplate={() => downloadCsv('sku_remarks_template.csv', ['SKU Code', 'Date (YYYY-MM-DD)', 'PO Numbers to process (comma separated)', 'Remark'], rows.map((r) => [r.code, TODAY, '', '']))} />

      {cur && (
        <SkuDrawer
          row={cur} windowLabel={WIN_LABEL[win]} onClose={() => setSel(null)}
          virtual={virtual[cur.code] ?? []} setVirtual={(v) => setVirtual({ ...virtual, [cur.code]: v })}
          remarks={remarks[cur.code] ?? []} setRemarks={(t) => setRemarks({ ...remarks, [cur.code]: t })}
          picked={canProcess[cur.code] ?? []} setPicked={(p) => setCanProcess({ ...canProcess, [cur.code]: p })}
        />
      )}
    </div>
  )
}

function SkuDrawer({ row, windowLabel, onClose, virtual, setVirtual, remarks, setRemarks, picked, setPicked }: {
  row: { code: string; name: string; required: number; soh: number; incoming: number; gross: number; net: number; impacts: Impact[] }; windowLabel: string; onClose: () => void
  virtual: Virtual[]; setVirtual: (v: Virtual[]) => void; remarks: Remark[]; setRemarks: (t: Remark[]) => void; picked: string[]; setPicked: (p: string[]) => void
}) {
  const [draft, setDraft] = useState({ text: '', date: TODAY })
  const [nv, setNv] = useState({ qty: '', eta: '', note: '' })
  const pickedQty = row.impacts.filter((i) => picked.includes(i.uid)).reduce((a, i) => a + i.qty, 0)
  const over = pickedQty > row.soh
  // Greedy suggestion: by priority then due date, within SOH
  const suggest = () => { let left = row.soh; const out: string[] = []; for (const i of row.impacts) if (i.qty <= left) { out.push(i.uid); left -= i.qty } setPicked(out) }
  const Stat = ({ l, v, tone = '' }: { l: string; v: number; tone?: string }) => (
    <div className="rounded-[var(--radius)] bg-canvas px-3 py-2"><div className="text-[11px] uppercase tracking-wide text-ink-400">{l}</div><div className={`tnum text-[15px] font-semibold ${tone}`}>{v.toLocaleString('en-IN')}</div></div>
  )
  return (
    <Drawer open onClose={onClose} title={row.name} sub={<><span className="font-mono">{row.code}</span> · {windowLabel}</>}
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" onClick={onClose}>Done</Button></>}>
      <div className="grid grid-cols-4 gap-2">
        <Stat l="Required" v={row.required} />
        <Stat l="SOH" v={row.soh} />
        <Stat l="Incoming" v={row.incoming} tone="text-warn" />
        <Stat l="Net short" v={row.net} tone={row.net ? 'text-crit' : 'text-ok'} />
      </div>

      <div className="mt-6 mb-2 flex items-center justify-between">
        <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-600">Impacted POs · {row.impacts.length}</h3>
        <button onClick={suggest} className="text-[12px] font-semibold text-primary hover:underline">Suggest with current SOH</button>
      </div>
      <div className="overflow-hidden rounded-[var(--radius)] border border-line">
        <table className="w-full text-[12.5px]">
          <thead className="bg-alt"><tr>{['Process', 'PO Number', 'Channel', 'Due', 'Qty', 'Priority'].map((h) => <th key={h} className="px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600">{h}</th>)}</tr></thead>
          <tbody>
            {row.impacts.map((i) => {
              const on = picked.includes(i.uid)
              return (
                <tr key={i.uid + i.poNumber} onClick={() => setPicked(on ? picked.filter((x) => x !== i.uid) : [...picked, i.uid])} className={`cursor-pointer border-t border-line ${on ? 'bg-ok-soft' : 'hover:bg-canvas'}`}>
                  <td className="px-2.5 py-2"><input type="checkbox" readOnly checked={on} className="accent-[var(--color-ok)]" /></td>
                  <td className="px-2.5 py-2 font-mono">{i.poNumber}</td>
                  <td className="px-2.5 py-2">{i.channel}<div className="text-[11px] text-ink-400">{i.location}</div></td>
                  <td className="tnum px-2.5 py-2">{fmtDate(i.due)}</td>
                  <td className="tnum px-2.5 py-2">{i.qty.toLocaleString('en-IN')}</td>
                  <td className="tnum px-2.5 py-2">{i.priority}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className={`mt-1.5 text-[12px] ${over ? 'text-crit' : 'text-ink-600'}`}>
        Selected <span className="tnum font-semibold">{pickedQty.toLocaleString('en-IN')}</span> of <span className="tnum">{row.soh.toLocaleString('en-IN')}</span> on hand{over ? ' — exceeds current SOH' : ''}
      </p>

      <h3 className="mt-6 mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-600">Demand team remarks</h3>
      <p className="mb-2 text-[12px] text-ink-400">Remarks are kept across tabs and shown in This week / Next week by their date.</p>
      {remarks.length > 0 && (
        <ul className="mb-3 divide-y divide-line rounded-[var(--radius)] border border-line">
          {[...remarks].sort((a, b) => a.date.localeCompare(b.date)).map((m) => (
            <li key={m.id} className="flex items-start gap-3 px-3 py-2 text-[13px]">
              <span className="tnum shrink-0 text-ink-600">{fmtDate(m.date)}</span>
              <span className="min-w-0 flex-1">{m.text}</span>
              <button onClick={() => setRemarks(remarks.filter((x) => x.id !== m.id))} className="text-ink-400 hover:text-crit"><Trash2 className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-[140px_1fr_auto] gap-2">
        <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={inputCls} />
        <input value={draft.text} onChange={(e) => setDraft({ ...draft, text: e.target.value })} placeholder="e.g. Process Zepto + Blinkit now; hold Myntra till GRN" className={inputCls} />
        <Button variant="primary" onClick={() => { if (draft.text.trim()) { setRemarks([...remarks, { id: Date.now(), ...draft }]); setDraft({ ...draft, text: '' }) } }}>Add</Button>
      </div>

      <h3 className="mt-6 mb-2 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-600"><PackagePlus className="size-3.5" /> Virtual inventory</h3>
      <p className="mb-2 text-[12px] text-ink-400">Stock expected to arrive (production, STO, GRN). Counts toward a window only if ETA falls inside it.</p>
      {virtual.length > 0 && (
        <ul className="mb-3 divide-y divide-line rounded-[var(--radius)] border border-line">
          {virtual.map((v) => (
            <li key={v.id} className="flex items-center gap-3 px-3 py-2 text-[13px]">
              <span className="tnum font-semibold text-warn">+{v.qty.toLocaleString('en-IN')}</span>
              <span className="inline-flex items-center gap-1 text-ink-600"><CalendarClock className="size-3.5" /><span className="tnum">{fmtDate(v.eta)}</span></span>
              <span className="min-w-0 flex-1 truncate text-ink-400">{v.note}</span>
              <button onClick={() => setVirtual(virtual.filter((x) => x.id !== v.id))} className="text-ink-400 hover:text-crit"><Trash2 className="size-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
      <div className="grid grid-cols-[90px_140px_1fr_auto] gap-2">
        <input type="number" placeholder="Qty" value={nv.qty} onChange={(e) => setNv({ ...nv, qty: e.target.value })} className={`${inputCls} tnum`} />
        <input type="date" value={nv.eta} min={TODAY} onChange={(e) => setNv({ ...nv, eta: e.target.value })} className={inputCls} />
        <input placeholder="Source / note" value={nv.note} onChange={(e) => setNv({ ...nv, note: e.target.value })} className={inputCls} />
        <Button variant="primary" onClick={() => { if (Number(nv.qty) > 0 && nv.eta) { setVirtual([...virtual, { id: Date.now(), qty: Number(nv.qty), eta: nv.eta, note: nv.note }]); setNv({ qty: '', eta: '', note: '' }) } }}>Add</Button>
      </div>
    </Drawer>
  )
}
