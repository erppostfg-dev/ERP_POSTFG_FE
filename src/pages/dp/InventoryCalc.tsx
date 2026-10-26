import { Fragment, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useNavigate } from 'react-router'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { Badge, Button, Card, downloadCsv, PageTitle, SubTabs, Td, Th, Toolbar, type Density } from '../../components/ui'
import { DataGrid, FilterPanel, SectionToolbar, applyFilters, countActive, exportRows, useSection, type FilterDef, type FilterValues } from '../../components/kit'
import { Reveal } from '../../components/shell'
import { FACILITY_COLUMNS, INTRANSIT_TEXT, REPORT_TABLES } from '../../constants/intransit'
import { PATHS } from '../../constants/pages'
import type { InventoryLine } from '../../lib/sheet35'
import { istDateTime } from '../../lib/time'
import type { ColKind } from '../../lib/ops'
import { CsvTable } from './CsvViewer'
import { useInventorySnapshot } from './useInventorySnapshot'

/*
 * Inventory Calculation (2026-10-15, user): the design's five lenses on the latest in-transit report.
 * Since 2026-10-26 (user) its data is the Daily Snapshot in S3: Sheet35(2) of the newest day's final build, cached in
 * this browser and worked out here (useInventorySnapshot): component level, Consider? = No hidden, SKUs not in the
 * Sheet35 master tagged. When today has no final build a banner says so and the last successful build is shown.
 * Available = SOH + in-transit. DRR, days of cover, aging and Δ WoW need sales-rate data the report does not have yet:
 * they show "—" until a DRR source is added.
 * Then the same report's own tables (REPORT_TABLES: Sheet35(2), Full_Shipment_Enhanced, Final Sheet35(2); moved here
 * from In-transit Stock, user 2026-10-21), read page by page.
 */

type ReportTable = (typeof REPORT_TABLES)[number]
type View = 'overview' | 'channel' | 'sku' | 'skuFacility' | 'type' | ReportTable
const isReportTable = (v: View): v is ReportTable => (REPORT_TABLES as readonly string[]).includes(v)
type Line = InventoryLine & { drr: '' }

const num = (n: number) => n.toLocaleString('en-IN')
const NA = <span className="text-ink-400">—</span>
const OVERVIEW_PAGE = 25

export default function InventoryCalc() {
  const [view, setView] = useState<View>('overview')
  const navigate = useNavigate()
  const { manifest, rows: inv } = useInventorySnapshot()
  const lines = useMemo<Line[]>(() => (inv.data?.lines ?? []).map((l) => ({ ...l, drr: '' })), [inv.data])
  const shown = manifest.data?.shown ?? null
  const toUploads = () => navigate(PATHS.INTRANSIT_STOCK)
  const failed = manifest.isError ? manifest.error : inv.isError ? inv.error : null
  const retry = () => void (manifest.isError ? manifest.refetch() : inv.refetch())

  let body: ReactNode
  if (failed) {
    body = (
      <div className="flex items-center justify-between rounded-[var(--radius)] border border-crit/30 bg-crit-soft px-4 py-3 text-[13px] text-crit">
        <span>{failed.message}</span>
        <Button onClick={retry}>Retry</Button>
      </div>
    )
  } else if (manifest.isPending || (shown && inv.isPending)) {
    body = <div className="rounded-[var(--radius)] border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-600">Loading…</div>
  } else if (!shown) {
    body = (
      <div className="flex flex-col items-center gap-3 rounded-[var(--radius)] border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-600">
        {INTRANSIT_TEXT.NO_REPORT}
        <Button variant="primary" onClick={toUploads}>Open In-transit Stock</Button>
      </div>
    )
  } else {
    body = (
      <>
        {view === 'overview' && <Overview lines={lines} onUpload={toUploads} />}
        {view === 'channel' && <ChannelView lines={lines} onUpload={toUploads} />}
        {view === 'sku' && <SkuView lines={lines} onUpload={toUploads} />}
        {view === 'skuFacility' && <SkuFacility lines={lines} onUpload={toUploads} />}
        {view === 'type' && <TypeView lines={lines} onUpload={toUploads} />}
        {isReportTable(view) && (
          <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
            <CsvTable key={`${shown.runId}|${view}`} target={{ kind: 'sheet', runId: shown.runId, name: view }} showName={false}
              subtitle={`${view}, in-transit report #${shown.runId} as of ${shown.day}`} maxHeight="65vh" />
          </div>
        )}
      </>
    )
  }

  return (
    <div className="space-y-5">
      <PageTitle
        title="Inventory Calculation"
        sub="Available = SOH + in-transit · aging = available ÷ DRR · switch lenses without leaving the module"
        right={shown ? (
          <button onClick={toUploads} title="Open In-transit Stock" className="text-right text-[12px] text-ink-600 hover:text-primary">
            <Badge tone="info">In-transit report #{shown.runId}</Badge>
            <div className="mt-1">as of {shown.day} · built {istDateTime(shown.builtAt)}</div>
          </button>
        ) : undefined}
      />
      {shown && manifest.data?.latestMissing && (
        <div className="rounded-[var(--radius)] border border-warn/30 bg-warn-soft px-4 py-2.5 text-[13px] text-warn">
          {INTRANSIT_TEXT.LATEST_MISSING(manifest.data.requested, shown.day, shown.runId)}
        </div>
      )}
      {manifest.data?.offline && (
        <div className="rounded-[var(--radius)] border border-warn/30 bg-warn-soft px-4 py-2.5 text-[13px] text-warn">{INTRANSIT_TEXT.OFFLINE}</div>
      )}
      <SubTabs value={view} onChange={setView} tabs={[
        { key: 'overview', label: 'Overview' }, { key: 'channel', label: 'Channel-wise' }, { key: 'sku', label: 'SKU-wise' },
        { key: 'skuFacility', label: 'SKU × Facility' }, { key: 'type', label: 'B2C vs D2C' },
        ...REPORT_TABLES.map((t) => ({ key: t, label: t })),
      ]} />
      {shown && !isReportTable(view) && (
        <p className="text-[12px] text-ink-400">
          {INTRANSIT_TEXT.NO_DRR}{inv.data?.hidden ? ` ${INTRANSIT_TEXT.HIDDEN_ROWS(inv.data.hidden)}` : ''}
        </p>
      )}
      {body}
    </div>
  )
}

/** "1–25 of 4,210 records" with previous / next, as the data grids show it. */
function Pager({ page, pages, total, size, setPage }: { page: number; pages: number; total: number; size: number; setPage: (p: number) => void }) {
  return (
    <div className="flex items-center justify-between border-t border-line px-4 py-3 text-[12.5px] text-ink-600">
      <span>{total ? `${num(page * size + 1)}–${num(Math.min(total, (page + 1) * size))} of ${num(total)} records` : '0 records'}</span>
      <div className="flex items-center gap-2">
        <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded p-1 disabled:opacity-40"><ChevronLeft className="size-4" /></button>
        <span className="rounded-md border border-line px-2.5 py-1 text-ink-900">{page + 1}</span>
        <span className="text-ink-400">of {num(pages)}</span>
        <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="inline-flex items-center gap-1 rounded px-1 disabled:opacity-40">Next <ChevronRight className="size-4" /></button>
      </div>
    </div>
  )
}

/** The Overview table's columns, in order; the Columns menu shows / hides them (SKU Code always stays). */
const OVERVIEW_COLS: { label: string; right?: boolean; cell: (r: Line) => ReactNode }[] = [
  { label: 'SKU Code', cell: (r) => <Td mono className="text-[12px] font-medium text-primary">{r.sku}</Td> },
  {
    label: 'SKU Name',
    cell: (r) => (
      <Td>
        <span className="flex max-w-[360px] items-center gap-1.5">
          <span className="truncate text-[13px]" title={r.name}>{r.name || '—'}</span>
          {r.notInMaster && <Badge tone="warn">{INTRANSIT_TEXT.NOT_IN_MASTER}</Badge>}
        </span>
      </Td>
    ),
  },
  { label: 'Channel', cell: (r) => <Td>{r.channel} <span className="text-[10px] text-ink-400">{r.type}</span></Td> },
  { label: 'Location', cell: (r) => <Td><span className="text-[12px] text-ink-600">{r.location}</span></Td> },
  { label: 'SOH', right: true, cell: (r) => <Td right mono>{num(r.soh)}</Td> },
  { label: 'In-transit', right: true, cell: (r) => <Td right mono className="text-info">{r.inTransit ? num(r.inTransit) : '—'}</Td> },
  { label: 'Available', right: true, cell: (r) => <Td right mono className="font-semibold">{num(r.available)}</Td> },
  { label: 'DRR', right: true, cell: () => <Td right>{NA}</Td> },
  { label: 'Days of cover', right: true, cell: () => <Td right>{NA}</Td> },
  { label: 'Δ WoW', right: true, cell: () => <Td right>{NA}</Td> },
]
const OVERVIEW_LOCKED: ReadonlySet<string> = new Set(['SKU Code'])

function Overview({ lines, onUpload }: { lines: Line[]; onUpload: () => void }) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  const [filtersOpen, setFiltersOpen] = useState(false)
  const [filters, setFilters] = useState<FilterValues>({})
  const [hidden, setHidden] = useState<ReadonlySet<string>>(new Set())
  const [density, setDensity] = useState<Density>('comfortable')
  const defs: FilterDef[] = useMemo(() => [
    { key: 'channel', label: 'Channel', type: 'multi', options: uniq(lines.map((l) => l.channel)) },
    { key: 'type', label: 'Type', type: 'multi', options: uniq(lines.map((l) => l.type)) },
    { key: 'location', label: 'Location', type: 'multi', options: uniq(lines.map((l) => l.location)) },
  ], [lines])
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    const searched = s ? lines.filter((r) => r.sku.toLowerCase().includes(s) || r.name.toLowerCase().includes(s)) : lines
    return applyFilters(searched, filters)
  }, [lines, q, filters])
  const cols = OVERVIEW_COLS.filter((c) => !hidden.has(c.label))
  const toggleCol = (label: string) => setHidden((h) => { const n = new Set(h); if (n.has(label)) n.delete(label); else n.add(label); return n })
  const pages = Math.max(1, Math.ceil(rows.length / OVERVIEW_PAGE))
  const view = rows.slice(page * OVERVIEW_PAGE, (page + 1) * OVERVIEW_PAGE)
  return (
    <div className="space-y-3">
      <Card>
        <div className="flex items-center justify-between border-b border-line px-3 py-2">
          <input value={q} onChange={(e) => { setQ(e.target.value); setPage(0) }} placeholder="Filter by SKU or name…" className="w-64 rounded-md border border-line bg-canvas px-2.5 py-1.5 text-xs outline-none focus:border-primary" />
        </div>
        <Toolbar
          total={rows.length}
          onBulk={onUpload}
          columns={{ all: OVERVIEW_COLS.map((c) => c.label), hidden, locked: OVERVIEW_LOCKED, onToggle: toggleCol }}
          filtersOpen={filtersOpen} activeFilters={countActive(filters)} onToggleFilters={() => setFiltersOpen((o) => !o)}
          density={density} onDensity={setDensity}
          onExport={() => downloadCsv('inventory_channel.csv', ['SKU Code', 'SKU Name', 'Channel', 'Type', 'Location', 'SOH', 'In-transit', 'Available'], rows.map((r) => [r.sku, r.name, r.channel, r.type, r.location, r.soh, r.inTransit, r.available]))}
        />
        {filtersOpen && (
          <div className="border-b border-line p-3">
            <FilterPanel defs={defs} value={filters} onApply={(f) => { setFilters(f); setPage(0) }} onClose={() => setFiltersOpen(false)} />
          </div>
        )}
        <div className="overflow-x-auto">
          {/* Compact: tighter rows (the descendant rule outranks Td's own padding). */}
          <table className={`w-full border-collapse ${density === 'compact' ? '[&_td]:py-1' : ''}`}>
            <thead className="border-b border-line bg-alt/60">
              <tr>{cols.map((c) => <Th key={c.label} right={c.right}>{c.label}</Th>)}</tr>
            </thead>
            <tbody className="divide-y divide-line">
              {view.length === 0 && <tr><td colSpan={cols.length} className="px-4 py-14 text-center text-[13px] text-ink-400">No records match the current search & filters.</td></tr>}
              {view.map((r) => (
                <tr key={r.key} className="hover:bg-alt/40">
                  {cols.map((c) => <Fragment key={c.label}>{c.cell(r)}</Fragment>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} total={rows.length} size={OVERVIEW_PAGE} setPage={setPage} />
      </Card>
    </div>
  )
}

const aging = [{ label: 'Aging', render: () => NA }]
const uniq = (v: string[]) => [...new Set(v.filter(Boolean))].sort()

type ChRow = { channel: string; skus: number; soh: number; inTransit: number; drr: '' }
function ChannelView({ lines, onUpload }: { lines: Line[]; onUpload: () => void }) {
  const rows = useMemo(() => {
    const by = new Map<string, ChRow & { set: Set<string> }>()
    for (const l of lines) {
      const r = by.get(l.channel) ?? { channel: l.channel, skus: 0, soh: 0, inTransit: 0, drr: '' as const, set: new Set<string>() }
      r.set.add(l.sku); r.soh += l.soh; r.inTransit += l.inTransit
      by.set(l.channel, r)
    }
    return [...by.values()].map(({ set, ...r }) => ({ ...r, skus: set.size })).sort((a, b) => b.soh + b.inTransit - (a.soh + a.inTransit))
  }, [lines])
  const s = useSection<ChRow>(rows, ['channel'])
  const cols: [string, keyof ChRow, ColKind][] = [['Channel', 'channel', 'text'], ['SKUs', 'skus', 'num'], ['SOH', 'soh', 'num'], ['In-transit', 'inTransit', 'num'], ['DRR', 'drr', 'num']]
  return (
    <div className="space-y-3">
      <SectionToolbar q={s.q} setQ={s.setQ} placeholder="Search channel…" filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)} activeFilters={s.active} entity="Channel inventory" onUpload={onUpload} onExport={(e) => exportRows('inventory_channel', e, cols, s.filtered)} />
      <Reveal open={s.open}><FilterPanel defs={[{ key: 'channel', label: 'Channel', type: 'multi', options: rows.map((r) => r.channel) }]} value={s.filters} onApply={s.setFilters} onClose={() => s.setOpen(false)} /></Reveal>
      <DataGrid cols={cols} rows={s.filtered} rowKey={(r) => r.channel} trailing={aging} />
    </div>
  )
}

type SkuRow = { sku: string; name: string; soh: number; inTransit: number; available: number; drr: ''; drrDelta: '' }
function SkuView({ lines, onUpload }: { lines: Line[]; onUpload: () => void }) {
  const rows = useMemo(() => {
    const by = new Map<string, SkuRow>()
    for (const l of lines) {
      const r = by.get(l.sku) ?? { sku: l.sku, name: l.name, soh: 0, inTransit: 0, available: 0, drr: '' as const, drrDelta: '' as const }
      if (!r.name) r.name = l.name
      r.soh += l.soh; r.inTransit += l.inTransit; r.available += l.available
      by.set(l.sku, r)
    }
    return [...by.values()].sort((a, b) => b.available - a.available)
  }, [lines])
  const s = useSection<SkuRow>(rows, ['sku', 'name'])
  const cols: [string, keyof SkuRow, ColKind][] = [['SKU', 'sku', 'mono'], ['Name', 'name', 'text'], ['SOH', 'soh', 'num'], ['In-transit', 'inTransit', 'num'], ['Available', 'available', 'num'], ['DRR', 'drr', 'num'], ['Δ WoW %', 'drrDelta', 'num']]
  const defs: FilterDef[] = [{ key: 'sku', label: 'SKU Code', type: 'text', placeholder: 'Enter SKU code' }]
  return (
    <div className="space-y-3">
      <SectionToolbar q={s.q} setQ={s.setQ} placeholder="Search SKU code or name…" filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)} activeFilters={s.active} entity="SKU inventory" onUpload={onUpload} onExport={(e) => exportRows('inventory_sku', e, cols, s.filtered)} />
      <Reveal open={s.open}><FilterPanel defs={defs} value={s.filters} onApply={s.setFilters} onClose={() => s.setOpen(false)} /></Reveal>
      <DataGrid cols={cols} rows={s.filtered} rowKey={(r) => r.sku} trailing={aging} />
    </div>
  )
}

const FACILITY_PAGE = 25

function SkuFacility({ lines, onUpload }: { lines: Line[]; onUpload: () => void }) {
  const [q, setQ] = useState('')
  const [page, setPage] = useState(0)
  // Columns: the report's channel types in the design's order, then any other type it has.
  const facilities = useMemo(() => {
    const known = FACILITY_COLUMNS.map((f) => f.type)
    const extra = uniq(lines.map((l) => l.type)).filter((t) => !known.includes(t))
    return [...FACILITY_COLUMNS, ...extra.map((t) => ({ type: t, label: t }))]
  }, [lines])
  const skus = useMemo(() => {
    const by = new Map<string, { sku: string; name: string; cells: Record<string, number>; total: number }>()
    for (const l of lines) {
      const r = by.get(l.sku) ?? { sku: l.sku, name: l.name, cells: {}, total: 0 }
      if (!r.name) r.name = l.name
      r.cells[l.type] = (r.cells[l.type] ?? 0) + l.available
      r.total += l.available
      by.set(l.sku, r)
    }
    return [...by.values()].sort((a, b) => b.total - a.total)
  }, [lines])
  const rows = useMemo(() => {
    const s = q.trim().toLowerCase()
    return s ? skus.filter((r) => (r.sku + r.name).toLowerCase().includes(s)) : skus
  }, [skus, q])
  const max = useMemo(() => Math.max(1, ...skus.flatMap((r) => Object.values(r.cells))), [skus])
  const pages = Math.max(1, Math.ceil(rows.length / FACILITY_PAGE))
  const view = rows.slice(page * FACILITY_PAGE, (page + 1) * FACILITY_PAGE)
  const exportPivot = () => downloadCsv('inventory_sku_facility.csv', ['SKU', 'Name', ...facilities.map((f) => f.label), 'Total'], rows.map((r) => [r.sku, r.name, ...facilities.map((f) => r.cells[f.type] ?? 0), r.total]))
  return (
    <div className="space-y-3">
      <SectionToolbar q={q} setQ={(v) => { setQ(v); setPage(0) }} placeholder="Search SKU…" entity="SKU × Facility" onUpload={onUpload} onExport={exportPivot} />
      <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead><tr className="bg-alt">
              <th className="px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600">SKU</th>
              {facilities.map((f) => <th key={f.type} className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-ink-600">{f.label}</th>)}
              <th className="px-3 py-2.5 text-right text-[11px] font-semibold uppercase tracking-wide text-ink-600">Total</th>
            </tr></thead>
            <tbody>
              {view.map((r) => (
                <tr key={r.sku} className="border-t border-line">
                  <td className="px-3 py-2.5"><div className="font-mono text-[12.5px]">{r.sku}</div><div className="max-w-[320px] truncate text-[12px] text-ink-400">{r.name}</div></td>
                  {facilities.map((f) => {
                    const v = r.cells[f.type] ?? 0
                    return (
                      <td key={f.type} className="px-3 py-2.5 text-right">
                        {v ? <span className="tnum inline-block min-w-16 rounded px-2 py-1" style={{ background: `rgba(79,70,229,${0.06 + (Math.max(0, v) / max) * 0.4})` }}>{num(v)}</span> : <span className="text-ink-400">—</span>}
                      </td>
                    )
                  })}
                  <td className="tnum px-3 py-2.5 text-right font-semibold">{num(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <Pager page={page} pages={pages} total={rows.length} size={FACILITY_PAGE} setPage={setPage} />
      </div>
    </div>
  )
}

function TypeView({ lines, onUpload }: { lines: Line[]; onUpload: () => void }) {
  const s = useSection<Line>(lines, ['sku', 'name', 'channel'])
  const cols: [string, keyof Line, ColKind][] = [['Type', 'type', 'status'], ['SKU', 'sku', 'mono'], ['Name', 'name', 'text'], ['Channel', 'channel', 'text'], ['Location', 'location', 'text'], ['SOH', 'soh', 'num'], ['In-transit', 'inTransit', 'num'], ['DRR', 'drr', 'num']]
  const defs: FilterDef[] = useMemo(() => [
    { key: 'type', label: 'Type', type: 'multi', options: uniq(lines.map((l) => l.type)) },
    { key: 'channel', label: 'Channel', type: 'multi', options: uniq(lines.map((l) => l.channel)) },
  ], [lines])
  return (
    <div className="space-y-3">
      <SectionToolbar q={s.q} setQ={s.setQ} placeholder="Search SKU, channel…" filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)} activeFilters={s.active} entity="Inventory by type" onUpload={onUpload} onExport={(e) => exportRows('inventory_type', e, cols, s.filtered)} />
      <Reveal open={s.open}><FilterPanel defs={defs} value={s.filters} onApply={s.setFilters} onClose={() => s.setOpen(false)} /></Reveal>
      <DataGrid cols={cols} rows={s.filtered} rowKey={(r) => r.key} trailing={aging} />
    </div>
  )
}
