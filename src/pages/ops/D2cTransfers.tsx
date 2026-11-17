import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Filter, FlaskConical, PackagePlus, Plus, PlugZap, Search, Send, Upload } from 'lucide-react'
import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, PageTitle, SubTabs, downloadCsv } from '../../components/ui'
import { DownloadMenu, FilterChips, FilterPanel, countActive, type FilterDef, type FilterValues } from '../../components/kit'
import { Reveal } from '../../components/shell'
import { LiveDot } from '../../components/LiveDot'
import {
  exportCsv, getCounts, getOptions, getTransfer, listInvoices, listTransfers, type D2cDetail, type D2cInvoiceRow, type D2cListItem, type D2cOptions, type D2cParams,
} from '../../api/d2cTransfers'
import { useAuth } from '../../auth/AuthContext'
import { ACCESS } from '../../constants/auth'
import { PATHS, URL_PARAM } from '../../constants/pages'
import { SEARCH_DELAY_MS } from '../../constants/poOverview'
import { TABLE_HEIGHT } from '../../constants/ui'
import {
  D2C_EXPIRED_OPTION, D2C_EXPORT_LEVEL, D2C_EXPORT_NUMBERS, D2C_FILTER, D2C_INWARD_MAX_IDS, D2C_PAGE_SIZE, D2C_PRIORITIES, D2C_SO_MAX_IDS, D2C_SO_STATE, D2C_SOURCE_LABEL, D2C_STAGE,
  D2C_STAGE_LABEL, D2C_TAB, D2C_TABS, D2C_TEXT, D2C_UNDISPATCHED, type D2cTab,
} from '../../constants/d2cTransfers'
import { downloadExcel } from '../../lib/excelExport'
import { D2C_KEY, useLiveTransfers } from '../../lib/liveTransfers'
import { oneOf, useUrlParam } from '../../lib/urlState'
import { parseTable } from '../../lib/csvTableCore'
import { TransferTable, type RowAction, type Selection } from './d2c/TransferTable'
import { TransferDrawer } from './d2c/TransferDrawer'
import { TransferFormDrawer } from './d2c/TransferFormDrawer'
import { UploadDialog } from './d2c/UploadDialog'
import { CancelDialog, CloseShortDialog, ExpiryDialog, type DialogTarget } from './d2c/Dialogs'
import { CreateSoDialog, type SoTarget } from './d2c/CreateSoDialog'
import { SyncStatus } from './d2c/SyncStatus'
import { InvoiceTable, type InvoiceSelection } from './d2c/InvoiceTable'
import { InwardPoDialog } from './d2c/InwardPoDialog'
import { VarianceDialog, type VarianceTarget } from './d2c/VarianceDialog'
import { errorOf, todayIst } from './d2c/format'

/*
 * D2C Internal Transfers (2026-11-03, phase 3 of plan d2c-internal-transfers; PRD "UI: sub-tabs and screens"):
 * sub-tabs Draft | Sale orders | Create inward PO | Inward POs | Overview with counts (GET /counts, same search +
 * filters), one list per tab from the server (100 per request, sorted by priority then oldest PO date; "Load more"),
 * search, filters, CSV / Excel at PO level or PO + SKU level (GET /export, the whole filtered list), row expand with the
 * SKU lines, the detail drawer, Upload CSV and New transfer (editors). Phase 5: drafts are sent to Uniware ("Create SO
 * in Uniware": row action, or tick drafts on the Draft tab for a bulk send), a sale order is cancelled (before any
 * dispatch) or closed short from the row menu / drawer. Until D2C goes live only the test warehouses reach Uniware
 * (the header says so). Live: SSE (lib/liveTransfers.ts) reloads the lists on every change. Phase 6: the header shows
 * "Uniware · synced N min ago" (the server's status sync; d2c/SyncStatus.tsx) and editors have Sync now. Phase 7: the
 * Create inward PO and Inward POs tabs list INVOICES (GET /invoices; d2c/InvoiceTable.tsx): tick dispatched invoices
 * for "Create inward PO" (d2c/InwardPoDialog.tsx), and "Add variance reason" once an invoice's GRN is complete with a
 * variance (d2c/VarianceDialog.tsx; also from the drawer).
 */

const TAB_KEYS = D2C_TABS.map((t) => t.key)
const STAGE_BY_LABEL = Object.fromEntries(Object.entries(D2C_STAGE_LABEL).map(([k, v]) => [v, k]))
const SOURCE_BY_LABEL = Object.fromEntries(Object.entries(D2C_SOURCE_LABEL).map(([k, v]) => [v, k]))
const multi = (key: string, label: string, options: readonly string[]): FilterDef => ({ key, label, type: 'multi', options, placeholder: `Select ${label.toLowerCase()}` })

const filterDefs = (o: D2cOptions | null): FilterDef[] => [
  multi(D2C_FILTER.STAGE, 'Stage', (o?.stages ?? Object.values(D2C_STAGE)).map((s) => D2C_STAGE_LABEL[s] ?? s)),
  multi(D2C_FILTER.PRIORITY, 'Priority', o?.priorities ?? D2C_PRIORITIES),
  multi(D2C_FILTER.SENDER, 'Dispatch WH', o?.senders.map((s) => s.code) ?? []),
  multi(D2C_FILTER.RECEIVING, 'Receiving WH', o?.receivingFacilities.map((s) => s.code) ?? []),
  { key: D2C_FILTER.DATE_FROM, label: 'PO date from', type: 'date' },
  { key: D2C_FILTER.DATE_TO, label: 'PO date to', type: 'date' },
  multi(D2C_FILTER.SOURCE, 'Source', (o?.sources ?? Object.keys(D2C_SOURCE_LABEL)).map((s) => D2C_SOURCE_LABEL[s] ?? s)),
  multi(D2C_FILTER.CHANNEL, 'Channel', o?.channels ?? []),
  multi(D2C_FILTER.TYPE, 'Type', o?.types ?? []),
  multi(D2C_FILTER.EXPIRED, 'Expiry', [D2C_EXPIRED_OPTION.YES, D2C_EXPIRED_OPTION.NO]),
]

/** The panel's values -> the API's query (labels back to values; Expiry only when one of the two is picked). */
const toParams = (q: string, f: FilterValues): D2cParams => {
  const list = (k: string) => (Array.isArray(f[k]) ? (f[k]) : [])
  const text = (k: string) => (typeof f[k] === 'string' ? (f[k]) : '')
  const expired = list(D2C_FILTER.EXPIRED)
  return {
    q: q || undefined,
    stage: list(D2C_FILTER.STAGE).map((l) => STAGE_BY_LABEL[l] ?? l),
    priority: list(D2C_FILTER.PRIORITY),
    sender: list(D2C_FILTER.SENDER),
    receiving: list(D2C_FILTER.RECEIVING),
    dateFrom: text(D2C_FILTER.DATE_FROM) || undefined,
    dateTo: text(D2C_FILTER.DATE_TO) || undefined,
    source: list(D2C_FILTER.SOURCE).map((l) => SOURCE_BY_LABEL[l] ?? l),
    channel: list(D2C_FILTER.CHANNEL),
    type: list(D2C_FILTER.TYPE),
    expired: expired.length === 1 ? String(expired[0] === D2C_EXPIRED_OPTION.YES) : undefined,
  }
}

const target = (t: Pick<D2cListItem, 'uid' | 'transferCode' | 'poDate' | 'expiryDate' | 'expired' | 'soCode' | 'sender'>): DialogTarget => ({
  uid: t.uid, transferCode: t.transferCode, poDate: t.poDate, expiryDate: t.expiryDate, expired: t.expired, soCode: t.soCode, sender: t.sender.code,
})
const soTarget = (t: Pick<D2cListItem, 'uid' | 'transferCode' | 'sender' | 'receiving'>): SoTarget => ({ uid: t.uid, transferCode: t.transferCode, sender: t.sender.code, receiving: t.receiving.code })
/** A draft that may be sent to Uniware (never while a request is open). */
const canSendSo = (t: Pick<D2cListItem, 'stage' | 'soState'>) => t.stage === D2C_STAGE.DRAFT && (!t.soState || t.soState === D2C_SO_STATE.FAILED)
/** An SO with nothing dispatched yet: cancel reaches Uniware. */
const canCancelSo = (t: D2cListItem) => t.soState === D2C_SO_STATE.CREATED && D2C_UNDISPATCHED.includes(t.stage ?? '') && t.stage !== D2C_STAGE.DRAFT
  && t.totals.dispatched === 0 && t.invoices.dispatched === 0
/** The two tabs whose rows are invoices (plan 1.3). */
const INVOICE_TABS: readonly D2cTab[] = [D2C_TAB.CREATE_INWARD_PO, D2C_TAB.INWARD_POS]
const varianceTarget = (r: Pick<D2cInvoiceRow, 'id' | 'uid' | 'transferCode' | 'invoiceNo' | 'inwardPoCode' | 'units' | 'receivedUnits' | 'variance' | 'varianceReason' | 'varianceNote'>): VarianceTarget => ({
  invoiceId: r.id, uid: r.uid, transferCode: r.transferCode, invoiceNo: r.invoiceNo, inwardPoCode: r.inwardPoCode, units: r.units, received: r.receivedUnits, variance: r.variance,
  reason: r.varianceReason, note: r.varianceNote,
})
const canCloseShort = (t: D2cListItem) => t.soState === D2C_SO_STATE.CREATED && t.stage !== D2C_STAGE.CLOSED && t.stage !== D2C_STAGE.CANCELLED && t.totals.openBalance > 0

export default function D2cTransfers() {
  const auth = useAuth()
  const editor = auth.accessFor(PATHS.D2C_TRANSFERS) === ACCESS.EDITOR
  const [tab, setTab] = useUrlParam<D2cTab>(PATHS.D2C_TRANSFERS, URL_PARAM.TAB, oneOf(TAB_KEYS), D2C_TAB.DRAFT)
  const live = useLiveTransfers()
  const options = useQuery({ queryKey: [D2C_KEY, 'options'], queryFn: ({ signal }) => getOptions(signal), staleTime: 5 * 60_000 })
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [filters, setFilters] = useState<FilterValues>({})
  const [filtersOpen, setFiltersOpen] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => { if (q.trim() !== search) setSearch(q.trim()) }, SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [q, search])
  const params = useMemo(() => toParams(search, filters), [search, filters])
  const defs = useMemo(() => filterDefs(options.data ?? null), [options.data])

  const counts = useQuery({ queryKey: [D2C_KEY, 'counts', params], queryFn: ({ signal }) => getCounts(params, signal), placeholderData: keepPreviousData })
  const invoiceTab = INVOICE_TABS.includes(tab)
  const transfers = useInfiniteQuery({
    queryKey: [D2C_KEY, 'list', tab, params],
    queryFn: ({ pageParam, signal }) => listTransfers({ ...params, tab, page: pageParam, pageSize: D2C_PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (all.reduce((n, pg) => n + pg.data.length, 0) < last.meta.total ? all.length + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled: !invoiceTab,
  })
  // phase 7: the inward tabs list invoices (key under 'list' so live changes reload it too)
  const invoices = useInfiniteQuery({
    queryKey: [D2C_KEY, 'list', 'invoices', tab, params],
    queryFn: ({ pageParam, signal }) => listInvoices({ ...params, tab, page: pageParam, pageSize: D2C_PAGE_SIZE }, signal),
    initialPageParam: 1,
    getNextPageParam: (last, all) => (all.reduce((n, pg) => n + pg.data.length, 0) < last.meta.total ? all.length + 1 : undefined),
    placeholderData: keepPreviousData,
    enabled: invoiceTab,
  })
  const list = invoiceTab ? invoices : transfers
  const rows = useMemo(() => (transfers.data?.pages ?? []).flatMap((p) => p.data), [transfers.data])
  const invoiceRows = useMemo(() => (invoices.data?.pages ?? []).flatMap((p) => p.data), [invoices.data])
  const total = list.data?.pages.at(-1)?.meta.total ?? 0
  const shown = invoiceTab ? invoiceRows.length : rows.length

  const [detailOf, setDetailOf] = useState<string | null>(null)
  const [form, setForm] = useState<{ detail: D2cDetail | null } | null>(null)
  const [upload, setUpload] = useState(false)
  const [cancelOf, setCancelOf] = useState<DialogTarget | null>(null)
  const [expiryOf, setExpiryOf] = useState<DialogTarget | null>(null)
  const [closeOf, setCloseOf] = useState<DialogTarget | null>(null)
  const [soOf, setSoOf] = useState<SoTarget[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [pickedInvoices, setPickedInvoices] = useState<Set<string>>(new Set())
  const [inwardOf, setInwardOf] = useState<D2cInvoiceRow[] | null>(null)
  const [varianceOf, setVarianceOf] = useState<VarianceTarget | null>(null)
  const gate = options.data?.uniwareGate
  const testFacilities = gate?.testFacilities ?? []
  const [exporting, setExporting] = useState(false)
  const [exportError, setExportError] = useState<string | null>(null)

  const qc = useQueryClient()
  /** Edit straight from the row: the form needs the detail (lines + edit token). */
  const editRow = async (uid: string) => {
    try {
      setForm({ detail: await qc.fetchQuery({ queryKey: [D2C_KEY, 'detail', uid], queryFn: ({ signal }) => getTransfer(uid, signal), staleTime: 0 }) })
    } catch {
      setDetailOf(uid)
    }
  }

  const actions = (t: D2cListItem, toggle: () => void, open: boolean): RowAction[] => {
    const draft = canSendSo(t)
    const final = t.stage === D2C_STAGE.CLOSED || t.stage === D2C_STAGE.CANCELLED
    return [
      { label: 'View details', onClick: () => setDetailOf(t.uid) },
      { label: open ? 'Hide SKUs' : 'Show SKUs', onClick: toggle },
      ...(editor && draft ? [{ label: 'Create SO in Uniware', onClick: () => setSoOf([soTarget(t)]) }] : []),
      ...(editor && draft ? [{ label: 'Edit', onClick: () => void editRow(t.uid) }] : []),
      ...(editor && !final ? [{ label: t.expired ? 'Extend expiry' : 'Change expiry', onClick: () => setExpiryOf(target(t)) }] : []),
      ...(editor && canCloseShort(t) ? [{ label: 'Close short', onClick: () => setCloseOf(target(t)), danger: true }] : []),
      ...(editor && (draft || canCancelSo(t)) ? [{ label: 'Cancel transfer', onClick: () => setCancelOf(target(t)), danger: true }] : []),
    ]
  }

  // Draft tab: tick drafts for one bulk "Create SO in Uniware" (at most D2C_SO_MAX_IDS)
  const selection: Selection | undefined = editor && tab === D2C_TAB.DRAFT ? {
    can: canSendSo,
    selected: picked,
    onChange: (uids, on) => setPicked((s) => { const x = new Set(s); for (const u of uids) { if (on) x.add(u); else x.delete(u) } return x }),
  } : undefined
  const pickedRows = rows.filter((t) => picked.has(t.uid) && canSendSo(t))
  useEffect(() => { setPicked(new Set()); setPickedInvoices(new Set()) }, [tab, params])
  // Create inward PO tab: tick dispatched invoices for one "Create inward PO" (at most D2C_INWARD_MAX_IDS)
  const invoiceSelection: InvoiceSelection | undefined = editor && tab === D2C_TAB.CREATE_INWARD_PO ? {
    selected: pickedInvoices,
    onChange: (ids, on) => setPickedInvoices((s) => { const x = new Set(s); for (const id of ids) { if (on) x.add(id); else x.delete(id) } return x }),
  } : undefined
  const pickedInvoiceRows = invoiceRows.filter((r) => pickedInvoices.has(r.id) && r.canCreate)

  const runExport = async (level: string, format: 'csv' | 'xlsx') => {
    setExporting(true)
    setExportError(null)
    try {
      const text = await exportCsv({ ...params, tab }, level)
      const { header, body } = parseTable(text)
      const name = `d2c-transfers-${tab}-${level === D2C_EXPORT_LEVEL.SKU ? 'po-sku' : 'po'}-${todayIst()}`
      if (format === 'csv') downloadCsv(`${name}.csv`, header, body)
      else {
        const numeric = header.map((h) => D2C_EXPORT_NUMBERS.has(h))
        await downloadExcel(name, [{ name: level === D2C_EXPORT_LEVEL.SKU ? 'PO + SKU' : 'PO', header, rows: body.map((r) => r.map((c, i) => (numeric[i] && c !== '' && Number.isFinite(Number(c)) ? Number(c) : c))) }])
      }
    } catch (e) {
      setExportError(errorOf(e).message)
    } finally {
      setExporting(false)
    }
  }

  const tabs = D2C_TABS.map((t) => ({ key: t.key, label: t.label, count: counts.data?.[t.key] }))
  const err = list.error ? errorOf(list.error).message : null
  return (
    <div className="space-y-4">
      <PageTitle title={D2C_TEXT.TITLE} sub={D2C_TEXT.SUB}
        right={<div className="flex flex-wrap items-center justify-end gap-2">
          <span title={gate ? (gate.open ? D2C_TEXT.UNIWARE_LIVE_HINT : D2C_TEXT.UNIWARE_TEST_ONLY_HINT(testFacilities.join(', '))) : D2C_TEXT.UNIWARE_PENDING_HINT}
            className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] ${gate && !gate.open ? 'border-warn/30 bg-warn-soft text-warn' : 'border-line bg-alt text-ink-600'}`}>
            <PlugZap className="size-3.5" />{gate ? (gate.open ? D2C_TEXT.UNIWARE_LIVE : D2C_TEXT.UNIWARE_TEST_ONLY) : D2C_TEXT.UNIWARE_PENDING}
          </span>
          <SyncStatus editor={editor} />
          {!live.offline && <LiveDot mode={live.mode} />}
          {editor && <Button icon={<Upload className="size-4" />} onClick={() => setUpload(true)}>Upload CSV</Button>}
          {editor && <Button variant="primary" icon={<Plus className="size-4" />} disabled={!options.data} onClick={() => setForm({ detail: null })}>New transfer</Button>}
        </div>} />

      {(options.data?.testOnly || gate?.testOnly) && (
        <div role="status" title={D2C_TEXT.TEST_MODE_HINT}
          className="flex items-start gap-2 rounded-[var(--radius)] border border-warn/40 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          <FlaskConical className="mt-0.5 size-4 shrink-0" />
          <span><span className="font-semibold">{D2C_TEXT.TEST_MODE_BANNER}</span> · {D2C_TEXT.TEST_MODE_HINT}</span>
        </div>
      )}

      <div className="overflow-x-auto"><SubTabs value={tab} onChange={setTab} tabs={tabs} /></div>

      <div className="flex flex-wrap items-center gap-2">
        <label className="relative flex min-w-[220px] flex-1 items-center sm:max-w-sm">
          <Search className="pointer-events-none absolute left-3 size-4 text-ink-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={D2C_TEXT.SEARCH}
            className="h-9 w-full rounded-[var(--radius)] border border-line bg-surface pl-9 pr-3 text-[13px] outline-none placeholder:text-ink-400 focus:border-primary focus:ring-2 focus:ring-primary/15" />
        </label>
        <button onClick={() => setFiltersOpen(!filtersOpen)}
          className={`inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border px-3 text-[13px] font-medium transition-colors ${filtersOpen || countActive(filters) ? 'border-primary/40 bg-primary-soft text-primary' : 'border-line bg-surface text-ink-900 hover:bg-canvas'}`}>
          <Filter className="size-4" /> Filters
          {countActive(filters) > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{countActive(filters)}</span>}
        </button>
        {invoiceSelection && (
          <Button variant="primary" icon={<PackagePlus className="size-4" />} disabled={!pickedInvoiceRows.length || pickedInvoiceRows.length > D2C_INWARD_MAX_IDS} onClick={() => setInwardOf(pickedInvoiceRows)}>
            {pickedInvoiceRows.length ? `Create inward PO (${pickedInvoiceRows.length})` : 'Create inward PO'}
          </Button>
        )}
        {selection && (
          <Button variant="primary" icon={<Send className="size-4" />} disabled={!pickedRows.length || pickedRows.length > D2C_SO_MAX_IDS} onClick={() => setSoOf(pickedRows.map(soTarget))}>
            {pickedRows.length ? `Create SO in Uniware (${pickedRows.length})` : 'Create SO in Uniware'}
          </Button>
        )}
        <div className="ml-auto">
          <DownloadMenu label={exporting ? 'Preparing…' : 'Download'} busy={exporting} title="Every transfer of this tab with the search + filters (at most 20,000 rows)" items={[
            { group: 'PO level (one row per transfer)', label: 'CSV · PO level', onClick: () => void runExport(D2C_EXPORT_LEVEL.PO, 'csv') },
            { group: 'PO level (one row per transfer)', label: 'Excel · PO level', onClick: () => void runExport(D2C_EXPORT_LEVEL.PO, 'xlsx') },
            { group: 'PO + SKU level (one row per SKU line)', label: 'CSV · PO + SKU level', onClick: () => void runExport(D2C_EXPORT_LEVEL.SKU, 'csv') },
            { group: 'PO + SKU level (one row per SKU line)', label: 'Excel · PO + SKU level', onClick: () => void runExport(D2C_EXPORT_LEVEL.SKU, 'xlsx') },
          ]} />
        </div>
      </div>
      <Reveal open={filtersOpen}><FilterPanel defs={defs} value={filters} onApply={setFilters} onClose={() => setFiltersOpen(false)} /></Reveal>
      <FilterChips defs={defs} value={filters} onChange={setFilters} />
      {exportError && <div className="text-[12.5px] text-crit">Download failed: {exportError}</div>}

      {err ? (
        <div className="flex items-center gap-3 rounded-[var(--radius)] border border-crit/30 bg-crit-soft px-4 py-3 text-[13px] text-crit">
          <AlertTriangle className="size-4" /> Could not load the transfers: {err}
          <button onClick={() => void list.refetch()} className="ml-auto font-semibold">Retry</button>
        </div>
      ) : (
        <div className="flex items-center justify-between text-[12px] text-ink-600">
          <span>{list.isPending ? (invoiceTab ? 'Loading invoices…' : 'Loading transfers…') : `Showing ${shown} of ${total}${invoiceTab ? ' invoices' : ''}`}{list.isFetching && !list.isPending ? ' · updating…' : ''}</span>
          {list.hasNextPage && !list.isFetchingNextPage && <Button onClick={() => void list.fetchNextPage()}>Load more</Button>}
        </div>
      )}

      <div key={tab} className="pf-tab-in">
        {invoiceTab
          ? <InvoiceTable tab={tab} rows={invoiceRows} onOpen={setDetailOf} onVariance={(r) => setVarianceOf(varianceTarget(r))} selection={invoiceSelection} editor={editor} maxHeight={TABLE_HEIGHT.PAGE} />
          : <TransferTable tab={tab} rows={rows} onOpen={(t) => setDetailOf(t.uid)} actions={actions} flash={live.flash} maxHeight={TABLE_HEIGHT.PAGE} selection={selection} />}
      </div>

      {detailOf && (
        <TransferDrawer uid={detailOf} editor={editor} onClose={() => setDetailOf(null)}
          onEdit={(d) => { setDetailOf(null); setForm({ detail: d }) }}
          onCancel={(d) => setCancelOf(target(d))} onExpiry={(d) => setExpiryOf(target(d))}
          onCreateSo={(d) => setSoOf([soTarget(d)])} onCloseShort={(d) => setCloseOf(target(d))}
          onVariance={(d, i) => setVarianceOf(varianceTarget({ id: i.id, uid: d.uid, transferCode: d.transferCode, invoiceNo: i.invoiceDisplayCode ?? i.invoiceCode, inwardPoCode: i.inwardPoCode, units: i.units, receivedUnits: i.receivedUnits, variance: i.variance, varianceReason: i.varianceReason, varianceNote: i.varianceNote }))} />
      )}
      {form && options.data && (
        <TransferFormDrawer options={options.data} detail={form.detail} onClose={() => setForm(null)}
          onSaved={(d) => { setForm(null); setDetailOf(d.uid) }} />
      )}
      {upload && <UploadDialog onClose={() => setUpload(false)} />}
      {cancelOf && <CancelDialog t={cancelOf} testFacilities={testFacilities} onClose={() => setCancelOf(null)} />}
      {closeOf && <CloseShortDialog t={closeOf} testFacilities={testFacilities} onClose={() => setCloseOf(null)} />}
      {soOf && <CreateSoDialog targets={soOf} gate={gate} onClose={() => { setSoOf(null); setPicked(new Set()) }} />}
      {expiryOf && <ExpiryDialog t={expiryOf} onClose={() => setExpiryOf(null)} />}
      {inwardOf && <InwardPoDialog rows={inwardOf} gate={gate} onClose={() => { setInwardOf(null); setPickedInvoices(new Set()) }} />}
      {varianceOf && <VarianceDialog t={varianceOf} onClose={() => setVarianceOf(null)} />}
    </div>
  )
}
