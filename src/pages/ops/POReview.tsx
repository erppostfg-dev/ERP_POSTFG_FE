import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { ComponentType } from 'react'
import { useChannelOptions } from '../../lib/channels'
import { AlertTriangle, Check, ExternalLink, Link2, Mail, RefreshCw, X } from 'lucide-react'
import { Badge, Button } from '../../components/ui'
import { DataGrid, DownloadMenu, FilterChips, FilterPanel, ColumnSort, SectionToolbar, applyFilters, exportRows, exportRowsExcel, inputCls, useSection, type FilterDef } from '../../components/kit'
import { Reveal } from '../../components/shell'
import type { ColKind } from '../../lib/ops'
import {
  getPoFile, getPoReview, listPoReview, recheckReview, rejectPo, submitPo,
  type LineCorrection, type Num, type PoReviewDetail, type PoReviewIssue, type PoReviewItem, type PoReviewLine, type ResubmitBody, type StillOpen,
} from '../../api/poReview'
import { ApiError } from '../../api/client'
import {
  ISSUE_FIELD, ISSUE_LABELS, ISSUE_STATUS, LINE_ITEMS_TEXT, LIST_FILTER, LIST_PAGE_SIZE, LIST_SORT, PO_REVIEW_MAX_PAGE_SIZE, PO_STATUS, FILE_VIEWER_TEXT, RECHECK_TEXT, REJECT_ONLY_ISSUES, REVIEW_ERROR, REVIEW_TEXT, SOURCE_LABELS, SUBMISSION_RETURNED, PRICE_ISSUES,
} from '../../constants/poReview'
import { PRICE_CHECK_TEXT, PRICE_CHOICE, TOTAL_TOLERANCE, type PriceChoice } from '../../constants/priceDifferences'
import { PriceCheck, type PriceRow } from './PriceCheck'
import { ACCESS } from '../../constants/auth'
import { PATHS } from '../../constants/pages'
import { useAuth } from '../../auth/AuthContext'
import { DATE_SORT_KEY, SORT_FILTER_KEY, orderRows } from '../../lib/listOrder'
import { istDateTime } from '../../lib/time'
import { SkuPicker } from './SkuPicker'
import { FileCell, SourceCell } from './SourceCells'
import { FileViewer } from '../../components/FileViewer'
import { CAPABILITY, REVIEW_EDIT_TEXT, editRules, fieldOpen, type LineField } from '../../constants/reviewEdit'

/*
 * In Review: POs that failed validation (GET /po-review?status=needs_review), oldest first, and the review panel
 * (GET /po-review/:uploadId) laid out as the Figma design: the PO document on the left, the parsed PO on the right
 * with the reviewer's corrections, then Submit for approval (2026-10-15: only when every issue is resolved and every
 * field filled; an approver creates the PO on the Approvals page) or Reject (directly). Editing needs editor access.
 */

type ReviewRow = {
  id: string; poNumber: string; channel: string; poDate: string; processedAt: string; lines: number | null; value: number | null
  openIssues: number; issueTypes: string[]; source: string; file: string
  subject: string | null
  /** When it was processed (ISO): the Processed At header's Newest / Oldest sorts by this. */
  processedIso: string
}

const RCOLS: [string, keyof ReviewRow, ColKind][] = [
  // Ingest ID left out of the screen and the download (user, 2026-10-16); rows still use it as their key.
  // PO Date, then Processed At; no Received At column (user, 2026-10-29: Processed At is enough; the review panel still shows it)
  ['PO Number', 'poNumber', 'mono'], ['Channel', 'channel', 'text'], ['PO Date', 'poDate', 'date'],
  ['Processed At', 'processedAt', 'mono'],
  ['Lines', 'lines', 'num'], ['Value', 'value', 'money'],
]

const toRow = (r: PoReviewItem): ReviewRow => ({
  id: r.uploadId, poNumber: r.poNumber ?? '', channel: r.channel ?? '', poDate: r.poDate ?? '', processedAt: istDateTime(r.processedAt), lines: r.lines, value: r.poValue,
  openIssues: r.openIssues, issueTypes: r.issueTypes, source: SOURCE_LABELS[r.source] ?? r.source, file: r.fileName, subject: r.subject,
  processedIso: r.processedAt ?? '',
})

const distinct = (values: string[]) => [...new Set(values.filter(Boolean))].sort()
const label = (type: string) => ISSUE_LABELS[type] ?? type
const box = 'rounded-[var(--radius)] border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-600'

export function InReview({ srcIcon, onCount, liveTick = 0 }: { srcIcon: Record<string, ComponentType<{ className?: string }>>; onCount: (n: number) => void; liveTick?: number }) {
  const [rows, setRows] = useState<ReviewRow[]>([])
  const [state, setState] = useState<{ loading: boolean; error?: string }>({ loading: true })
  const [reload, setReload] = useState(0)
  const [sel, setSel] = useState<ReviewRow | null>(null)
  const [notice, setNotice] = useState<string>()

  // Live reloads (liveTick) keep the rows on screen; only the first load shows "Loading…".
  const loaded = useRef(false)
  useEffect(() => {
    const ctrl = new AbortController()
    if (!loaded.current) setState({ loading: true })
    listPoReview({ status: PO_STATUS.NEEDS_REVIEW, pageSize: PO_REVIEW_MAX_PAGE_SIZE }, ctrl.signal)
      .then((items) => {
        const next = items.map(toRow)
        setRows(next)
        onCount(next.length)
        setState({ loading: false })
        loaded.current = true
      })
      .catch((e: unknown) => {
        if (ctrl.signal.aborted) return
        setState({ loading: false, error: e instanceof ApiError ? e.message : String(e) })
      })
    return () => ctrl.abort()
  }, [reload, liveTick, onCount])

  // Ticked rows (by id): CSV / Excel download only these; none ticked = every row shown. Rows that left the list drop out.
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const picked = rows.filter((r) => selected.has(r.id))

  // A row has several issue types, so the Issue filter is applied here; search and the other filters by the shared helper.
  const s = useSection<ReviewRow>(rows, ['poNumber', 'id', 'channel', 'file'])
  const { issue, ...others } = s.filters
  const shown = useMemo(() => {
    const q = s.q.trim().toLowerCase()
    const searched = q ? rows.filter((r) => [r.poNumber, r.id, r.channel, r.file].some((v) => v.toLowerCase().includes(q))) : rows
    const picked = Array.isArray(issue) ? issue : []
    const kept = applyFilters(searched, others).filter((r) => !picked.length || r.issueTypes.some((t) => picked.includes(label(t))))
    // Header Newest / Oldest, then Sort by channel (Filters panel); none = the queue order (oldest first)
    return orderRows(kept, others, { poDate: (r) => r.poDate, processedAt: (r) => r.processedIso })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, s.q, s.filters])
  const channelOptions = useChannelOptions(rows.map((r) => r.channel))
  const defs: FilterDef[] = [
    { key: 'channel', label: 'Channel', type: 'multi', options: channelOptions },
    { key: 'source', label: 'Source', type: 'multi', options: distinct(rows.map((r) => r.source)) },
    { key: 'issue', label: 'Issue', type: 'multi', options: distinct(rows.flatMap((r) => r.issueTypes.map(label))) },
    { key: SORT_FILTER_KEY, label: LIST_FILTER.SORT, type: 'sort', options: [{ value: LIST_SORT.CHANNEL, label: LIST_FILTER.SORT_CHANNEL }], placeholder: LIST_FILTER.SORT_DEFAULT_REVIEW },
    // the PO Date / Processed At header sort: only its chip here
    { key: DATE_SORT_KEY, label: LIST_FILTER.DATE_SORT, type: 'sort', options: LIST_FILTER.DATE_SORT_OPTIONS, inPanel: false },
  ]

  // Re-check after a master fix (2026-10-22): editors only; the result goes into the notice line.
  const { accessFor } = useAuth()
  const canEditList = accessFor(PATHS.PO_REVIEW) === ACCESS.EDITOR
  const [rechecking, setRechecking] = useState(false)
  const recheck = () => {
    setRechecking(true)
    recheckReview()
      .then((r) => { setNotice(RECHECK_TEXT.RESULT(r.issuesClosed, r.completed.length, r.partly)); setReload((n) => n + 1) })
      .catch((e: unknown) => setNotice(e instanceof ApiError ? e.message : String(e)))
      .finally(() => setRechecking(false))
  }

  // Created or rejected: the PO leaves this list (and the list is read again, someone else may have acted too).
  const done = (message: string) => {
    setSel(null)
    setNotice(message)
    setReload((n) => n + 1)
  }

  return (
    <div className="space-y-3">
      {notice && (
        <div className="flex items-center gap-2 rounded-[var(--radius)] border border-ok/30 bg-ok-soft px-4 py-2.5 text-[13px] text-ok">
          <Check className="size-4" />{notice}
          <button onClick={() => setNotice(undefined)} className="ml-auto text-ok/70 hover:text-ok"><X className="size-4" /></button>
        </div>
      )}
      <SectionToolbar q={s.q} setQ={s.setQ} placeholder="Search PO number, ingest ID, channel, file…" filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)} activeFilters={s.active}
        entity="In-review POs" onExport={(e) => exportRows('in_review', e, RCOLS, picked.length ? picked : shown)}
        // One Download button (2026-10-26): Excel by default, CSV under the arrow.
        exportMenu={
          <DownloadMenu label={LINE_ITEMS_TEXT.TABLE_BUTTON} title={LINE_ITEMS_TEXT.TABLE_ONLY_HINT} items={[
            { group: LINE_ITEMS_TEXT.GROUP_TABLE((picked.length ? picked : shown).length, picked.length > 0), label: LINE_ITEMS_TEXT.EXCEL, onClick: () => void exportRowsExcel('in_review', RCOLS, picked.length ? picked : shown) },
            { group: LINE_ITEMS_TEXT.GROUP_TABLE((picked.length ? picked : shown).length, picked.length > 0), label: LINE_ITEMS_TEXT.CSV, onClick: () => exportRows('in_review', 'csv', RCOLS, picked.length ? picked : shown) },
          ]} />
        }
        selectedCount={picked.length} onClearSelection={() => setSelected(new Set())}
        primary={canEditList && rows.length > 0 ? (
          <button onClick={recheck} disabled={rechecking} title={RECHECK_TEXT.HINT}
            className="pf-press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border border-primary/40 bg-surface px-3 text-[13px] font-semibold text-primary hover:bg-primary-soft disabled:opacity-60">
            <RefreshCw className={`size-4 ${rechecking ? 'animate-spin' : ''}`} />{rechecking ? RECHECK_TEXT.BUSY : RECHECK_TEXT.BUTTON}
          </button>
        ) : undefined} />
      <Reveal open={s.open}><FilterPanel defs={defs} value={s.filters} onApply={s.setFilters} onClose={() => s.setOpen(false)} /></Reveal>
      {!s.open && <FilterChips defs={defs} value={s.filters} onChange={s.setFilters} />}
      {state.error ? (
        <div className="flex items-center gap-3 rounded-[var(--radius)] border border-crit/30 bg-crit-soft px-4 py-3 text-[13px] text-crit">
          <AlertTriangle className="size-4" /> Could not load POs in review: {state.error}
          <button onClick={() => setReload((n) => n + 1)} className="ml-auto font-semibold">Retry</button>
        </div>
      ) : state.loading ? (
        <div className={box}>Loading POs in review…</div>
      ) : !rows.length ? (
        <div className={box}>No POs are waiting for review.</div>
      ) : (
        <DataGrid cols={RCOLS} rows={shown} rowKey={(r) => r.id} pageSize={LIST_PAGE_SIZE} onRowClick={setSel} selected={selected} onSelectedChange={setSelected}
          // Newest / Oldest first from the PO Date and Processed At headers
          headFilter={(k) => (k === 'poDate' ? <ColumnSort filters={s.filters} setFilters={s.setFilters} field="poDate" title={LIST_FILTER.PO_DATE} />
            : k === 'processedAt' ? <ColumnSort filters={s.filters} setFilters={s.setFilters} field="processedAt" title={LIST_FILTER.PROCESSED_AT} /> : null)}
          rowClass={() => '[&>td:first-child]:shadow-[inset_3px_0_0_var(--color-crit)]'}
          trailing={[
            { label: 'Issues', render: (r) => <span className="flex flex-wrap gap-1">{r.issueTypes.map((t) => <Badge key={t} tone="crit">{label(t)}</Badge>)}</span> },
            { label: 'Open issues', render: (r) => <span className="tnum text-crit">{r.openIssues}</span> },
            { label: 'Source', render: (r) => <SourceCell source={r.source} subject={r.subject} fallback={r.poNumber} icon={srcIcon[r.source] ?? Mail} /> },
            { label: 'Original file', render: (r) => <FileCell uploadId={r.id} name={r.file} /> },
            // A button (not text): one click opens the review panel, the same as a double-click, instead of being copied.
            { label: '', render: (r) => (
              <button type="button" onClick={() => setSel(r)}
                className="pf-press group/rv inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[12px] font-semibold text-primary transition-colors duration-150 hover:bg-primary-soft">
                Review <span className="transition-transform duration-200 group-hover/rv:translate-x-0.5">→</span>
              </button>
            ) },
          ]} />
      )}
      {sel && <ReviewPanel uploadId={sel.id} poNumber={sel.poNumber} onClose={() => setSel(null)} onDone={done} onStale={() => setReload((n) => n + 1)}
        gone={!state.loading && !state.error && !rows.some((r) => r.id === sel.id)} />}
    </div>
  )
}

// ---- Review panel ---------------------------------------------------------------------------------------------------

/** The review panel's open / close animation (ms), the same as .pf-panel-in / -out in index.css. */
const PANEL_MS = 220

const money = (v: Num | number) => (v === '' ? '—' : `₹${Number(v).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`)
const plain = (v: Num | string | null | undefined) => (v === '' || v === null || v === undefined ? '' : String(v))
const differs = (a: Num | number, b: Num | number) => a !== '' && b !== '' && Math.abs(Number(a) - Number(b)) >= 0.01
const numOrEmpty = (v: string): Num => (v.trim() === '' || !Number.isFinite(Number(v)) ? '' : Number(v))

/** What the reviewer has typed for one line (strings, as the inputs hold them). */
type LineEdit = { pep: string; qty: string; mrp: string; rate: string }
const lineKey = (l: PoReviewLine) => String(l.lineNo)
const startOf = (l: PoReviewLine): LineEdit => ({ pep: l.pepCode, qty: plain(l.qty), mrp: plain(l.poMrp), rate: plain(l.poUnitPrice) })

function ReviewPanel({ uploadId, poNumber, onClose: closeNow, onDone, onStale, gone = false }: {
  uploadId: string; poNumber: string; onClose: () => void; onDone: (message: string) => void; onStale: () => void
  /** The live list no longer has this PO: someone else submitted or rejected it meanwhile. */
  gone?: boolean
}) {
  // Opens with a short rise + fade and closes the same way (user, 2026-10-16: smooth both ways); X, Close and Esc wait for it.
  const [leaving, setLeaving] = useState(false)
  const onClose = useCallback(() => { setLeaving(true); setTimeout(closeNow, PANEL_MS) }, [closeNow])
  const { accessFor, can } = useAuth()
  const canEdit = accessFor(PATHS.PO_REVIEW) === ACCESS.EDITOR
  // Only the values with an error, unless the role has "PO Review: edit all fields" (2026-10-22; server checks too).
  const editAll = can(CAPABILITY.PO_REVIEW_EDIT_ALL)
  const [data, setData] = useState<PoReviewDetail | null>(null)
  const [error, setError] = useState<string>()
  const [edits, setEdits] = useState<Record<string, LineEdit>>({})
  const [locationId, setLocationId] = useState('')
  const [accepted, setAccepted] = useState<Set<string>>(new Set())
  const [remark, setRemark] = useState('')
  const [rejecting, setRejecting] = useState(false)
  const [rejectRemark, setRejectRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [actionError, setActionError] = useState<{ message: string; stillOpen?: StillOpen['openIssues'] }>()
  // price check (2026-10-30): lineNo -> ours / channel for its MRP and price together (ours to start); lines whose master takes the PO's values
  const [choices, setChoices] = useState<Record<string, PriceChoice>>({})
  const [master, setMaster] = useState<Set<string>>(new Set())

  useEffect(() => {
    const ctrl = new AbortController()
    getPoReview(uploadId, ctrl.signal)
      .then((d) => {
        setData(d)
        setEdits(Object.fromEntries(d.lines.map((l) => [lineKey(l), startOf(l)])))
        setChoices(Object.fromEntries(d.issues.filter((i) => i.status === ISSUE_STATUS.OPEN && PRICE_ISSUES[i.type] && i.lineNo !== null)
          .map((i) => [String(i.lineNo), PRICE_CHOICE.OURS])))
      })
      .catch((e: unknown) => !ctrl.signal.aborted && setError(e instanceof ApiError ? e.message : String(e)))
    return () => ctrl.abort()
  }, [uploadId])

  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', k)
    return () => document.removeEventListener('keydown', k)
  }, [onClose])

  const open = useMemo(() => data?.issues.filter((i) => i.status === ISSUE_STATUS.OPEN) ?? [], [data])
  const original = useMemo(() => new Map(data?.lines.map((l) => [lineKey(l), startOf(l)]) ?? []), [data])
  const changed = (l: PoReviewLine) => {
    const a = edits[lineKey(l)], b = original.get(lineKey(l))
    return !!a && !!b && (a.pep !== b.pep || a.qty !== b.qty || a.mrp !== b.mrp || a.rate !== b.rate)
  }
  const anyLineChanged = !!data?.lines.some(changed)
  const picked = data?.locationCandidates.find((c) => c.detailsChannelId === locationId)
  const location = picked ?? data?.location ?? null
  const sku = (pep: string) => data?.skuOptions.find((o) => o.pepCode === pep)


  // Price check rows: one per line with an open price and / or MRP mismatch (one decision for both: an MRP difference
  // nearly always brings the price with it), with what the PO says now (a misread corrected above counts)
  const priceRows: PriceRow[] = (data?.lines ?? []).flatMap((l) => {
    const kinds = new Set(open.filter((i) => PRICE_ISSUES[i.type] && String(i.lineNo) === lineKey(l)).map((i) => PRICE_ISSUES[i.type]))
    if (!kinds.size) return []
    const e = edits[lineKey(l)]
    return [{
      lineNo: lineKey(l), sku: l.skuName || l.description, code: l.channelSkuCode,
      ...(kinds.has('mrp') ? { mrp: { ours: l.ourMrp, channel: numOrEmpty(e?.mrp ?? '') } } : {}),
      ...(kinds.has('price') ? { price: { ours: l.ourRate, channel: numOrEmpty(e?.rate ?? '') } } : {}),
    }]
  })
  // The PO total after the choices: the line totals as the PO prints them vs its unit prices (the rest is explained by
  // the lines kept at our price); the same rule as the backend (0.02% of the value, at least Rs 10).
  const chargedOf = (l: PoReviewLine) => { const q = numOrEmpty(edits[lineKey(l)]?.qty ?? ''); return q === '' ? 0 : q - (l.freeQty === '' ? 0 : Number(l.freeQty)) }
  const printedTotal = data?.lines.reduce((s, l) => s + (changed(l) || l.poLineValue === '' ? chargedOf(l) * Number(numOrEmpty(edits[lineKey(l)]?.rate ?? '') || 0) : Number(l.poLineValue)), 0) ?? 0
  const chosenTotal = data?.lines.reduce((s, l) => {
    const rate = choices[lineKey(l)] === PRICE_CHOICE.CHANNEL ? Number(numOrEmpty(edits[lineKey(l)]?.rate ?? '') || 0) : Number(l.ourRate || 0)
    return s + chargedOf(l) * rate
  }, 0) ?? 0
  const explained = data?.lines.reduce((s, l) => s + (choices[lineKey(l)] === PRICE_CHOICE.OURS ? chargedOf(l) * (Number(numOrEmpty(edits[lineKey(l)]?.rate ?? '') || 0) - Number(l.ourRate || 0)) : 0), 0) ?? 0
  const left = Math.round((printedTotal - chosenTotal - explained) * 100) / 100
  const totalLeft = Math.abs(left) > Math.max(TOTAL_TOLERANCE.MIN, (chosenTotal * TOTAL_TOLERANCE.PERCENT) / 100) ? left : null
  const totalIssue = open.find((i) => i.field === ISSUE_FIELD.PO_VALUE)
  const totalNeedsRemark = !!totalIssue && accepted.has(totalIssue.issueId) && !remark.trim()

  // An issue counts as handled when it is accepted, or the part it is about was corrected. The backend checks again on
  // Submit and answers with whatever is still open.
  const handled = (i: PoReviewIssue): boolean => {
    if (accepted.has(i.issueId)) return true
    if (REJECT_ONLY_ISSUES.includes(i.type)) return false
    // a price / MRP mismatch is decided in the Price check (ours or the channel's)
    if (PRICE_ISSUES[i.type] && i.lineNo !== null && choices[String(i.lineNo)]) return true
    if (i.field === ISSUE_FIELD.PO_VALUE && priceRows.length && totalLeft === null) return true
    if (i.field === ISSUE_FIELD.DELIVERY_LOCATION) return !!picked
    if (i.lineNo !== null) {
      const l = data?.lines.find((x) => String(x.lineNo) === String(i.lineNo))
      return !!l && changed(l) && !!edits[lineKey(l)]?.pep
    }
    return i.field === ISSUE_FIELD.PO_VALUE && anyLineChanged
  }
  const unresolved = open.filter((i) => !handled(i))
  const rejectOnly = open.some((i) => REJECT_ONLY_ISSUES.includes(i.type))
  const headerIssue = (field: string) => open.find((i) => i.lineNo === null && i.field === field)
  const rules = useMemo(() => editRules(open), [open])
  const editable = (l: PoReviewLine, f: LineField) => canEdit && (editAll || fieldOpen(rules, lineKey(l), f))
  const lockTip = (l: PoReviewLine, f: LineField) => (canEdit && !editable(l, f) ? REVIEW_EDIT_TEXT.LOCKED : undefined)
  const lineIssues = (l: PoReviewLine) => open.filter((i) => i.lineNo !== null && String(i.lineNo) === String(l.lineNo))
  const stillOpenOn = (l: PoReviewLine) => actionError?.stillOpen?.filter((i) => i.lineNo !== null && String(i.lineNo) === String(l.lineNo)) ?? []
  // Issues not shown next to a field or a line: listed (and accepted) in "Other checks".
  const shownAtField = new Set<string>([ISSUE_FIELD.DELIVERY_LOCATION, ISSUE_FIELD.PO_NUMBER, ISSUE_FIELD.EXPIRY_DATE, ISSUE_FIELD.PO_TYPE, ISSUE_FIELD.PO_VALUE])
  const otherIssues = open.filter((i) => i.canAccept || (i.lineNo === null && !shownAtField.has(i.field ?? '')))

  const total = (pick: (e: LineEdit, l: PoReviewLine) => Num) =>
    data?.lines.reduce<number | ''>((sum, l) => {
      const e = edits[lineKey(l)]
      const charged = numOrEmpty(e?.qty ?? '')
      const price = e ? pick(e, l) : ''
      if (sum === '' || charged === '' || price === '') return ''
      return sum + (charged - (l.freeQty === '' ? 0 : Number(l.freeQty))) * price
    }, 0) ?? ''
  const linesTotal = total((e) => numOrEmpty(e.rate))
  const ourTotal = total((e, l) => { const o = sku(e.pep); return o?.rate ?? (e.pep === l.pepCode ? l.ourRate : '') })

  const mapped = data ? data.lines.filter((l) => edits[lineKey(l)]?.pep).length : 0
  const checks = data
    ? [
        { ok: !!location?.customerCode, label: location?.customerCode ? 'Customer matched' : 'Customer not matched' },
        { ok: mapped === data.lines.length, label: `${mapped} of ${data.lines.length} SKUs matched` },
        { ok: !!location?.facilityCode, label: location?.facilityCode ? 'Facility resolved' : 'Facility not resolved' },
      ]
    : []

  // Submit stays off until every issue is resolved AND every field is filled (user, 2026-10-15); the reasons are shown.
  const blockers = data
    ? [
        ...(unresolved.length ? [`${unresolved.length} issue${unresolved.length > 1 ? 's' : ''} to resolve`] : []),
        ...(totalNeedsRemark ? [PRICE_CHECK_TEXT.TOTAL_REMARK] : []),
        ...checks.filter((c) => !c.ok).map((c) => c.label),
      ]
    : []
  const returned = data?.lastSubmission?.status === SUBMISSION_RETURNED ? data.lastSubmission : null

  const fail = (e: unknown) => {
    if (e instanceof ApiError && e.code === REVIEW_ERROR.NOT_IN_REVIEW) onStale()
    const stillOpen = e instanceof ApiError && e.code === REVIEW_ERROR.INCOMPLETE ? (e.details as StillOpen | undefined)?.openIssues : undefined
    setActionError({ message: e instanceof ApiError ? e.message : String(e), stillOpen })
  }

  const submit = () => {
    if (!data) return
    const lines: LineCorrection[] = []
    for (const l of data.lines) {
      const e = edits[lineKey(l)], o = original.get(lineKey(l))
      if (!e || !o || !changed(l)) continue
      const c: LineCorrection = { lineNo: lineKey(l) }
      if (e.pep !== o.pep) c.pepCode = e.pep
      if (e.qty !== o.qty && numOrEmpty(e.qty) !== '') c.qty = Number(e.qty)
      if (e.mrp !== o.mrp && numOrEmpty(e.mrp) !== '') c.mrp = Number(e.mrp)
      if (e.rate !== o.rate && numOrEmpty(e.rate) !== '') c.rate = Number(e.rate)
      lines.push(c)
    }
    // price check choices (every decided line is sent, changed or not)
    for (const r of priceRows) {
      const choice = choices[r.lineNo]
      if (!choice) continue
      let c = lines.find((x) => x.lineNo === r.lineNo)
      if (!c) { c = { lineNo: r.lineNo }; lines.push(c) }
      if (r.price) c.priceFrom = choice
      if (r.mrp) c.mrpFrom = choice
      if (choice === PRICE_CHOICE.CHANNEL && master.has(r.lineNo)) c.updateMaster = true
    }
    const body: ResubmitBody = {
      ...(picked ? { location: { detailsChannelId: picked.detailsChannelId } } : {}),
      lines,
      accept: [...accepted].map((issueId) => ({ issueId, remark: remark.trim() || undefined })),
      remark: remark.trim() || undefined,
    }
    setBusy(true)
    setActionError(undefined)
    submitPo(uploadId, body)
      .then(() => onDone(REVIEW_TEXT.SUBMITTED(data.po.poNumber || poNumber)))
      .catch(fail)
      .finally(() => setBusy(false))
  }

  const reject = () => {
    if (!rejectRemark.trim()) return
    setBusy(true)
    setActionError(undefined)
    rejectPo(uploadId, rejectRemark.trim())
      .then(() => onDone(REVIEW_TEXT.REJECTED(data?.po.poNumber || poNumber)))
      .catch(fail)
      .finally(() => setBusy(false))
  }

  const lab = 'mb-1 block text-[12px] font-medium text-ink-900'
  const Sec = ({ children }: { children: string }) => <div className="mb-3 mt-5 flex items-center gap-3 font-serif text-[12px] uppercase tracking-[0.08em] text-ink-600 first:mt-0">{children}<span className="h-px flex-1 bg-line" /></div>
  const field = ({ title, value, issueField, mono, req }: { title: string; value: string; issueField?: string; mono?: boolean; req?: boolean }) => {
    const issue = issueField ? headerIssue(issueField) : undefined
    const bad = !!issue && !handled(issue)
    return (
      <label className="block">
        <span className={lab}>{title}{req && <span className="text-crit"> *</span>}</span>
        <input readOnly value={value} className={`${inputCls} ${mono ? 'font-mono' : ''} ${bad ? 'border-crit/60 bg-crit-soft' : ''}`} />
        {issue && <span className={`mt-1 block text-[11px] ${bad ? 'text-crit' : 'text-ink-400'}`}>{issue.details ?? label(issue.type)}{!bad && ' — accepted'}</span>}
      </label>
    )
  }
  const numInput = (l: PoReviewLine, k: 'qty' | 'mrp' | 'rate', ours?: Num | number | null) => {
    const e = edits[lineKey(l)]
    const v = e?.[k] ?? ''
    const off = ours !== undefined && ours !== null && differs(numOrEmpty(v), ours)
    return (
      <>
        <input type="number" step="any" min={0} value={v} disabled={!editable(l, k)} title={lockTip(l, k)} onChange={(ev) => setEdits({ ...edits, [lineKey(l)]: { ...e, [k]: ev.target.value } })}
          className={`tnum h-8 w-24 rounded-md border px-2 ${off ? 'border-crit/60 bg-crit-soft' : 'border-line'} disabled:cursor-not-allowed disabled:bg-alt disabled:text-ink-600`} />
        {ours !== undefined && ours !== null && ours !== '' && <div className={`mt-0.5 text-[11px] ${off ? 'text-crit' : 'text-ink-400'}`}>ours {ours}</div>}
      </>
    )
  }

  return (
    <div className={`fixed inset-0 z-50 flex flex-col bg-surface ${leaving ? 'pf-panel-out' : 'pf-panel-in'}`}>
      <div className="flex items-start justify-between border-b border-line px-5 py-3">
        <div>
          <div className="flex items-baseline gap-2">
            <h2 className="font-serif text-[22px] font-medium">Review</h2>
            <span className="font-mono text-[15px] text-primary">{data?.po.poNumber || poNumber}</span>
            {data && <span className="font-serif text-[14px] text-ink-600">{data.lines.length} line items</span>}
          </div>
          <p className="text-[12px] text-ink-600">{canEdit ? REVIEW_TEXT.INTRO : REVIEW_TEXT.VIEW_ONLY}</p>
          {canEdit && <p className="mt-0.5 text-[11.5px] text-ink-400">{editAll ? REVIEW_EDIT_TEXT.EDIT_ALL : REVIEW_EDIT_TEXT.ONLY_ERRORS}</p>}
        </div>
        <button onClick={onClose} className="rounded-md p-1.5 text-ink-400 hover:bg-alt hover:text-ink-900"><X className="size-5" /></button>
      </div>

      {error ? (
        <div className="m-5 flex items-center gap-3 rounded-[var(--radius)] border border-crit/30 bg-crit-soft px-4 py-3 text-[13px] text-crit"><AlertTriangle className="size-4" /> Could not load this PO: {error}</div>
      ) : !data ? (
        <div className="m-5 text-[13px] text-ink-600">Loading the PO…</div>
      ) : (
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
          {/* Document viewer: the PO file from S3 through a short-lived link */}
          <div className="hidden min-h-0 flex-col gap-2 p-3 lg:flex">
            <DocumentViewer data={data} />
            <div className="truncate px-1 text-[11.5px] text-ink-600">
              {data.upload.emailFrom && <>From <span className="text-ink-900">{data.upload.emailFrom}</span> · </>}
              {data.upload.emailSubject && <><span className="text-ink-900">{data.upload.emailSubject}</span> · </>}
              Received <span className="tnum text-ink-900">{istDateTime(data.upload.receivedAt)}</span>
            </div>
          </div>

          {/* Parsed form */}
          <div className="min-h-0 overflow-y-auto px-5 py-4">
            <Sec>Purchase order</Sec>
            <div className="grid gap-3 sm:grid-cols-3">
              {field({ title: 'PO Number', value: data.po.poNumber, issueField: ISSUE_FIELD.PO_NUMBER, mono: true, req: true })}
              {field({ title: 'PO Date', value: data.po.poDate })}
              {field({ title: 'PO Expiry', value: data.po.expiryDate, issueField: ISSUE_FIELD.EXPIRY_DATE })}
              {field({ title: 'Channel', value: data.upload.channel ?? '', req: true })}
              {field({ title: 'PO Type', value: data.po.poType + (data.po.revised ? ' (revised)' : ''), issueField: ISSUE_FIELD.PO_TYPE })}
              {field({ title: 'PO Value', value: money(data.po.poValue), issueField: ISSUE_FIELD.PO_VALUE })}
            </div>

            <Sec>Where it's going</Sec>
            <div className="grid gap-3 sm:grid-cols-2">
              {field({ title: 'Customer code', value: location?.customerCode ?? '', mono: true, req: true })}
              {data.locationCandidates.length > 0 ? (
                <label className="block">
                  <span className={lab}>Delivery location</span>
                  <select value={locationId} disabled={!canEdit || !(editAll || rules.location)} title={canEdit && !(editAll || rules.location) ? REVIEW_EDIT_TEXT.LOCKED : undefined} onChange={(e) => setLocationId(e.target.value)}
                    className={`${inputCls} ${picked ? '' : 'border-crit/60 bg-crit-soft'}`}>
                    <option value="">Pick the location…</option>
                    {data.locationCandidates.map((c) => <option key={c.detailsChannelId} value={c.detailsChannelId}>{[c.locationCode, c.pincode].filter(Boolean).join(' · ')}</option>)}
                  </select>
                  <span className={`mt-1 block text-[11px] ${picked ? 'text-ink-400' : 'text-crit'}`}>PO says: <b className="font-mono">{data.po.deliveryFacility || '—'}</b>{!picked && headerIssue(ISSUE_FIELD.DELIVERY_LOCATION) && ` — ${headerIssue(ISSUE_FIELD.DELIVERY_LOCATION)!.details ?? label('LOCATION_NOT_MAPPED')}`}</span>
                </label>
              ) : field({ title: 'Delivery location', value: location?.locationCode ?? data.po.deliveryFacility, issueField: ISSUE_FIELD.DELIVERY_LOCATION })}
              {field({ title: 'Pincode', value: data.po.pincode, mono: true })}
              {field({ title: 'Fulfilment facility', value: location?.facilityCode ?? '', mono: true, req: true })}
            </div>

            {priceRows.length > 0 && (
              <>
                <Sec>{PRICE_CHECK_TEXT.TITLE(priceRows.length)}</Sec>
                <PriceCheck rows={priceRows} choices={choices} canEdit={canEdit} master={master}
                  onChoose={(lineNos, choice) => setChoices((cur) => ({ ...cur, ...Object.fromEntries(lineNos.map((k) => [k, choice])) }))}
                  onMaster={(lineNo, on) => setMaster((cur) => { const next = new Set(cur); if (on) next.add(lineNo); else next.delete(lineNo); return next })}
                  totals={{ po: money(printedTotal), chosen: money(chosenTotal), explained: Math.abs(explained) >= 0.01 ? money(explained) : null, left: totalLeft === null ? null : money(totalLeft) }} />
              </>
            )}

            <Sec>Line items</Sec>
            <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
              <table className="w-full text-[12.5px]">
                <thead className="bg-alt"><tr>{['#', 'Channel SKU', 'Internal SKU', 'Qty', 'MRP', 'Rate'].map((h) => <th key={h} className="px-2.5 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600">{h}</th>)}</tr></thead>
                <tbody>
                  {data.lines.map((l) => {
                    const e = edits[lineKey(l)]
                    const errs = lineIssues(l)
                    const still = stillOpenOn(l)
                    const fixed = errs.length > 0 && errs.every(handled) && !still.length
                    const o = e ? sku(e.pep) : undefined
                    const ourMrp = o?.mrp ?? (e?.pep === l.pepCode ? l.ourMrp : null)
                    const ourRate = o?.rate ?? (e?.pep === l.pepCode ? l.ourRate : null)
                    return (
                      <tr key={lineKey(l)} className={`border-t border-line align-top ${(errs.length && !fixed) || still.length ? 'bg-crit-soft/50' : ''}`}>
                        <td className="tnum px-2.5 py-2 text-ink-400">{plain(l.lineNo)}</td>
                        <td className="px-2.5 py-2"><div className="font-mono">{l.channelSkuCode || '—'}</div><div className="max-w-[200px] truncate text-[11px] text-ink-600" title={l.description}>{l.description}</div></td>
                        <td className="px-2.5 py-2">
                          <SkuPicker value={e?.pep ?? ''} options={data.skuOptions} disabled={!editable(l, 'pep')} invalid={!e?.pep}
                            onChange={(pep) => setEdits({ ...edits, [lineKey(l)]: { ...e, pep } })} />
                          {(o?.skuName ?? (e?.pep === l.pepCode ? l.skuName : '')) && <div className="mt-0.5 max-w-[220px] truncate text-[11px] text-ink-600">{o?.skuName ?? l.skuName}</div>}
                          {e?.pep === l.pepCode && l.punchCode && l.punchCode !== l.pepCode && <div className="mt-0.5 font-mono text-[11px] text-ink-600" title={REVIEW_TEXT.PUNCHED_AS_TIP}>{REVIEW_TEXT.PUNCHED_AS(l.punchCode)}</div>}
                          {errs.map((i) => (
                            <div key={i.issueId} className={`mt-1 flex items-start gap-1 text-[11px] ${handled(i) && !still.length ? 'text-ink-400' : 'text-crit'}`}>
                              {handled(i) && !still.length && <Check className="mt-px size-3 shrink-0 text-ok" />}
                              <span className={handled(i) && !still.length ? 'line-through' : ''}>{i.details ?? label(i.type)}</span>
                            </div>
                          ))}
                          {still.map((i, n) => <div key={n} className="mt-1 text-[11px] font-medium text-crit">Still open: {i.message}</div>)}
                        </td>
                        <td className="px-2.5 py-2">{numInput(l, 'qty')}{l.freeQty !== '' && Number(l.freeQty) > 0 && <div className="mt-0.5 text-[11px] text-ink-600">{l.freeQty} free</div>}</td>
                        <td className="px-2.5 py-2">{numInput(l, 'mrp', ourMrp)}</td>
                        <td className="px-2.5 py-2">{numInput(l, 'rate', ourRate)}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
            <div className="mt-2 text-right text-[12px] text-ink-600">
              Lines total <span className="tnum font-semibold text-ink-900">{money(linesTotal)}</span>
              {' · '}at our rates <span className={`tnum font-semibold ${differs(linesTotal, ourTotal) ? 'text-crit' : 'text-ink-900'}`}>{money(ourTotal)}</span>
            </div>

            {otherIssues.length > 0 && (
              <>
                <Sec>Other checks</Sec>
                <ul className="space-y-2">
                  {otherIssues.map((i) => (
                    <li key={i.issueId} className={`flex items-start gap-3 rounded-md border px-3 py-2 text-[12.5px] ${handled(i) ? 'border-line bg-alt' : 'border-crit/30 bg-crit-soft'}`}>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2"><Badge tone={handled(i) ? 'neutral' : 'crit'}>{label(i.type)}</Badge>{i.lineNo !== null && <span className="text-ink-600">Line {i.lineNo}</span>}<ResolvedMark ok={handled(i)} /></div>
                        {i.details && <div className="mt-1 text-ink-900">{i.details}</div>}
                      </div>
                      {i.canAccept && canEdit && (
                        <label className="flex shrink-0 cursor-pointer items-center gap-1.5 pt-0.5 text-[12px] font-medium text-ink-900">
                          <input type="checkbox" checked={accepted.has(i.issueId)} onChange={(e) => {
                            const next = new Set(accepted)
                            if (e.target.checked) next.add(i.issueId); else next.delete(i.issueId)
                            setAccepted(next)
                          }} />
                          Accept
                        </label>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}

            {data.warnings.length > 0 && (
              <>
                <Sec>OCR warnings</Sec>
                <ul className="space-y-1 text-[12px] text-warn">{data.warnings.map((w, n) => <li key={n}>{w.message}</li>)}</ul>
              </>
            )}

            {canEdit && (
              <>
                <Sec>Remark</Sec>
                <textarea value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={500} rows={2} placeholder={REVIEW_TEXT.REMARK}
                  className={`${inputCls.replace('h-9', '')} py-2`} />
              </>
            )}
          </div>
        </div>
      )}

      {gone && (
        <div className="pf-tab-in flex items-start gap-2 border-t border-warn/30 bg-warn-soft px-5 py-2.5 text-[12.5px] text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" /><div>{REVIEW_TEXT.GONE}</div>
        </div>
      )}

      {returned && !actionError && (
        <div className="flex items-start gap-2 border-t border-warn/30 bg-warn-soft px-5 py-2.5 text-[12.5px] text-warn">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>{REVIEW_TEXT.RETURNED(returned.decidedAt ? istDateTime(returned.decidedAt) : '', returned.remark ?? '')}</div>
        </div>
      )}

      {actionError && (
        <div className="flex items-start gap-2 border-t border-crit/30 bg-crit-soft px-5 py-2.5 text-[12.5px] text-crit">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <div>
            <div className="font-medium">{actionError.message}</div>
            {actionError.stillOpen?.filter((i) => i.lineNo === null).map((i, n) => <div key={n}>{label(i.type)}: {i.message}</div>)}
          </div>
          <button onClick={() => setActionError(undefined)} className="ml-auto"><X className="size-4" /></button>
        </div>
      )}

      {rejecting ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          <input autoFocus value={rejectRemark} onChange={(e) => setRejectRemark(e.target.value)} maxLength={500} placeholder={REVIEW_TEXT.REJECT_PROMPT}
            onKeyDown={(e) => e.key === 'Enter' && reject()} className={`${inputCls} min-w-[260px] flex-1`} />
          <Button onClick={() => setRejecting(false)} disabled={busy}>Cancel</Button>
          <button onClick={reject} disabled={busy || !rejectRemark.trim()}
            className="inline-flex items-center gap-1.5 rounded-md border border-transparent bg-crit px-3 py-1.5 text-xs font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
            {busy ? 'Rejecting…' : REVIEW_TEXT.REJECT}
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 border-t border-line px-5 py-3">
          {checks.map((c) => (
            <span key={c.label} className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] ${c.ok ? 'border-ok/30 bg-ok-soft text-ok' : 'border-crit/30 bg-crit-soft text-crit'}`}>
              {c.ok ? <Check className="size-3.5" /> : <AlertTriangle className="size-3.5" />}{c.label}
            </span>
          ))}
          {data && open.length > 0 && (
            <span className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-[12px] ${unresolved.length ? 'border-warn/30 bg-warn-soft text-warn' : 'border-ok/30 bg-ok-soft text-ok'}`}>
              {unresolved.length ? <AlertTriangle className="size-3.5" /> : <Check className="size-3.5" />}
              {rejectOnly ? REVIEW_TEXT.DUPLICATE_ONLY_REJECT : `${open.length - unresolved.length} of ${open.length} issues resolved`}
            </span>
          )}
          <div className="ml-auto flex gap-2">
            {canEdit && data ? (
              <>
                <Button onClick={() => setRejecting(true)} disabled={busy || gone}>{REVIEW_TEXT.REJECT}</Button>
                <span title={blockers.length ? `Before submitting: ${blockers.join(' · ')}` : undefined}>
                  <Button variant="primary" onClick={submit} disabled={busy || gone || blockers.length > 0}>
                    {busy ? 'Submitting…' : blockers.length ? `${blockers.length} thing${blockers.length > 1 ? 's' : ''} left to fill` : REVIEW_TEXT.SUBMIT}
                  </Button>
                </span>
              </>
            ) : <Button onClick={onClose}>Close</Button>}
          </div>
        </div>
      )}
    </div>
  )
}

/** "Resolved ✓" / "To resolve" next to an issue. */
function ResolvedMark({ ok }: { ok: boolean }) {
  return ok
    ? <span className="pf-tab-in ml-auto inline-flex items-center gap-1 text-[11.5px] font-semibold text-ok"><Check className="size-3.5" />{REVIEW_TEXT.RESOLVED}</span>
    : <span className="ml-auto text-[11.5px] font-medium text-crit">{REVIEW_TEXT.TO_RESOLVE}</span>
}

/**
 * The PO file in the Figma viewer frame, shown in the app for every type (components/FileViewer): PDFs page by page,
 * sheets as grids, JSON as tables, the email body sandboxed. Open in a new tab uses the short-lived S3 link.
 */
function DocumentViewer({ data }: { data: PoReviewDetail }) {
  const url = data.files.poFile
  const fileName = data.upload.fileName
  const uploadId = data.upload.uploadId
  const load = useCallback((signal: AbortSignal) => getPoFile(uploadId, signal), [uploadId])
  if (!url) {
    return (
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-[var(--radius-card)] bg-[#323639] p-6 text-center text-[13px] text-white/80">
        {REVIEW_TEXT.NO_FILE}
      </div>
    )
  }
  return (
    <FileViewer load={load} fileName={fileName} type={data.files.poFileType} actions={
      <a href={url} target="_blank" rel="noreferrer" title={FILE_VIEWER_TEXT.OPEN_TAB} className="hover:opacity-100"><ExternalLink className="size-4" /></a>
    } />
  )
}
