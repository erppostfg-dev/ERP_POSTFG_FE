import { Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Card, KPI, PageTitle, SectionHeader } from '../../components/ui'
import { DRR_ROWS, channelInventory } from '../../lib/ops'

export default function DPAnalytics() {
  const ch = channelInventory()
  const soh = ch.reduce((a, c) => a + c.soh, 0)
  const crit = DRR_ROWS.filter((r) => r.aging < 45).length
  const avgAging = Math.round(DRR_ROWS.reduce((a, r) => a + r.aging, 0) / DRR_ROWS.length)
  const spikes = DRR_ROWS.filter((r) => Math.abs(r.deviation) >= 15).length
  const tick = { fontSize: 12, fill: 'var(--color-ink-600)' }
  return (
    <div className="space-y-5">
      <PageTitle title="Demand Planning Analytics" sub="Cover, run-rate swings and where inventory sits" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KPI label="Total SOH" value={soh.toLocaleString('en-IN')} unit="units" tone="info" />
        <KPI label="Avg aging" value={String(avgAging)} unit="days" tone={avgAging < 45 ? 'warn' : 'ok'} />
        <KPI label="Critical SKUs" value={String(crit)} hint="aging < 45d" tone="crit" />
        <KPI label="DRR swings" value={String(spikes)} hint="|Δ3d vs 30d| ≥ 15%" tone="warn" />
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        <Card className="p-5">
          <SectionHeader title="Aging by SKU" sub="Days of cover on DRR 7d · red under 45" />
          <div className="mt-4 h-72"><ResponsiveContainer>
            <BarChart data={[...DRR_ROWS].sort((a, b) => a.aging - b.aging)} layout="vertical" margin={{ left: 40 }}>
              <CartesianGrid stroke="var(--color-alt)" horizontal={false} />
              <XAxis type="number" tick={tick} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="sku" tick={{ ...tick, fontFamily: 'JetBrains Mono' }} width={110} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="aging" radius={[0, 4, 4, 0]} barSize={14}>
                {[...DRR_ROWS].sort((a, b) => a.aging - b.aging).map((r) => <Cell key={r.sku} fill={r.aging < 45 ? '#dc2626' : '#4f46e5'} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
        <Card className="p-5">
          <SectionHeader title="SOH by channel" sub="On-hand vs in-transit" />
          <div className="mt-4 h-72"><ResponsiveContainer>
            <BarChart data={ch}>
              <CartesianGrid stroke="var(--color-alt)" vertical={false} />
              <XAxis dataKey="channel" tick={tick} axisLine={false} tickLine={false} />
              <YAxis tick={tick} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ borderRadius: 8, fontSize: 12 }} />
              <Bar dataKey="soh" stackId="a" fill="#4f46e5" name="SOH" />
              <Bar dataKey="inTransit" stackId="a" fill="#c7d2fe" name="In-transit" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer></div>
        </Card>
      </div>
    </div>
  )
}
