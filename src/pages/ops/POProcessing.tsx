import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useChannelOptions } from '../../lib/channels'
import { AlertTriangle, ArrowRight, Eye, FileUp, Webhook, Zap, Mail } from 'lucide-react'
import { Badge, PageTitle, SubTabs } from '../../components/ui'
import { DataGrid, DownloadMenu, FilterChips, FilterPanel, ColumnSort, SectionToolbar, exportRows, exportRowsExcel, useSection, type DownloadItem, type FilterDef } from '../../components/kit'
import { Reveal } from '../../components/shell'
import type { ColKind } from '../../lib/ops'
import { DATE_SORT_KEY, SORT_FILTER_KEY, orderRows } from '../../lib/listOrder'
import { istDateTime } from '../../lib/time'
import { InReview } from './POReview'
import { FileCell, SourceCell } from './SourceCells'
import { UniwareCreatePreview } from './UniwareCreatePreview'
import { UniwareCell, ageTone, daysWaiting, downloadCombinedCsv, downloadOneCsv, stateOf, type Handoff } from './UniwareHandoff'
import { createInUniware, getLineItems, markUniwareUploaded, previewUniwareCreate, uniwareCreateStates, type UniwareCreateState, type UniwarePreviewItem } from '../../api/poReview'
import { LINE_ITEMS, LINE_ITEMS_TEXT, UNIWARE_CREATE_STATUS, UNIWARE_CREATE_TEXT, UNIWARE_PREVIEW_TEXT, UNIWARE_STATE, UNIWARE_STATE_LABEL, UNIWARE_TEXT } from '../../constants/poReview'
import { downloadLineItemsCsv, downloadLineItemsExcel } from '../../lib/lineItemsExport'
import { useAuth } from '../../auth/AuthContext'
import { ACCESS } from '../../constants/auth'
import { PATHS, URL_PARAM } from '../../constants/pages'
import { oneOf, useUrlParam } from '../../lib/urlState'
import { Check, Download as DownloadIcon, Upload as UploadIcon, X as XIcon } from 'lucide-react'
import { listAllPoReview, type PoReviewItem } from '../../api/poReview'
import { ApiError } from '../../api/client'
import { LIST_FILTER, LIST_PAGE_SIZE, LIST_SORT, PO_STATUS, PROCESSED_FILTER, REVIEW_LIVE, SOURCE_LABELS } from '../../constants/poReview'
import { useLiveReview } from '../../lib/liveReview'
import { LiveDot } from '../../components/LiveDot'
import { ShieldCheck } from 'lucide-react'
import { verifyMany, type VerifyStateItem } from '../../api/poVerify'
import { VERIFY_STATE, VERIFY_TEXT, VERIFY_UPLOAD, type VerifyState } from '../../constants/poVerify'
import { chunks, matchVerified, type VerifyMatch } from '../../lib/verifyUpload'
import { sheetTables } from '../../lib/fileTables'
import { VerifyPanel } from './VerifyPanel'
import { ManualUpload } from './ManualUpload'
import { PoIssues } from './PoIssues'
import { PO_ISSUES_TEXT } from '../../constants/poIssues'
import { PriceDifferences } from './PriceDifferences'
import { PRICE_DIFF_TEXT } from '../../constants/priceDifferences'
import { RejectedFailed } from './RejectedFailed'
import { ENDED_TEXT } from '../../constants/poReview'
import { useQuery } from '@tanstack/react-query'
import { BulkOrdersTab } from './BulkOrdersTab'
import { listTeamBulkOrders } from '../../api/bulkOrders'
import { BULK_TEXT, BULK_TYPES } from '../../constants/bulkOrders'

// PO issues (2026-10-29): moved here from Users & Roles, for everyone who can open this page
// Price differences (2026-10-30): lines kept at our price, to tell the channel
// Rejected & Failed (2026-11-02): the POs that ended without a sale order, with who / why
// Bulk Orders (2026-11-11): Marketing / Institutional orders from the Bulk Orders portal, read only for now
const TABS = ['processed', 'review', 'bulk', 'manual', 'issues', 'prices', 'ended'] as const
/** How often the Bulk Orders tab count (approved, waiting for us) is read again while the page is open (ms). */
const BULK_COUNT_MS = 2 * 60_000
type Tab = (typeof TABS)[number]
const SRC_ICON = { API: Zap, Webhook: Webhook, Email: Mail, Manual: FileUp } as const

export default function POProcessing() {
  // the tab is in the address (?tab=), so a refresh stays on it
  const [tab, setTab] = useUrlParam<Tab>(PATHS.PO_REVIEW, URL_PARAM.TAB, oneOf(TABS), 'processed')
  const [processedCount, setProcessedCount] = useState<number | undefined>()
  const [reviewCount, setReviewCount] = useState<number | undefined>()
  // Live (2026-10-15): when anyone submits, approves, rejects, or a new PO arrives, both lists reload quietly.
  const [liveTick, setLiveTick] = useState(0)
  const live = useLiveReview(REVIEW_LIVE.PO_REVIEW_BASE, useCallback(() => setLiveTick((n) => n + 1), []))
  const canEditRoot = useAuth().accessFor(PATHS.PO_REVIEW) === ACCESS.EDITOR
  // the Bulk Orders count on the tab even before it is opened: one small request (1 row + the waiting counts)
  const [bulkCount, setBulkCount] = useState<number | undefined>()
  const bulkWaiting = useQuery({
    queryKey: ['bulk', 'team-count'],
    queryFn: () => listTeamBulkOrders({ pageSize: 1 }).then((r) => BULK_TYPES.reduce((n, t) => n + (r.meta.waiting[t] ?? 0), 0)),
    refetchInterval: BULK_COUNT_MS,
  })
  const bulkShown = bulkCount ?? bulkWaiting.data
  return (
    <div className="space-y-5">
      <PageTitle title="PO Processing & Review" sub="Ingest from channel APIs, webhooks and email · resolve parser errors · upload what can't be automated" right={<LiveDot mode={live} />} />
      <SubTabs value={tab} onChange={setTab} tabs={[
        { key: 'processed', label: 'Processed', count: processedCount },
        { key: 'review', label: 'In Review', count: reviewCount, danger: !!reviewCount },
        { key: 'bulk', label: BULK_TEXT.TEAM_TAB, count: bulkShown },
        { key: 'manual', label: 'Manual Upload' },
        { key: 'issues', label: PO_ISSUES_TEXT.TAB },
        { key: 'prices', label: PRICE_DIFF_TEXT.TAB },
        { key: 'ended', label: ENDED_TEXT.TAB },
      ]} />
      {tab === 'processed' && <Processed onCount={setProcessedCount} liveTick={liveTick} />}
      {tab === 'review' && <InReview srcIcon={SRC_ICON} onCount={setReviewCount} liveTick={liveTick} />}
      {tab === 'bulk' && <BulkOrdersTab onCount={setBulkCount} canEdit={canEditRoot} />}
      {tab === 'manual' && <ManualUpload canEdit={canEditRoot} liveTick={liveTick} />}
      {tab === 'issues' && <PoIssues />}
      {tab === 'prices' && <PriceDifferences canEdit={canEditRoot} />}
      {tab === 'ended' && <RejectedFailed liveTick={liveTick} canEdit={canEditRoot} />}
    </div>
  )
}

// ---- Processed: completed POs from GET /po-review?status=completed ------------------------------

type ProcessedRow = {
  id: string; poNumber: string; channel: string; brand: string; poDate: string; processedAt: string
  lines: number | null; units: number | null; value: number | null; saleOrder: string; source: string; file: string
  /** Raw source value (api / email / manual) for the icon, and the subject the Source cell copies. */
  sourceKey: string; subject: string | null
  /** When it was processed (ISO): the Processed At header's Newest / Oldest sorts by this. */
  processedIso: string
  /** Uniware hand-off: the raw dates / names, its state label (filter + export) and days waiting. */
  handoff: Handoff; uniware: string; waitingDays: number
  /** Verification before Uniware (2026-10-22): state from GET /po-verify and its label (filter + export). */
  verify?: VerifyStateItem; check: string
}

const PCOLS: [string, keyof ProcessedRow, ColKind][] = [
  // Ingest ID left out of the screen and the download (user, 2026-10-16); rows still use it as their key.
  ['PO Number', 'poNumber', 'mono'], ['Channel', 'channel', 'text'], ['Brand', 'brand', 'text'],
  // PO Date next to Processed At (user, 2026-10-29)
  ['PO Date', 'poDate', 'date'], ['Processed At', 'processedAt', 'mono'], ['Lines', 'lines', 'num'], ['Units', 'units', 'num'], ['Value', 'value', 'money'], ['Sale order', 'saleOrder', 'mono'],
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
  id: r.uploadId, poNumber: r.poNumber ?? '', channel: r.channel ?? '', brand: r.brand ?? '', poDate: r.poDate ?? '', processedAt: istDateTime(r.completedAt), processedIso: r.completedAt ?? '',
  lines: r.lines, units: r.units, value: r.poValue, saleOrder: r.saleOrderCode ?? '', source: SOURCE_LABELS[r.source] ?? r.source, file: r.fileName, sourceKey: r.source, subject: r.subject,
  check: '',
})

const distinct = (rows: ProcessedRow[], k: keyof ProcessedRow) => [...new Set(rows.map((r) => String(r[k] ?? '')).filter(Boolean))].sort()

function Processed({ onCount, liveTick }: { onCount: (n: number) => void; liveTick: number }) {
  const [baseRows, setRows] = useState<ProcessedRow[]>([])
  // Verification (2026-10-22): states of the loaded POs; `required` false = the check is switched off on the server.
  // 2026-11-03: they come with the Processed list itself (item.verify), no separate GET /po-verify?uploadIds=<all>.
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
        const states = items.flatMap((i): VerifyStateItem[] => (i.verify ? [{ uploadId: i.uploadId, ...i.verify, state: i.verify.state as VerifyState }] : []))
        setVerify({ required: states.some((v) => v.required), items: new Map(states.map((v) => [v.uploadId, v])) })
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

  const rows = useMemo(() => baseRows.map((r) => {
    const v = verify.items.get(r.id)
    return { ...r, verify: v, check: v && verify.required ? CHECK_LABEL[v.state] : '' }
  }), [baseRows, verify])
  const toVerify = (r: ProcessedRow) => verify.required && r.verify?.state === VERIFY_STATE.TO_VERIFY

  // Bulk verify from a file (2026-11-02): the Processed download with Verified typed in its Check column, uploaded back;
  // read here, only the matching ids go to the server, BULK_MAX per call, one call after another.
  const fileInput = useRef<HTMLInputElement>(null)
  const [upload, setUpload] = useState<{ file: string; match: VerifyMatch } | null>(null)
  const [verifying, setVerifying] = useState<string | null>(null)
  const readVerified = async (file: File) => {
    setNote(null)
    setVerifying(VERIFY_UPLOAD.READING)
    try {
      const [table] = await sheetTables(await file.arrayBuffer())
      const match = matchVerified(table?.rows ?? [], rows.map((r) => ({
        id: r.id, saleOrder: r.saleOrder, poNumber: r.poNumber, channel: r.channel, toVerify: toVerify(r), verified: r.verify?.state === VERIFY_STATE.VERIFIED,
      })))
      if (!match) fail(VERIFY_UPLOAD.NO_CHECK_COLUMN)
      else if (!match.marked) fail(match.unclear.length ? `${VERIFY_UPLOAD.NONE_MARKED} ${VERIFY_UPLOAD.UNCLEAR(match.unclear)}` : VERIFY_UPLOAD.NONE_MARKED)
      else setUpload({ file: file.name, match })
    } catch (e) {
      fail(e instanceof Error ? e.message : String(e))
    } finally {
      setVerifying(null)
    }
  }
  // The Excel download's Check column gets a dropdown (Verified / To verify), so nobody has to type it (no spelling slips).
  const checkList = verify.required ? [{ col: 'check' as const, values: [...VERIFY_UPLOAD.DROPDOWN], prompt: VERIFY_UPLOAD.DROPDOWN_PROMPT }] : undefined
  const verifyUploaded = async () => {
    if (!upload) return
    const ids = upload.match.ids
    let verified = 0
    let skipped = 0
    try {
      for (const part of chunks(ids, VERIFY_UPLOAD.BULK_MAX)) {
        setVerifying(VERIFY_UPLOAD.VERIFYING(verified + skipped, ids.length))
        const r = await verifyMany(part, VERIFY_UPLOAD.REMARK(upload.file))
        verified += r.verified.length
        skipped += r.skipped.length
      }
      setUpload(null)
      done(VERIFY_UPLOAD.DONE(verified, skipped))
    } catch (e) {
      fail(e instanceof ApiError ? e.message : String(e))
      if (verified) setReload((n) => n + 1)
    } finally {
      setVerifying(null)
    }
  }

  const s = useSection<ProcessedRow>(rows, ['poNumber', 'id', 'file', 'saleOrder'])
  // Ticked rows (by id): CSV / Excel download only these; none ticked = every row shown. Rows that left the list drop out.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const picked = rows.filter((r) => selected.has(r.id))
  const channelOptions = useChannelOptions(distinct(rows, 'channel'))
  const defs: FilterDef[] = [
    { key: SORT_FILTER_KEY, label: LIST_FILTER.SORT, type: 'sort', options: [{ value: LIST_SORT.CHANNEL, label: LIST_FILTER.SORT_CHANNEL }], placeholder: LIST_FILTER.SORT_DEFAULT_PROCESSED },
    // the PO Date / Processed At header sort: only its chip here
    { key: DATE_SORT_KEY, label: LIST_FILTER.DATE_SORT, type: 'sort', options: LIST_FILTER.DATE_SORT_OPTIONS, inPanel: false },
    { key: 'channel', label: 'Channel', type: 'multi', options: channelOptions },
    // PO Date range (user, 2026-11-02; next to the Newest / Oldest header sort)
    // one from - to field (user, 2026-11-03); values stay poDateFrom / poDateTo
    { key: 'poDate', label: LIST_FILTER.PO_DATE, type: 'dateRange', fromKey: 'poDateFrom', toKey: 'poDateTo' },
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
  // Create in Uniware (2026-11-09): the latest request of every PO not in Uniware yet; checked again while some are working.
  const [creates, setCreates] = useState<{ enabled: boolean; byId: Map<string, UniwareCreateState> }>({ enabled: false, byId: new Map() })
  const [confirmCreate, setConfirmCreate] = useState(false)
  const notInUniware = useMemo(() => rows.filter((r) => stateOf(r.handoff) !== UNIWARE_STATE.UPLOADED).map((r) => r.id).slice(0, 500).join(','), [rows])
  const loadCreates = useCallback(async () => {
    try {
      const r = await uniwareCreateStates(notInUniware ? notInUniware.split(',') : [])
      setCreates({ enabled: r.enabled, byId: new Map(r.items.map((i) => [i.uploadId, i])) })
    } catch {
      // the button stays as it was; the list itself shows its own errors
    }
  }, [notInUniware])
  useEffect(() => { void loadCreates() }, [loadCreates])
  const working = [...creates.byId.values()].some((i) => i.status === UNIWARE_CREATE_STATUS.QUEUED || i.status === UNIWARE_CREATE_STATUS.CREATING)
  useEffect(() => {
    if (!working) return
    const t = setInterval(() => { void loadCreates() }, UNIWARE_CREATE_TEXT.POLL_MS)
    return () => clearInterval(t)
  }, [working, loadCreates])
  const isWorking = (r: ProcessedRow) => {
    const c = creates.byId.get(r.id)
    return !!c && (c.status === UNIWARE_CREATE_STATUS.QUEUED || c.status === UNIWARE_CREATE_STATUS.CREATING)
  }
  const creatable = picked.filter((r) => stateOf(r.handoff) !== UNIWARE_STATE.UPLOADED && !toVerify(r) && !isWorking(r))
  // Preview (2026-11-09): any ticked PO not in Uniware yet; the answer says per PO what would be sent or why not
  const [preview, setPreview] = useState<{ createEnabled: boolean; items: UniwarePreviewItem[] } | null>(null)
  const previewable = picked.filter((r) => stateOf(r.handoff) !== UNIWARE_STATE.UPLOADED)
  const runPreview = async () => {
    setBulkBusy(true)
    try {
      setPreview(await previewUniwareCreate(previewable.map((x) => x.id)))
    } catch (e) {
      fail(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBulkBusy(false)
    }
  }
  const runCreate = async () => {
    setConfirmCreate(false)
    setBulkBusy(true)
    try {
      const r = await createInUniware(creatable.map((x) => x.id))
      const name = (id: string) => rows.find((x) => x.id === id)?.poNumber ?? id
      done(UNIWARE_CREATE_TEXT.QUEUED(r.queued.length, r.refused.map((x) => `${name(x.uploadId)}: ${x.reason}`)))
      await loadCreates()
    } catch (e) {
      fail(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBulkBusy(false)
    }
  }
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
  // Header Newest / Oldest + Sort by channel (Filters panel): the table, the downloads and the line items follow this order.
  const ordered = useMemo(() => orderRows(s.filtered, s.filters, { poDate: (r) => r.poDate, processedAt: (r) => r.processedIso }), [s.filtered, s.filters])
  const linePos = picked.length ? picked : ordered
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
    { group: T.GROUP_TABLE(tableRows.length, picked.length > 0), label: T.EXCEL, onClick: () => void exportRowsExcel('processed_pos', PEXPORT, tableRows, checkList), disabled: !tableRows.length },
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
        primary={canEdit && (picked.length > 0 || verify.required) ? (
          <span className="pf-tab-in inline-flex flex-wrap gap-2">
            {verify.required && (
              <>
                <input ref={fileInput} type="file" accept={VERIFY_UPLOAD.ACCEPT} className="hidden" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void readVerified(f) }} />
                <button onClick={() => fileInput.current?.click()} disabled={!!verifying || bulkBusy} title={VERIFY_UPLOAD.BUTTON_HINT}
                  className="pf-press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border border-ok/50 px-3 text-[13px] font-semibold text-ok hover:bg-ok-soft disabled:opacity-60">
                  <ShieldCheck className="size-4" />{VERIFY_UPLOAD.BUTTON}
                </button>
              </>
            )}
            {picked.length > 0 && <button onClick={() => void bulk('csv')} disabled={bulkBusy || unverifiedPicked > 0} title={unverifiedPicked ? VERIFY_TEXT.BLOCKED(unverifiedPicked) : undefined} className="pf-press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-60">
              <DownloadIcon className="size-4" />{UNIWARE_TEXT.BULK_DOWNLOAD(picked.length)}
            </button>}
            {previewable.length > 0 && (
              <button onClick={() => void runPreview()} disabled={bulkBusy || previewable.length > UNIWARE_CREATE_TEXT.MAX}
                title={previewable.length > UNIWARE_CREATE_TEXT.MAX ? UNIWARE_CREATE_TEXT.TOO_MANY(UNIWARE_CREATE_TEXT.MAX) : UNIWARE_PREVIEW_TEXT.BUTTON_HINT}
                className="pf-press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border border-line px-3 text-[13px] font-semibold text-ink-900 hover:bg-alt disabled:opacity-60">
                <Eye className="size-4" />{UNIWARE_PREVIEW_TEXT.BUTTON(previewable.length)}
              </button>
            )}
            {creates.enabled && creatable.length > 0 && (
              <button onClick={() => setConfirmCreate(true)} disabled={bulkBusy || creatable.length > UNIWARE_CREATE_TEXT.MAX}
                title={creatable.length > UNIWARE_CREATE_TEXT.MAX ? UNIWARE_CREATE_TEXT.TOO_MANY(UNIWARE_CREATE_TEXT.MAX) : UNIWARE_CREATE_TEXT.BUTTON_HINT}
                className="pf-press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border border-primary px-3 text-[13px] font-semibold text-primary hover:bg-primary/10 disabled:opacity-60">
                <UploadIcon className="size-4" />{UNIWARE_CREATE_TEXT.BUTTON(creatable.length)}
              </button>
            )}
            {markable.length > 0 && (
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
      {preview && <UniwareCreatePreview items={preview.items} createEnabled={preview.createEnabled} onClose={() => setPreview(null)} />}
      {confirmCreate && creatable.length > 0 && (
        <div className="pf-tab-in space-y-2 rounded-[var(--radius)] border border-warn/50 bg-warn-soft px-3 py-2.5 text-[12.5px] text-ink-900">
          <div className="font-semibold">{UNIWARE_CREATE_TEXT.CONFIRM_TITLE(creatable.length)}</div>
          <div className="text-ink-600">{UNIWARE_CREATE_TEXT.CONFIRM_BODY}</div>
          <div className="flex gap-2">
            <button onClick={() => void runCreate()} disabled={bulkBusy} className="pf-press inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"><UploadIcon className="size-4" />{UNIWARE_CREATE_TEXT.CONFIRM}</button>
            <button onClick={() => setConfirmCreate(false)} className="rounded-[var(--radius)] px-3 text-[12.5px] text-ink-600 hover:bg-alt">{UNIWARE_CREATE_TEXT.CANCEL}</button>
          </div>
        </div>
      )}
      {verifying && <div className="pf-tab-in rounded-[var(--radius)] bg-alt px-3 py-2 text-[12.5px] text-ink-600">{verifying}</div>}
      {upload && !verifying && (
        <div className="pf-tab-in space-y-2 rounded-[var(--radius)] border border-ok/40 bg-ok-soft/40 px-3 py-2.5 text-[12.5px] text-ink-900">
          <div className="font-semibold">{VERIFY_UPLOAD.SUMMARY(upload.file, upload.match.marked)}</div>
          <ul className="list-disc space-y-0.5 pl-5 text-ink-600">
            <li className="font-semibold text-ok">{VERIFY_UPLOAD.WILL(upload.match.ids.length)}</li>
            {upload.match.alreadyVerified > 0 && <li>{VERIFY_UPLOAD.ALREADY(upload.match.alreadyVerified)}</li>}
            {upload.match.notNeeded > 0 && <li>{VERIFY_UPLOAD.NOT_NEEDED(upload.match.notNeeded)}</li>}
            {upload.match.notFound.length > 0 && <li className="text-warn">{VERIFY_UPLOAD.NOT_FOUND(upload.match.notFound)}</li>}
            {upload.match.unclear.length > 0 && <li className="text-warn">{VERIFY_UPLOAD.UNCLEAR(upload.match.unclear)}</li>}
          </ul>
          <div className="flex gap-2">
            <button onClick={() => void verifyUploaded()} disabled={!upload.match.ids.length} className="pf-press inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] bg-ok px-3 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50"><Check className="size-4" />{VERIFY_UPLOAD.CONFIRM(upload.match.ids.length)}</button>
            <button onClick={() => setUpload(null)} className="rounded-[var(--radius)] px-3 text-[12.5px] text-ink-600 hover:bg-alt">{VERIFY_UPLOAD.CANCEL}</button>
          </div>
        </div>
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
        <DataGrid cols={PCOLS} rows={ordered} rowKey={(r) => r.id} pageSize={LIST_PAGE_SIZE} pageSizeKey="processed" selected={selected} onSelectedChange={setSelected}
          // Newest / Oldest first from the PO Date and Processed At headers
          headFilter={(k) => (k === 'poDate' ? <ColumnSort filters={s.filters} setFilters={s.setFilters} field="poDate" title={LIST_FILTER.PO_DATE} />
            : k === 'processedAt' ? <ColumnSort filters={s.filters} setFilters={s.setFilters} field="processedAt" title={LIST_FILTER.PROCESSED_AT} /> : null)}
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
              label: UNIWARE_TEXT.COLUMN, render: (r) => <UniwareCell h={r.handoff} canEdit={canEdit} onDone={done} onError={fail} create={creates.byId.get(r.id)} />,
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

/** One clickable chip per state, all the same height (2026-11-10): Verified (green, who / when on hover), Optional (grey,
 * channel switch OFF), To verify (amber); click = open the check. In Uniware (marked before the check existed) = plain badge. */
const CHIP = 'pf-press inline-flex h-6 items-center gap-1 rounded-full px-2.5 text-[11px] font-semibold leading-none transition-[filter,box-shadow] duration-150 hover:brightness-95 hover:shadow-[0_0_0_1px_currentColor]'
function CheckCell({ row, canEdit, onOpen }: { row: ProcessedRow; canEdit: boolean; onOpen: () => void }) {
  const v = row.verify
  if (!v) return <span className="text-ink-400">—</span>
  if (v.state === VERIFY_STATE.NOT_NEEDED) return <Badge tone="neutral">{VERIFY_TEXT.NOT_NEEDED}</Badge>
  const action = canEdit ? VERIFY_TEXT.VERIFY : VERIFY_TEXT.VIEW
  if (v.state === VERIFY_STATE.VERIFIED) {
    return (
      <button type="button" onClick={onOpen} title={`${VERIFY_TEXT.BY(v.by, istDateTime(v.at))} · ${VERIFY_TEXT.CLICK_VIEW}`} className={`${CHIP} bg-ok-soft text-ok`}>
        <ShieldCheck className="size-3" />{VERIFY_TEXT.VERIFIED}
      </button>
    )
  }
  // Channel switched OFF (Users & Roles -> Settings): not locked; verifying is optional.
  if (v.state === VERIFY_STATE.NOT_REQUIRED) {
    return (
      <button type="button" onClick={onOpen} title={`${VERIFY_TEXT.OPTIONAL_HINT} · ${VERIFY_TEXT.CLICK_TO(action)}`} className={`${CHIP} bg-slate-100 text-slate-600`}>
        {VERIFY_TEXT.OPTIONAL}
      </button>
    )
  }
  return (
    <button type="button" onClick={onOpen} title={VERIFY_TEXT.CLICK_TO(action)} className={`${CHIP} bg-warn-soft text-warn`}>
      <AlertTriangle className="size-3" />{VERIFY_TEXT.TO_VERIFY}<ArrowRight className="size-3" />
    </button>
  )
}
