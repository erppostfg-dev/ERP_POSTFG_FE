import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AlertTriangle, Boxes, Database, Maximize2, Minimize2, Pencil, PencilLine, Upload } from 'lucide-react'
import { keepPreviousData, useInfiniteQuery, useQuery } from '@tanstack/react-query'
import { Drawer, Button, PageTitle } from '../../components/ui'
import { DataGrid, Field, FilterPanel, SectionToolbar, exportRows, countActive, Cell, type FilterDef, type FilterValues } from '../../components/kit'
import { PO_LINE_COLS, type ColKind, type POLineRow } from '../../lib/ops'
import { ApiError } from '../../api/client'
import { getColumns, getFilterOptions, listLines, listShipments, type ColumnDef, type FilterOptions, type LineItem, type ListParams, type PoOverviewColumns, type ShipmentItem, type TeamColumns } from '../../api/poOverview'
import { COLUMN_GROUP_LABEL, FACILITY_SCOPE_NOTE, NOT_ASSIGNED_DATES, OVERVIEW_TAB, PO_OVERVIEW_PAGE_SIZE, SEARCH_DELAY_MS } from '../../constants/poOverview'
import { TABLE_HEIGHT } from '../../constants/ui'
import { Reveal } from '../../components/shell'
import { useLiveShipments } from '../../lib/liveShipments'
import { LiveDot } from '../../components/LiveDot'
import { ShipmentDrawer } from './ShipmentDrawer'
import { HistoryDrawer } from './ShipmentHistory'
import { NOT_AVAILABLE_YET } from '../../constants/masters'
import { PATHS, URL_PARAM } from '../../constants/pages'
import { oneOf, useUrlParam } from '../../lib/urlState'

/*
 * PO Overview from the backend (GET /po-overview/shipments, /lines, /filter-options, /columns): our POs, filtered and
 * paged on the server (200 per request, "Load more" for the next). Shipment Status: an Overview tab (every column) and
 * one tab per team with ONLY that team's columns (GET /po-overview/columns, workflow order); the person's editable teams
 * come right after Overview, marked with a pencil (no colour), each tab keeps its workflow step number. Line columns stay
 * the design's (lib/ops PO_LINE_COLS). Saving has no backend yet: buttons disabled.
 */

type LineRow = Record<keyof POLineRow, string | number | null>

const lineRow = (l: LineItem): LineRow => ({
  shipmentUid: l.shipmentUid, entryDate: l.entryDate, brand: l.brandName, channel: l.channel, location: l.location, poDate: l.poDate,
  poNumber: l.poNumber, srNo: l.srNo, skuName: l.skuName, skuCode: l.skuCode, channelSkuCode: l.channelSkuCode, quantity: l.qty, gmv: l.gmv,
  poValue: l.poValue, updatedQuantity: l.updatedQty, updatedGmv: l.updatedGmv, updatedPoValue: l.updatedPoValue, facility: l.facility,
  productWeight: l.productWeightG, workingDate: l.workingDatePlanner, dispatchDate: l.dispatchDate, currentApptDate: l.currentAppointmentDate,
  statusPlanning: l.statusPlanning, statusWarehouse: l.statusWarehouse, statusLogistics: l.statusLogistics, status: l.statusFinal,
})

/** Filter keys = the API's query names, so the panel's values go to the server as they are. */
const multi = (key: string, label: string, options: readonly string[]): FilterDef => ({ key, label, type: 'multi', options, placeholder: `Select ${label.toLowerCase()}` })
const commonFilters = (o: FilterOptions | null): FilterDef[] => {
  const opt = (k: keyof Omit<FilterOptions, 'notAssigned'>) => (o ? [...o[k], o.notAssigned] : [])
  return [
    multi('brand', 'Brand', opt('brand')), multi('channel', 'Channel', opt('channel')), multi('facility', 'Facility', opt('facility')),
    multi('location', 'Location', opt('location')), multi('statusPlanning', 'Status Planning', opt('statusPlanning')),
    multi('statusWarehouse', 'Status Warehouse', opt('statusWarehouse')), multi('statusLogistics', 'Status Logistics', opt('statusLogistics')),
    multi('statusFinal', 'Final Status', opt('statusFinal')),
  ]
}
const shipFilters = (o: FilterOptions | null): FilterDef[] => [
  multi('notAssigned', 'Not Assigned Dates', NOT_ASSIGNED_DATES),
  { key: 'poDateFrom', label: 'PO Date From', type: 'date' }, { key: 'poDateTo', label: 'PO Date To', type: 'date' },
  { key: 'workingDateFrom', label: 'Working Date From', type: 'date' }, { key: 'workingDateTo', label: 'Working Date To', type: 'date' },
  { key: 'dispatchDateFrom', label: 'Dispatch Date From', type: 'date' }, { key: 'dispatchDateTo', label: 'Dispatch Date To', type: 'date' },
  { key: 'appointmentDateFrom', label: 'Current Appt From', type: 'date' }, { key: 'appointmentDateTo', label: 'Current Appt To', type: 'date' },
  ...commonFilters(o),
  multi('transporter', 'Transporter Name', o ? [...o.transporter, o.notAssigned] : []),
  { key: 'docketNo', label: 'Search Docket No', type: 'text', placeholder: 'e.g. DL48213…' },
]
const lineFilters = (o: FilterOptions | null): FilterDef[] => [
  { key: 'poDateFrom', label: 'PO Date From', type: 'date' }, { key: 'poDateTo', label: 'PO Date To', type: 'date' },
  { key: 'workingDateFrom', label: 'Working Date From', type: 'date' }, { key: 'workingDateTo', label: 'Working Date To', type: 'date' },
  { key: 'skuCode', label: 'SKU Code', type: 'text', placeholder: 'Enter SKU code' },
  ...commonFilters(o),
]

/** Server list state: the first page loads on every search / filter change, "Load more" appends the next. */
/**
 * Server list through the data cache (TanStack Query): one cache entry per search + filters, pages appended by
 * "Load more". Coming back to a search / filter already loaded shows it at once; the old rows stay on screen while a
 * new filter loads.
 */
function useServerList<I, R>(
  key: string,
  load: (p: ListParams, s: AbortSignal) => Promise<{ data: I[]; meta: { total: number } }>,
  toRow: (i: I) => R,
) {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterValues>({})
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => { if (q.trim() !== search) setSearch(q.trim()) }, SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [q, search])

  const query = useInfiniteQuery({
    queryKey: [key, search, filters],
    queryFn: ({ pageParam, signal }) => load({ ...filters, q: search, page: pageParam, pageSize: PO_OVERVIEW_PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (all.reduce((n, pg) => n + pg.data.length, 0) < last.meta.total ? all.length + 1 : undefined),
    placeholderData: keepPreviousData,
  })
  const rows = useMemo(() => (query.data?.pages ?? []).flatMap((pg) => pg.data.map(toRow)), [query.data, toRow])
  const total = query.data?.pages.at(-1)?.meta.total ?? 0
  const err = query.error
  return {
    q, setQ, filters, setFilters, open, setOpen, rows, total, active: countActive(filters),
    state: { loading: query.isPending || query.isFetchingNextPage, error: err ? (err instanceof ApiError ? err.message : String(err)) : undefined },
    more: query.hasNextPage, loadMore: () => void query.fetchNextPage(), retry: () => void query.refetch(),
  }
}

export default function POOverview() {
  // PO Format Data / Shipment Status and the team tab are in the address (?tab=, ?team=), so a refresh keeps them
  const [tab, setTab] = useUrlParam<'shipment' | 'lines'>(PATHS.PO_OVERVIEW, URL_PARAM.TAB, oneOf(['shipment', 'lines']), 'lines')
  // Both tabs stay mounted once opened, so switching keeps each one's filters and rows.
  const [seen, setSeen] = useState<Record<string, boolean>>({ lines: true, [tab]: true })
  const [full, setFull] = useState(false)
  // Live updates for the whole page (SSE, automatic 60 s polling fallback): rows changed by others swap in place.
  const live = useLiveShipments()
  const options = useQuery({ queryKey: ['po-overview', 'filter-options'], queryFn: ({ signal }) => getFilterOptions(signal) }).data ?? null
  const columns = useQuery({ queryKey: ['po-overview', 'columns'], queryFn: ({ signal }) => getColumns(signal) }).data ?? null
  const [totals, setTotals] = useState<{ shipment?: number; lines?: number }>({})
  const shipmentTotal = useCallback((n: number) => setTotals((t) => (t.shipment === n ? t : { ...t, shipment: n })), [])
  const linesTotal = useCallback((n: number) => setTotals((t) => (t.lines === n ? t : { ...t, lines: n })), [])
  // Full screen: the page covers the whole window (sidebar and top bar hidden); Esc or the button closes it.
  useEffect(() => {
    if (!full) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setFull(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [full])
  const tableHeight = full ? TABLE_HEIGHT.FULL_SCREEN : TABLE_HEIGHT.PAGE
  return (
    <div className={full ? 'pf-fade-in fixed inset-0 z-50 space-y-4 overflow-auto bg-canvas p-5' : 'space-y-5'}>
      <PageTitle title="PO Overview" sub="Every PO at shipment level and SKU-line level · bulk edit via CSV, export anytime"
        right={<div className="flex items-center gap-3"><LiveDot mode={live.mode} /><Button icon={full ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />} onClick={() => setFull(!full)}>{full ? 'Exit full screen' : 'Full screen'}</Button></div>} />
      <div className="relative grid grid-cols-2 gap-1 rounded-[var(--radius-card)] bg-alt p-1">
        {/* The white pill slides under the picked tab (trial, 2026-10-15: user keeps or undoes it). */}
        <span aria-hidden className="pf-seg-pill absolute inset-y-1 left-1 w-[calc(50%-6px)] rounded-[var(--radius)] bg-surface shadow-sm ring-1 ring-line"
          style={{ transform: tab === 'lines' ? 'translateX(0)' : 'translateX(calc(100% + 4px))' }} />
        {/* PO Format Data first, then Shipment Status (user, 2026-10-15) */}
        {([['lines', 'PO Format Data', Boxes], ['shipment', 'Shipment Status', Database]] as const).map(([k, l, Icon]) => (
          <button
            key={k}
            onClick={() => { setTab(k); setSeen((v) => ({ ...v, [k]: true })) }}
            className={`relative z-[1] flex items-center justify-center gap-2 rounded-[var(--radius)] py-2 text-[13px] font-semibold transition-colors duration-300 ${tab === k ? 'text-ink-900' : 'text-ink-600 hover:text-ink-900'}`}
          >
            <Icon className="size-4" /> {l}
            {totals[k] !== undefined && <span className="tnum text-[11px] font-medium text-ink-400">{totals[k]}</span>}
          </button>
        ))}
      </div>
      <div hidden={tab !== 'shipment'} className="pf-slide-from-right"><ShipmentTab options={options} columns={columns} onTotal={shipmentTotal} tableHeight={tableHeight} flash={live.flash} /></div>
      {(seen.lines || tab === 'lines') && <div hidden={tab !== 'lines'} className="pf-slide-from-left"><LinesTab options={options} columns={columns} onTotal={linesTotal} tableHeight={tableHeight} /></div>}
    </div>
  )
}

function ListStatus({ s, entity }: { s: { state: { loading: boolean; error?: string }; rows: unknown[]; total: number; more: boolean; loadMore: () => void; retry: () => void }; entity: string }) {
  if (s.state.error) {
    return (
      <div className="flex items-center gap-3 rounded-[var(--radius)] border border-crit/30 bg-crit-soft px-4 py-3 text-[13px] text-crit">
        <AlertTriangle className="size-4" /> Could not load {entity}: {s.state.error}
        <button onClick={s.retry} className="ml-auto font-semibold">Retry</button>
      </div>
    )
  }
  return (
    <div className="flex items-center justify-between text-[12px] text-ink-600">
      <span>{s.state.loading ? `Loading ${entity}…` : `Showing ${s.rows.length} of ${s.total}`}</span>
      {s.more && !s.state.loading && <Button onClick={s.loadMore}>Load more</Button>}
    </div>
  )
}

const disabled = (label: string, icon: React.ReactNode) => <span title={NOT_AVAILABLE_YET}><Button disabled icon={icon}>{label}</Button></span>

type Row = Record<string, unknown>
type Col = [string, string, ColKind]
/** edit = every column of the part is editable; editFields = only these of its columns are (the fixed key part). */
type Part = { label: string; cols: ColumnDef[]; edit: boolean; editFields?: Set<string> }

const asCols = (cs: ColumnDef[]): Col[] => cs.map((c) => [c.label, c.field, c.kind])

/** The person's editable teams first, then the view-only ones; each set keeps the workflow order the API sends. */
const orderedTeams = (teams: TeamColumns[]) => [...teams.filter((t) => t.access === 'edit'), ...teams.filter((t) => t.access !== 'edit')]

/** The column groups a tab shows: Overview = all of them; a team tab = only that team's columns. */
const partsOf = (cfg: PoOverviewColumns, tab: string): Part[] => {
  const team = cfg.teams.find((t) => t.key === tab)
  const keyFields = new Set(cfg.keyColumns.map((c) => c.field))
  // Key columns a team owns (planning: PO number, channel, location) stay editable for that team in the fixed part.
  const editableKeys = (teams: TeamColumns[]) =>
    new Set(teams.filter((t) => t.access === 'edit').flatMap((t) => t.columns.map((c) => c.field)).filter((f) => keyFields.has(f)))
  if (!team) {
    return [
      { label: COLUMN_GROUP_LABEL.KEY, cols: cfg.keyColumns, edit: false, editFields: editableKeys(cfg.teams) },
      { label: COLUMN_GROUP_LABEL.SHIPMENT, cols: cfg.systemColumns, edit: false },
      ...cfg.teams.map((t) => ({ label: `${t.step}. ${t.label}`, cols: t.columns.filter((c) => !keyFields.has(c.field)), edit: t.access === 'edit' })),
    ]
  }
  // A team tab: the fixed key columns on the left, then ONLY that team's other columns (user, 2026-10-14).
  return [
    { label: COLUMN_GROUP_LABEL.KEY, cols: cfg.keyColumns, edit: false, editFields: editableKeys([team]) },
    { label: `${team.step}. ${team.label}`, cols: team.columns.filter((c) => !keyFields.has(c.field)), edit: team.access === 'edit' },
  ]
}

/** Option c: a facility-limited person's list opens filtered to their facilities, once; they can clear the filter. */
function useFacilityPreset(columns: PoOverviewColumns | null, s: { filters: FilterValues; setFilters: (f: FilterValues) => void }) {
  const done = useRef(false)
  useEffect(() => {
    if (done.current || !columns) return
    done.current = true
    if (columns.facilityScoped && columns.facilities.length) s.setFilters({ ...s.filters, facility: columns.facilities })
  }, [columns, s])
}

/** What the facility-limited person is looking at: only their facilities, or more (with a way back). */
/** editHere = this tab shows columns the person can edit (their team tab, or Overview while it shades them). */
function FacilityNote({ mine, filters, setFilters, editHere }: { mine: string[]; filters: FilterValues; setFilters: (f: FilterValues) => void; editHere: boolean }) {
  if (!mine.length) return <p className="text-[12px] text-ink-600">{FACILITY_SCOPE_NOTE.NONE}</p>
  const picked = Array.isArray(filters.facility) ? filters.facility : []
  const onlyMine = picked.length > 0 && picked.every((f) => mine.includes(f))
  if (onlyMine) return <p className="text-[12px] text-ink-600">{editHere ? FACILITY_SCOPE_NOTE.MINE(mine) : FACILITY_SCOPE_NOTE.VIEW_MINE(mine)}</p>
  return (
    <p className="text-[12px] text-ink-600">
      {editHere ? FACILITY_SCOPE_NOTE.OTHERS(mine) : FACILITY_SCOPE_NOTE.VIEW_OTHERS}{' '}
      <button onClick={() => setFilters({ ...filters, facility: mine })} className="font-semibold text-primary hover:underline">{FACILITY_SCOPE_NOTE.SHOW_MINE}</button>
    </p>
  )
}


/** Most width (px) of the fixed key columns: PO Number, Channel, Location, Final Status (stickyFit narrows them to their values). */
const KEY_FIXED_WIDTHS = [150, 116, 160, 140]

function TeamTabs({ teams, value, onChange }: { teams: TeamColumns[]; value: string; onChange: (k: string) => void }) {
  const tab = (key: string, label: string, step?: number, edit?: boolean) => {
    const on = value === key
    // One look for every tab (no colour, user 2026-10-14); the pencil marks the teams the person can edit.
    const look = on ? 'border-ink-400 bg-alt text-ink-900 shadow-sm' : 'border-line bg-surface text-ink-600 hover:text-ink-900'
    return (
      <button key={key} onClick={() => onChange(key)} className={`relative flex shrink-0 items-center gap-1.5 rounded-[var(--radius)] border px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${look}`}>
        {step !== undefined && (
          <span className="absolute -left-1.5 -top-1.5 grid size-4 place-items-center rounded-full bg-ink-400 text-[10px] font-bold text-white">{step}</span>
        )}
        {label}
        {edit && <Pencil className="size-3" />}
      </button>
    )
  }
  return (
    <div className="flex gap-2.5 overflow-x-auto pb-1 pl-1.5 pt-2">
      {tab(OVERVIEW_TAB.KEY, OVERVIEW_TAB.LABEL)}
      {teams.map((t) => tab(t.key, t.label, t.step, t.access === 'edit'))}
    </div>
  )
}

const shipmentToRow = (i: ShipmentItem): Row => i

function ShipmentTab({ options, columns, onTotal, tableHeight, flash }: { options: FilterOptions | null; columns: PoOverviewColumns | null; onTotal: (n: number) => void; tableHeight: string; flash: Record<string, number> }) {
  const s = useServerList('po-overview-shipments', listShipments, shipmentToRow)
  const [sel, setSel] = useState<Row | null>(null)
  const [historyOf, setHistoryOf] = useState<Row | null>(null)
  const teams = useMemo(() => (columns ? orderedTeams(columns.teams) : []), [columns])
  // a team from the address counts once the person's teams are loaded (an unknown one shows Overview)
  const [tab, setTab] = useUrlParam<string>(PATHS.PO_OVERVIEW, URL_PARAM.TEAM, (v) => !columns || v === OVERVIEW_TAB.KEY || teams.some((t) => t.key === v), OVERVIEW_TAB.KEY)
  const defs = useMemo(() => shipFilters(options), [options])
  const parts = useMemo(() => (columns ? partsOf(columns, tab) : []), [columns, tab])
  const cols = useMemo(() => parts.flatMap((p) => asCols(p.cols)), [parts])
  const groups = useMemo(() => parts.filter((p) => p.cols.length).map((p) => ({ label: p.label, span: p.cols.length, edit: p.edit })), [parts])
  const editable = useMemo(() => new Set(parts.flatMap((p) => p.cols.map((c) => c.field).filter((f) => p.edit || p.editFields?.has(f)))), [parts])
  const fixedCols = columns?.keyColumns.length ?? 1
  // The row drawer follows the tab: a team tab shows only that team's columns, Overview shows every group.
  const drawerParts = parts
  // History names every field it logs, whatever the tab: labels from all the column groups.
  const labels = useMemo(() => new Map((columns ? [...columns.keyColumns, ...columns.systemColumns, ...columns.teams.flatMap((t) => t.columns)] : []).map((c) => [c.field, c.label])), [columns])
  const fieldLabel = useCallback((f: string) => labels.get(f) ?? f, [labels])
  useEffect(() => { if (!s.state.loading && !s.state.error) onTotal(s.total) }, [s.total, s.state, onTotal])
  useFacilityPreset(columns, s)
  return (
    <div className="space-y-3">
      <SectionToolbar
        q={s.q} setQ={s.setQ} placeholder="Search by PO Number or UID…" filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)} activeFilters={s.active}
        entity="Shipment Status" onExport={(e) => exportRows(`shipment_status_${tab}`, e, cols, s.rows)}
        primary={disabled('Bulk Edit', <PencilLine className="size-4" />)}
      />
      <Reveal open={s.open}><FilterPanel defs={defs} value={s.filters} onApply={(f) => { s.setFilters(f); s.setOpen(false) }} onClose={() => s.setOpen(false)} /></Reveal>
      {columns && <TeamTabs teams={teams} value={tab} onChange={setTab} />}
      {columns?.facilityScoped && <FacilityNote mine={columns.facilities} filters={s.filters} setFilters={s.setFilters} editHere={editable.size > 0} />}
      <ListStatus s={s} entity="shipments" />
      {/* key = the team tab: the grid fades in with the new columns on every team switch */}
      <div key={tab} className="pf-tab-in">
      <DataGrid
        cols={cols} rows={s.rows} rowKey={(r) => String(r.uid)} sticky={fixedCols} stickyWidths={KEY_FIXED_WIDTHS} stickyFit onRowClick={setSel} groups={groups} editable={editable} rowEditable={(r) => r.canEdit === true} onRowHistory={setHistoryOf} rowClass={(r) => (flash[String(r.uid)] ? 'pf-row-flash' : '')} maxHeight={tableHeight} pageSize={50}
        rowMenu={(r) => [{ label: 'View details', onClick: () => setSel(r) }, { label: 'History', onClick: () => setHistoryOf(r) }]}
      />
      </div>
      {historyOf && <HistoryDrawer row={s.rows.find((r) => r.uid === historyOf.uid) ?? historyOf} labelOf={fieldLabel} onClose={() => setHistoryOf(null)} onOpenRow={() => { setSel(historyOf); setHistoryOf(null) }} />}
      {/* The drawer shows the row as it is NOW (live updates swap the cached row; the drawer follows it). */}
      {sel && <ShipmentDrawer row={s.rows.find((r) => r.uid === sel.uid) ?? sel} parts={drawerParts} fieldLabel={fieldLabel} onClose={() => setSel(null)} />}
    </div>
  )
}

/** PO Format Data: the columns up to and including PO Number stay fixed; the rest scroll (user, 2026-10-14). */
const LINE_FIXED_COLS = PO_LINE_COLS.findIndex(([, key]) => key === 'poNumber') + 1
/** Most width (px) of those fixed columns (stickyFit narrows them to their values): UID, Entry Date, Brand, Channel, Location, PO Date, PO Number. */
const LINE_FIXED_WIDTHS = [96, 104, 100, 110, 150, 104, 150]

function LinesTab({ options, columns, onTotal, tableHeight }: { options: FilterOptions | null; columns: PoOverviewColumns | null; onTotal: (n: number) => void; tableHeight: string }) {
  const s = useServerList('po-overview-lines', listLines, lineRow)
  useFacilityPreset(columns, s)
  const [sel, setSel] = useState<LineRow | null>(null)
  const defs = useMemo(() => lineFilters(options), [options])
  useEffect(() => { if (!s.state.loading && !s.state.error) onTotal(s.total) }, [s.total, s.state, onTotal])
  return (
    <div className="space-y-3">
      <SectionToolbar
        q={s.q} setQ={s.setQ} placeholder="Search by PO Number or Shipment UID…" filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)} activeFilters={s.active}
        entity="PO Format Data" onExport={(e) => exportRows('po_format_data', e, PO_LINE_COLS, s.rows)}
        primary={disabled('Bulk SKU Update', <Upload className="size-4" />)}
      />
      <Reveal open={s.open}><FilterPanel defs={defs} value={s.filters} onApply={(f) => { s.setFilters(f); s.setOpen(false) }} onClose={() => s.setOpen(false)} /></Reveal>
      <ListStatus s={s} entity="PO lines" />
      <DataGrid
        cols={PO_LINE_COLS} rows={s.rows} rowKey={(r) => `${r.shipmentUid}-${r.srNo}`} sticky={LINE_FIXED_COLS} stickyWidths={LINE_FIXED_WIDTHS} stickyFit maxHeight={tableHeight} pageSize={50} onRowClick={setSel}
        trailing={[{ label: 'Status', render: (r) => <Cell kind="status" v={r.status} /> }]}
        rowMenu={(r) => [{ label: 'View details', onClick: () => setSel(r) }]}
      />
      {sel && (
        <Drawer open onClose={() => setSel(null)} title={sel.skuName} sub={<><span className="font-mono">{sel.skuCode}</span> · PO <span className="font-mono">{sel.poNumber}</span> · line {sel.srNo}</>}
          footer={(close) => <><Button onClick={close}>Close</Button>{disabled('Update quantity', null)}</>}>
          <div className="divide-y divide-line">
            {PO_LINE_COLS.map(([l, k, kind]) => <Field key={l} label={l}><Cell kind={kind} v={sel[k]} /></Field>)}
          </div>
        </Drawer>
      )}
    </div>
  )
}
