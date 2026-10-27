import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChannelOptions } from '../../lib/channels'
import { AlertTriangle, FileUp, Webhook, Zap, Mail } from 'lucide-react'
import { Badge, PageTitle, SubTabs } from '../../components/ui'
import { DataGrid, DownloadMenu, FilterChips, FilterPanel, SectionToolbar, exportRows, exportRowsExcel, useSection, type DownloadItem, type FilterDef } from '../../components/kit'
import { Reveal } from '../../components/shell'
import type { ColKind } from '../../lib/ops'
import { istDateTime, istDay } from '../../lib/time'
import { InReview } from './POReview'
import { FileCell, SourceCell } from './SourceCells'
import { UniwareCell, ageTone, daysWaiting, downloadCombinedCsv, downloadOneCsv, stateOf, type Handoff } from './UniwareHandoff'
import { getLineItems, markUniwareUploaded } from '../../api/poReview'
import { LINE_ITEMS, LINE_ITEMS_TEXT, UNIWARE_STATE, UNIWARE_STATE_LABEL, UNIWARE_TEXT } from '../../constants/poReview'
import { downloadLineItemsCsv, downloadLineItemsExcel } from '../../lib/lineItemsExport'
import { useAuth } from '../../auth/AuthContext'
import { ACCESS } from '../../constants/auth'
import { PATHS } from '../../constants/pages'
import { Check, Download as DownloadIcon, Upload as UploadIcon, X as XIcon } from 'lucide-react'
import { listAllPoReview, type PoReviewItem } from '../../api/poReview'
import { ApiError } from '../../api/client'
import { LIST_PAGE_SIZE, PO_STATUS, PROCESSED_FILTER, REVIEW_LIVE, SOURCE_LABELS } from '../../constants/poReview'
import { useLiveReview } from '../../lib/liveReview'
import { LiveDot } from '../../components/LiveDot'
import { ShieldCheck } from 'lucide-react'
import { getVerifyStates, type VerifyStateItem } from '../../api/poVerify'
import { VERIFY_STATE, VERIFY_TEXT, type VerifyState } from '../../constants/poVerify'
import { VerifyPanel } from './VerifyPanel'
import { ManualUpload } from './ManualUpload'

type Tab = 'processed' | 'review' | 'manual'
const SRC_ICON = { API: Zap, Webhook: Webhook, Email: Mail, Manual: FileUp } as const

export default function POProcessing() {
  const [tab, setTab] = useState<Tab>('processed')
  const [processedCount, setProcessedCount] = useState<number | undefined>()
  const [reviewCount, setReviewCount] = useState<number | undefined>()
  // Live (2026-10-15): when anyone submits, approves, rejects, or a new PO arrives, both lists reload quietly.
  const [liveTick, setLiveTick] = useState(0)
  const live = useLiveReview(REVIEW_LIVE.PO_REVIEW_BASE, useCallback(() => setLiveTick((n) => n + 1), []))
  const canEditRoot = useAuth().accessFor(PATHS.PO_REVIEW) === ACCESS.EDITOR
  return (
    <div className="space-y-5">
      <PageTitle title="PO Processing & Review" sub="Ingest from channel APIs, webhooks and email · resolve parser errors · upload what can't be automated" right={<LiveDot mode={live} />} />
      <SubTabs value={tab} onChange={setTab} tabs={[
        { key: 'processed', label: 'Processed', count: processedCount },
        { key: 'review', label: 'In Review', count: reviewCount, danger: !!reviewCount },
        { key: 'manual', label: 'Manual Upload' },
      ]} />
      {tab === 'processed' && <Processed onCount={setProcessedCount} liveTick={liveTick} />}
      {tab === 'review' && <InReview srcIcon={SRC_ICON} onCount={setReviewCount} liveTick={liveTick} />}
      {tab === 'manual' && <ManualUpload canEdit={canEditRoot} liveTick={liveTick} />}
    </div>
  )
}

// ---- Processed: completed POs from GET /po-review?status=completed ------------------------------

type ProcessedRow = {
  id: string; poNumber: string; channel: string; brand: string; processedAt: string
  lines: number | null; units: number | null; value: number | null; saleOrder: string; source: string; file: string
  /** Raw source value (api / email / manual) for the icon, and the subject the Source cell copies. */
  sourceKey: string; subject: string | null
  /** YYYY-MM-DD (Indian time) it was processed: the Filters panel's Processed from / to compare this. */
  processedDay: string
  /** Uniware hand-off: the raw dates / names, its state label (filter + export) and days waiting. */
  handoff: Handoff; uniware: string; waitingDays: number
  /** Verification before Uniware (2026-10-22): state from GET /po-verify and its label (filter + export). */
  verify?: VerifyStateItem; check: string
}

const PCOLS: [string, keyof ProcessedRow, ColKind][] = [
  // Ingest ID left out of the screen and the download (user, 2026-10-16); rows still use it as their key.
  ['PO Number', 'poNumber', 'mono'], ['Channel', 'channel', 'text'], ['Brand', 'brand', 'text'],
  ['Processed At', 'processedAt', 'mono'], ['Lines', 'lines', 'num'], ['Units', 'units', 'num'], ['Value', 'value', 'money'], ['Sale order', 'saleOrder', 'mono'],
]
/** The download (CSV / Excel of the table) also says where each PO stands with Uniware. */
const PEXPORT: [string, keyof ProcessedRow, ColKind][] = [...PCOLS, ['Check', 'check', 'text'], ['Uniware', 'uniware', 'text']]

const CHECK_LABEL: Record<VerifyState, string> = {
  [VERIFY_STATE.VERIFIED]: VERIFY_TEXT.VERIFIED, [VERIFY_STATE.TO_VERIFY]: VERIFY_TEXT.TO_VERIFY, [VERIFY_STATE.NOT_NEEDED]: VERIFY_TEXT.NOT_NEEDED,
  [VERIFY_STATE.NOT_REQUIRED]: VERIFY_TEXT.OPTIONAL,
}

const handoffOf = (r: PoReviewItem): Handoff => ({
  id: r.uploadId, completedAt: r.completedAt, csvDownloadedAt: r.csvDownloadedAt, csvDownloadedBy: r.csvDownloadedBy,
  uniwareUploadedAt: r.uniwareUploadedAt, uniwareUploadedBy: r.uniwareUploadedBy,
})

const toRow = (r: PoReviewItem): ProcessedRow => ({
  handoff: handoffOf(r), uniware: UNIWARE_STATE_LABEL[stateOf(handoffOf(r))], waitingDays: daysWaiting(handoffOf(r)),
  id: r.uploadId, poNumber: r.poNumber ?? '', channel: r.channel ?? '', brand: r.brand ?? '', processedAt: istDateTime(r.completedAt), processedDay: r.completedAt ? istDay(new Date(r.completedAt)) : '',
  lines: r.lines, units: r.units, value: r.poValue, saleOrder: r.saleOrderCode ?? '', source: SOURCE_LABELS[r.source] ?? r.source, file: r.fileName, sourceKey: r.source, subject: r.subject,
  check: '',
})

const distinct = (rows: ProcessedRow[], k: keyof ProcessedRow) => [...new Set(rows.map((r) => String(r[k] ?? '')).filter(Boolean))].sort()

function Processed({ onCount, liveTick }: { onCount: (n: number) => void; liveTick: number }) {
  const [baseRows, setRows] = useState<ProcessedRow[]>([])
  // Verification (2026-10-22): states of the loaded POs; `required` false = the check is switched off on the server.
  const [verify, setVerify] = useState<{ required: boolean; items: Map<string, VerifyStateItem> }>({ required: false, items: new Map() })
  const [verifyOpen, setVerifyOpen] = useState<string | null>(null)
  const [state, setState] = useState<{ loading: boolean; error?: string }>({ loading: true })
  const [reload, setReload] = useState(0)
  const { accessFor } = useAuth()
  const canEdit = accessFor(PATHS.PO_REVIEW) === ACCESS.EDITOR
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [bulkBusy, setBulkBusy] = useState(false)
  const done = (text: string) => { setNote({ tone: 'ok', text }); setReload((n) => n + 1) }
  const fail = (text: string) => setNote({ tone: 'err', text })
  // Every processed PO (user, 2026-10-26: all by default, dates in the Filters panel, 50 per page). A live reload keeps
  // the rows on screen (no "Loading…" flash).
  const loaded = useRef(false)

  useEffect(() => {
    const ctrl = new AbortController()
    if (!loaded.current) setState({ loading: true })
    listAllPoReview({ status: PO_STATUS.COMPLETED }, ctrl.signal)
      .then((items) => {
        const next = items.map(toRow)
        setRows(next)
        onCount(next.length)
        loaded.current = true
        setState({ loading: false })
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return
        setState({ loading: false, error: e instanceof ApiError ? e.message : String(e) })
      })
    return () => ctrl.abort()
  }, [reload, liveTick, onCount])

  useEffect(() => {
    if (!baseRows.length) return
    const ctrl = new AbortController()
    getVerifyStates(baseRows.map((r) => r.id), ctrl.signal)
      .then((v) => setVerify({ required: v.required, items: new Map(v.items.map((i) => [i.uploadId, i])) }))
      .catch(() => { /* the column shows nothing; the server still locks unverified CSVs */ })
    return () => ctrl.abort()
  }, [baseRows])
  const rows = useMemo(() => baseRows.map((r) => {
    const v = verify.items.get(r.id)
    return { ...r, verify: v, check: v && verify.required ? CHECK_LABEL[v.state] : '' }
  }), [baseRows, verify])
  const toVerify = (r: ProcessedRow) => verify.required && r.verify?.state === VERIFY_STATE.TO_VERIFY

  const s = useSection<ProcessedRow>(rows, ['poNumber', 'id', 'file', 'saleOrder'])
  // Ticked rows (by id): CSV / Excel download only these; none ticked = every row shown. Rows that left the list drop out.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const picked = rows.filter((r) => selected.has(r.id))
  const channelOptions = useChannelOptions(distinct(rows, 'channel'))
  const defs: FilterDef[] = [
    { key: 'processedDayFrom', label: PROCESSED_FILTER.FROM, type: 'date' },
    { key: 'processedDayTo', label: PROCESSED_FILTER.TO, type: 'date' },
    { key: 'channel', label: 'Channel', type: 'multi', options: channelOptions },
    { key: 'brand', label: 'Brand', type: 'multi', options: distinct(rows, 'brand') },
    { key: 'source', label: 'Source', type: 'multi', options: distinct(rows, 'source') },
    { key: 'uniware', label: 'Uniware', type: 'multi', options: Object.values(UNIWARE_STATE_LABEL) },
    ...(verify.required ? [{ key: 'check', label: VERIFY_TEXT.COLUMN, type: 'multi' as const, options: Object.values(CHECK_LABEL) }] : []),
  ]
  const unverifiedPicked = picked.filter(toVerify).length
  const toVerifyCount = rows.filter(toVerify).length
  const pending = rows.filter((r) => stateOf(r.handoff) === UNIWARE_STATE.PENDING).length
  const waiting = rows.filter((r) => stateOf(r.handoff) === UNIWARE_STATE.DOWNLOADED).length
  // Bulk: the ticked POs as ONE combined CSV, or marked uploaded (only the downloaded, not-yet-uploaded ones).
  const markable = picked.filter((r) => stateOf(r.handoff) === UNIWARE_STATE.DOWNLOADED)
  const bulk = async (what: 'csv' | 'mark') => {
    setBulkBusy(true)
    try {
      // One ticked PO: its own file named after the sale order; several: one combined CSV.
      if (what === 'csv') { await (picked.length === 1 ? downloadOneCsv(picked[0].id) : downloadCombinedCsv(picked.map((r) => r.id))); done(UNIWARE_TEXT.DOWNLOADED(picked.length)) }
      else { await markUniwareUploaded(markable.map((r) => r.id)); done(UNIWARE_TEXT.MARKED(markable.length)) }
    } catch (e) {
      fail(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBulkBusy(false)
    }
  }
  // One Download button (user, 2026-10-26): the main click is the POs (this table) as Excel, the ticked ones or, with
  // none ticked, every PO shown (search + filters); the arrow gives CSV and the POs' line items. Read only.
  const T = LINE_ITEMS_TEXT
  const linePos = picked.length ? picked : s.filtered
  const tooManyLines = linePos.length > LINE_ITEMS.MAX
  const downloadLines = async (kind: 'csv' | 'excel') => {
    setBulkBusy(true)
    try {
      const lines = await getLineItems(linePos.map((r) => r.id))
      await (kind === 'csv' ? downloadLineItemsCsv(lines) : downloadLineItemsExcel(lines))
      const missing = new Set(lines.filter((l) => l.s3Missing).map((l) => l.uploadId)).size
      setNote({ tone: 'ok', text: T.DONE(linePos.length, lines.length) + (missing ? T.S3_MISSING(missing) : '') })
    } catch (e) {
      fail(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBulkBusy(false)
    }
  }
  const linesHint = tooManyLines ? T.TOO_MANY(LINE_ITEMS.MAX, linePos.length, picked.length > 0) : T.HINT
  const linesGroup = T.GROUP_LINES(linePos.length, picked.length > 0)
  const tableRows = linePos
  const downloadItems: DownloadItem[] = [
    { group: T.GROUP_TABLE(tableRows.length, picked.length > 0), label: T.EXCEL, onClick: () => void exportRowsExcel('processed_pos', PEXPORT, tableRows), disabled: !tableRows.length },
    { group: T.GROUP_TABLE(tableRows.length, picked.length > 0), label: T.CSV, onClick: () => exportRows('processed_pos', 'csv', PEXPORT, tableRows), disabled: !tableRows.length },
    { group: linesGroup, label: T.EXCEL, onClick: () => void downloadLines('excel'), disabled: !linePos.length || tooManyLines, hint: linesHint },
    { group: linesGroup, label: T.CSV, onClick: () => void downloadLines('csv'), disabled: !linePos.length || tooManyLines, hint: linesHint },
  ]
  const box = 'rounded-[var(--radius)] border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-600'
  return (
    <div className="space-y-3">
      <SectionToolbar q={s.q} setQ={s.setQ} placeholder="Search PO number, ingest ID, file, sale order…" filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)} activeFilters={s.active}
        entity="Processed POs" onExport={(e) => exportRows('processed_pos', e, PEXPORT, tableRows)}
        exportMenu={
          <DownloadMenu busy={bulkBusy}
            label={T.POS_BUTTON(tableRows.length)} title={T.POS_HINT} items={downloadItems} />
        }
        primary={canEdit && picked.length > 0 ? (
          <span className="pf-tab-in inline-flex flex-wrap gap-2">
            {canEdit && <button onClick={() => void bulk('csv')} disabled={bulkBusy || unverifiedPicked > 0} title={unverifiedPicked ? VERIFY_TEXT.BLOCKED(unverifiedPicked) : undefined} className="pf-press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
              <DownloadIcon className="size-4" />{UNIWARE_TEXT.BULK_DOWNLOAD(picked.length)}
            </button>}
            {canEdit && markable.length > 0 && (
              <button onClick={() => void bulk('mark')} disabled={bulkBusy} className="pf-press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-ok px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
                <UploadIcon className="size-4" />{UNIWARE_TEXT.BULK_MARK(markable.length)}
              </button>
            )}
          </span>
        ) : undefined}
        selectedCount={picked.length} onClearSelection={() => setSelected(new Set())} />
      <Reveal open={s.open}><FilterPanel defs={defs} value={s.filters} onApply={s.setFilters} onClose={() => s.setOpen(false)} /></Reveal>
      {!s.open && <FilterChips defs={defs} value={s.filters} onChange={s.setFilters} />}
      {/* What still has to go to Uniware: click to show only those. */}
      {(pending > 0 || waiting > 0 || toVerifyCount > 0) && (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          {toVerifyCount > 0 && <button onClick={() => s.setFilters({ ...s.filters, check: [VERIFY_TEXT.TO_VERIFY] })} className="pf-press rounded-full bg-crit-soft px-3 py-1 font-semibold text-crit hover:opacity-90">{VERIFY_TEXT.TO_VERIFY_CHIP(toVerifyCount)}</button>}
          {pending > 0 && <button onClick={() => s.setFilters({ ...s.filters, uniware: [UNIWARE_STATE_LABEL.pending] })} className="pf-press rounded-full bg-warn-soft px-3 py-1 font-semibold text-warn hover:opacity-90">{pending} not downloaded</button>}
          {waiting > 0 && <button onClick={() => s.setFilters({ ...s.filters, uniware: [UNIWARE_STATE_LABEL.downloaded] })} className="pf-press rounded-full bg-info-soft px-3 py-1 font-semibold text-info hover:opacity-90">{waiting} downloaded, not in Uniware</button>}
          <span className="text-ink-400">These stay here until they are marked uploaded; then they show in PO Overview.</span>
        </div>
      )}
      {picked.length > LINE_ITEMS.MAX && (
        <div className="pf-tab-in flex items-center gap-2 rounded-[var(--radius)] bg-warn-soft px-3 py-2 text-[12.5px] text-warn"><AlertTriangle className="size-4" />{T.TOO_MANY(LINE_ITEMS.MAX, picked.length, true)}</div>
      )}
      {canEdit && unverifiedPicked > 0 && (
        <div className="pf-tab-in flex items-center gap-2 rounded-[var(--radius)] bg-warn-soft px-3 py-2 text-[12.5px] text-warn"><AlertTriangle className="size-4" />{VERIFY_TEXT.BLOCKED(unverifiedPicked)}</div>
      )}
      {note && (
        <div className={`pf-tab-in flex items-start gap-2 rounded-[var(--radius)] px-3 py-2 text-[12.5px] ${note.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'}`}>
          {note.tone === 'ok' ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          <span className="flex-1">{note.text}</span>
          <button onClick={() => setNote(null)}><XIcon className="size-4" /></button>
        </div>
      )}
      {state.error ? (
        <div className="flex items-center gap-3 rounded-[var(--radius)] border border-crit/30 bg-crit-soft px-4 py-3 text-[13px] text-crit">
          <AlertTriangle className="size-4" /> Could not load processed POs: {state.error}
          <button onClick={() => setReload((n) => n + 1)} className="ml-auto font-semibold">Retry</button>
        </div>
      ) : state.loading ? (
        <div className={box}>Loading processed POs…</div>
      ) : !rows.length ? (
        <div className={box}>{PROCESSED_FILTER.NONE}</div>
      ) : (
        <DataGrid cols={PCOLS} rows={s.filtered} rowKey={(r) => r.id} pageSize={LIST_PAGE_SIZE} selected={selected} onSelectedChange={setSelected}
          // As PO Working's critical rows: a thin stripe on the row's left edge while it is not in Uniware (red 10+ days, yellow 5+).
          rowClass={(r) => {
            if (stateOf(r.handoff) === UNIWARE_STATE.UPLOADED) return ''
            const tone = ageTone(r.waitingDays)
            return tone === 'crit' ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-crit)]' : tone === 'warn' ? '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-warn)]' : ''
          }}
          trailing={[
            { label: 'Source', render: (r) => <SourceCell source={r.source} subject={r.subject} fallback={r.poNumber} icon={SRC_ICON[r.source as keyof typeof SRC_ICON] ?? Mail} /> },
            { label: 'Original file', render: (r) => <FileCell uploadId={r.id} name={r.file} /> },
            ...(verify.required ? [{
              label: VERIFY_TEXT.COLUMN,
              render: (r: ProcessedRow) => <CheckCell row={r} canEdit={canEdit} onOpen={() => setVerifyOpen(r.id)} />,
              // ↓ = still to verify first.
              sortValue: (r: ProcessedRow) => (r.verify?.state === VERIFY_STATE.TO_VERIFY ? 1 : 0),
            }] : []),
            {
              label: UNIWARE_TEXT.COLUMN, render: (r) => <UniwareCell h={r.handoff} canEdit={canEdit} onDone={done} onError={fail} />,
              // ↓ = waiting longest first (not downloaded before downloaded on the same day), POs already in Uniware last.
              sortValue: (r) => (stateOf(r.handoff) === UNIWARE_STATE.UPLOADED ? -1 : r.waitingDays * 2 + (stateOf(r.handoff) === UNIWARE_STATE.PENDING ? 1 : 0)),
              sortHint: UNIWARE_TEXT.SORT_HINT,
            },
          ]} />
      )}
      {verifyOpen && <VerifyPanel uploadId={verifyOpen} canEdit={canEdit} onClose={() => setVerifyOpen(null)} onDone={done} />}
    </div>
  )
}

/** Verified (green, who / when on hover), To verify + a Verify button, or In Uniware (marked before the check existed). */
function CheckCell({ row, canEdit, onOpen }: { row: ProcessedRow; canEdit: boolean; onOpen: () => void }) {
  const v = row.verify
  if (!v) return <span className="text-ink-400">—</span>
  if (v.state === VERIFY_STATE.VERIFIED) {
    return (
      <span className="inline-flex items-center gap-2">
        <span title={VERIFY_TEXT.BY(v.by, istDateTime(v.at))}><Badge tone="ok"><ShieldCheck className="size-3" />{VERIFY_TEXT.VERIFIED}</Badge></span>
        <button type="button" onClick={onOpen} className="text-[11.5px] text-ink-400 underline-offset-2 hover:text-ink-900 hover:underline">{VERIFY_TEXT.VIEW}</button>
      </span>
    )
  }
  if (v.state === VERIFY_STATE.NOT_NEEDED) return <Badge tone="neutral">{VERIFY_TEXT.NOT_NEEDED}</Badge>
  // Channel switched OFF (Users & Roles -> Settings): not locked; verifying is optional.
  if (v.state === VERIFY_STATE.NOT_REQUIRED) {
    return (
      <span className="inline-flex items-center gap-2" title={VERIFY_TEXT.OPTIONAL_HINT}>
        <Badge tone="neutral">{VERIFY_TEXT.OPTIONAL}</Badge>
        <button type="button" onClick={onOpen} className="text-[11.5px] text-ink-400 underline-offset-2 hover:text-primary hover:underline">{canEdit ? VERIFY_TEXT.VERIFY : VERIFY_TEXT.VIEW}</button>
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Badge tone="warn">{VERIFY_TEXT.TO_VERIFY}</Badge>
      <button type="button" onClick={onOpen}
        className="pf-press inline-flex h-7 items-center gap-1.5 rounded-md bg-primary px-2.5 text-[12px] font-semibold text-white transition-opacity duration-150 hover:opacity-90">
        <ShieldCheck className="size-3.5" />{canEdit ? VERIFY_TEXT.VERIFY : VERIFY_TEXT.VIEW}
      </button>
    </span>
  )
}
