import { useState } from 'react'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis, Legend } from 'recharts'
import { Badge, Card, PageTitle, SubTabs } from '../../components/ui'
import { DataGrid, FilterPanel, SectionToolbar, exportRows, useSection } from '../../components/kit'
import { Reveal } from '../../components/shell'
import { DRR_HISTORY, DRR_ROWS, type ColKind, type DrrRow } from '../../lib/ops'

const COLS: [string, keyof DrrRow, ColKind][] = [['SKU', 'sku', 'mono'], ['Name', 'name', 'text'], ['SOH', 'soh', 'num'], ['DRR 3d', 'drr3', 'num'], ['DRR 7d', 'drr7', 'num'], ['DRR 30d', 'drr30', 'num']]
const SERIES = ['#4f46e5', '#0891b2', '#d97706', '#16a34a', '#db2777', '#7c3aed', '#dc2626', '#64748b']

const Dev = ({ v }: { v: number }) => {
  const tone = Math.abs(v) >= 15 ? (v > 0 ? 'text-crit' : 'text-warn') : 'text-ink-600'
  return <span className={`tnum font-medium ${tone}`}>{v > 0 ? '▲' : v < 0 ? '▼' : ''} {Math.abs(v)}%</span>
}
const AgingBadge = ({ d }: { d: number }) => <Badge tone={d < 30 ? 'crit' : d < 45 ? 'warn' : 'ok'}>{d} days</Badge>

export default function DrrAging() {
  const [tab, setTab] = useState<'current' | 'critical' | 'trend'>('current')
  const critical = DRR_ROWS.filter((r) => r.aging < 45)
  return (
    <div className="space-y-5">
      <PageTitle title="DRR & Aging" sub="Daily run rate over 3 / 7 / 30 days · deviation = DRR 3d vs DRR 30d · aging on DRR 7d" />
      <SubTabs value={tab} onChange={setTab} tabs={[
        { key: 'current', label: 'Current aging & DRR', count: DRR_ROWS.length },
        { key: 'critical', label: 'Critical SKUs (< 45 days)', count: critical.length, danger: true },
        { key: 'trend', label: 'Historical trend' },
      ]} />
      {tab === 'current' && <Grid rows={DRR_ROWS} name="drr_current" />}
      {tab === 'critical' && <Grid rows={critical} name="drr_critical" />}
      {tab === 'trend' && <Trend />}
    </div>
  )
}

function Grid({ rows, name }: { rows: DrrRow[]; name: string }) {
  const s = useSection<DrrRow>(rows, ['sku', 'name'])
  return (
    <div className="space-y-3">
      <SectionToolbar q={s.q} setQ={s.setQ} placeholder="Search SKU…" filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)} activeFilters={s.active} entity="DRR overrides" onExport={(e) => exportRows(name, e, COLS, s.filtered)} />
      <Reveal open={s.open}><FilterPanel defs={[{ key: 'sku', label: 'SKU Code', type: 'text', placeholder: 'Enter SKU code' }, { key: 'name', label: 'Name contains', type: 'text' }]} value={s.filters} onApply={s.setFilters} onClose={() => s.setOpen(false)} /></Reveal>
      <DataGrid cols={COLS} rows={s.filtered} rowKey={(r) => r.sku}
        trailing={[{ label: 'Deviation', render: (r) => <Dev v={r.deviation} /> }, { label: 'Current aging', render: (r) => <AgingBadge d={r.aging} /> }]} />
    </div>
  )
}

function Trend() {
  const [metric, setMetric] = useState<'drr' | 'aging'>('drr')
  const [picked, setPicked] = useState<string[]>(DRR_ROWS.slice(0, 4).map((r) => r.sku))
  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-[var(--radius)] border border-line p-0.5">
          {(['drr', 'aging'] as const).map((m) => <button key={m} onClick={() => setMetric(m)} className={`rounded px-3 py-1 text-[12px] font-semibold ${metric === m ? 'bg-primary text-white' : 'text-ink-600'}`}>{m === 'drr' ? 'DRR (30d)' : 'Aging (days)'}</button>)}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {DRR_ROWS.map((r, i) => {
            const on = picked.includes(r.sku)
            return (
              <button key={r.sku} onClick={() => setPicked(on ? picked.filter((x) => x !== r.sku) : [...picked, r.sku])}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[11px] ${on ? 'border-transparent bg-alt text-ink-900' : 'border-line text-ink-400'}`}>
                <span className="size-2 rounded-full" style={{ background: on ? SERIES[i % SERIES.length] : '#d1d5db' }} />{r.sku}
              </button>
            )
          })}
        </div>
      </div>
      <div className="h-[340px]">
        <ResponsiveContainer>
          <LineChart data={DRR_HISTORY} margin={{ left: -10, right: 8 }}>
            <CartesianGrid stroke="#f3f4f6" vertical={false} />
            <XAxis dataKey="week" tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 12, fill: '#6b7280' }} axisLine={false} tickLine={false} />
            <Tooltip contentStyle={{ borderRadius: 8, border: '1px solid #e5e7eb', fontSize: 12 }} />
            <Legend wrapperStyle={{ fontSize: 12 }} />
            {DRR_ROWS.map((r, i) => picked.includes(r.sku) && (
              <Line key={r.sku} name={r.sku} dataKey={metric === 'drr' ? r.sku : `${r.sku}__aging`} stroke={SERIES[i % SERIES.length]} strokeWidth={2} dot={false} />
            ))}
          </LineChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}
