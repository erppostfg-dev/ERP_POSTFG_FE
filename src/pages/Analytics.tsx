import { useState } from 'react'
import {
  Bar, BarChart, CartesianGrid, Cell, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import {
  agingBand, criticality, fillRateByChannel, overallInventory, PO_TO_DELIVERY, PO_TO_DELIVERY_TARGET, POS,
} from '../lib/data'
import { Badge, Button, Card, KPI, PageTitle, PillToggle, Td, Th } from '../components/ui'

const ACCENT = '#4f46e5'
const DANGER = '#dc2626'

export default function Analytics({ go }: { go: (v: string) => void }) {
  const [level, setLevel] = useState<'channel' | 'sku' | 'po'>('channel')
  const fill = fillRateByChannel()
  const overall = overallInventory()
  const signals = overall.filter((s) => s.signal || agingBand(s.aging).band === 'At-risk')

  const critical = POS.filter((p) => criticality(p).level === 'Critical').length
  const blocked = POS.filter((p) => p.blocked).length
  const avgFill = Math.round(fill.reduce((s, f) => s + f.fill, 0) / fill.length)

  return (
    <div className="space-y-5">
      <PageTitle title="Analytics" sub="Fill rate, PO-to-delivery and the SKUs that carry a signal — the numbers that need action" />

      {/* Global controls */}
      <div className="flex flex-wrap items-end gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-3">
        {['Date range', 'Brand', 'Channel'].map((f) => (
          <label key={f} className="block"><span className="mb-1 block text-[10px] text-ink-400">{f}</span>
            <select className="rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12px] outline-none focus:border-primary"><option>All</option></select>
          </label>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KPI label="Avg fill rate" value={String(avgFill)} unit="%" tone="ok" />
        <KPI label="PO → Delivery" value="10.4" unit="days" tone="info" hint="target < 12" />
        <KPI label="Critical POs" value={String(critical)} tone="crit" />
        <KPI label="Inventory-blocked" value={String(blocked)} tone="warn" />
        <KPI label="SKUs flagged" value={String(signals.length)} tone="warn" hint="signals" />
      </div>

      {/* Fill rate */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-semibold">Fill rate</h2>
          <PillToggle value={level} onChange={setLevel} options={[{ key: 'channel', label: 'By channel' }, { key: 'sku', label: 'By SKU' }, { key: 'po', label: 'By PO' }]} />
        </div>
        <p className="mt-0.5 text-[12px] text-ink-600">Shipped ÷ ordered</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={fill} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="channel" tick={{ fontSize: 11, fill: 'var(--color-ink-600)' }} tickLine={false} axisLine={{ stroke: 'var(--color-line)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-ink-600)' }} tickLine={false} axisLine={false} unit="%" />
              <Tooltip cursor={{ fill: 'var(--color-alt)' }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--color-line)' }} />
              <Bar dataKey="fill" radius={[4, 4, 0, 0]} name="Fill %">
                {fill.map((f, i) => <Cell key={i} fill={f.fill < 60 ? DANGER : ACCENT} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-line">
          <table className="w-full border-collapse">
            <thead className="border-b border-line bg-alt/60"><tr><Th>Channel</Th><Th right>Fill rate</Th><Th>Band</Th></tr></thead>
            <tbody className="divide-y divide-line">
              {fill.map((f) => (
                <tr key={f.channel} className="hover:bg-alt/40">
                  <Td>{f.channel}</Td>
                  <Td right mono className="font-semibold">{f.fill}%</Td>
                  <Td><Badge tone={f.fill >= 80 ? 'ok' : f.fill >= 60 ? 'warn' : 'crit'}>{f.fill >= 80 ? 'High' : f.fill >= 60 ? 'Medium' : 'Low'}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      {/* PO to delivery */}
      <Card className="p-4">
        <h2 className="text-[18px] font-semibold">PO → Delivery days</h2>
        <p className="mt-0.5 text-[12px] text-ink-600">Average per channel against a {PO_TO_DELIVERY_TARGET}-day target</p>
        <div className="mt-4 h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={PO_TO_DELIVERY} margin={{ top: 8, right: 8, left: -12, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="channel" tick={{ fontSize: 11, fill: 'var(--color-ink-600)' }} tickLine={false} axisLine={{ stroke: 'var(--color-line)' }} />
              <YAxis tick={{ fontSize: 11, fill: 'var(--color-ink-600)' }} tickLine={false} axisLine={false} unit="d" />
              <Tooltip cursor={{ fill: 'var(--color-alt)' }} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--color-line)' }} />
              <ReferenceLine y={PO_TO_DELIVERY_TARGET} stroke={DANGER} strokeDasharray="4 4" label={{ value: 'Target 12d', fontSize: 10, fill: DANGER, position: 'right' }} />
              <Bar dataKey="days" radius={[4, 4, 0, 0]} name="Days">
                {PO_TO_DELIVERY.map((d, i) => <Cell key={i} fill={d.days > PO_TO_DELIVERY_TARGET ? DANGER : ACCENT} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Insights — signals only */}
      <Card className="p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-[18px] font-semibold">Insights</h2>
          <span className="text-[12px] text-ink-400">signals only · {signals.length} SKUs</span>
        </div>
        <div className="mt-3 grid gap-2 sm:grid-cols-2">
          {signals.map((s) => {
            const band = agingBand(s.aging)
            return (
              <div key={s.sku} className="flex items-center justify-between rounded-lg border border-line p-3">
                <div>
                  <div className="font-mono text-[12px] font-medium text-primary">{s.sku}</div>
                  <div className="text-[12px] text-ink-600">{s.name}</div>
                  <div className="mt-1 flex gap-2">
                    {band.band === 'At-risk' && <Badge tone="crit">Stockout risk</Badge>}
                    {s.signal && <Badge tone={s.drrDelta > 0 ? 'ok' : 'crit'}>DRR {s.drrDelta > 0 ? '▲' : '▼'} {Math.abs(s.drrDelta)}%</Badge>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="tnum text-[12px] text-ink-600">SOH {s.soh.toLocaleString('en-IN')}</div>
                  <div className="tnum text-[12px] text-ink-600">DRR {s.drr} · <span className={`font-semibold text-${band.tone === 'crit' ? 'crit' : band.tone === 'warn' ? 'warn' : 'ok'}`}>{s.aging}d</span></div>
                  <Button variant="ghost" onClick={() => go('inventory')}>Open in Inventory →</Button>
                </div>
              </div>
            )
          })}
          {signals.length === 0 && <p className="py-4 text-center text-[12px] text-ink-400">No signals — inventory is comfortable.</p>}
        </div>
      </Card>
    </div>
  )
}
