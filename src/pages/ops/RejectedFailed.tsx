import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ArrowRight, Ban, Check, RotateCcw, X } from 'lucide-react'
import { Badge, Button, Drawer, PillToggle } from '../../components/ui'
import { DataGrid, FilterChips, FilterPanel, SectionToolbar, exportRows, useSection, type FilterDef } from '../../components/kit'
import { Reveal } from '../../components/shell'
import { ApiError } from '../../api/client'
import { getRejection, listAllPoReview, reopenPo, type PoReviewItem } from '../../api/poReview'
import { ENDED_TEXT, FAIL_STEP_HINT, FAIL_STEP_LABEL, FIX_FIELD_LABEL, ISSUE_LABELS, PO_REVIEW_REMARK_MAX, PO_STATUS, REJECTED_FROM_LABEL, SOURCE_LABELS } from '../../constants/poReview'
import { inputCls } from '../../components/kit'
import type { ColKind } from '../../lib/ops'
import { istDateTime } from '../../lib/time'
import { FileCell } from './SourceCells'

/*
 * Rejected & Failed (2026-11-02, user: "a section after Price differences with the rejected POs, and OCR failed / all the
 * failed POs with the tag why they failed"). Two views of GET /po-review (status=rejected / failed), newest first:
 *   Rejected: who rejected it, when, why, and where (PO review = the reviewer, Approvals = the approver).
 *   Failed:   a tag for the step that failed (OCR, reading, saving, Uniware CSV, held PO), its code and the reason.
 * Rejected (2026-11-03): a row opens why it was rejected (who, where, reason, the errors rejected with it, what the
 * reviewer had changed) and "Reopen for review" (PO review editors): back to In Review, fixed there, approved again.
 * Failed: read-only for now.
 */

type View = 'rejected' | 'failed'
type Row = {
  id: string; poNumber: string; channel: string; source: string; file: string; received: string
  tag: string; reason: string; by: string; where: string; at: string; day: string; code: string; attempts: number; item: PoReviewItem
}

const toRow = (p: PoReviewItem): Row => {
  const f = p.failure
  const r = p.rejection
  const at = f?.at ?? r?.at ?? null
  return {
    id: p.uploadId, poNumber: p.poNumber ?? '—', channel: p.channel ?? '—', source: SOURCE_LABELS[p.source] ?? p.source, file: p.fileName,
    received: istDateTime(p.receivedAt),
    tag: f ? FAIL_STEP_LABEL[f.step ?? ''] ?? (f.step || 'Failed') : '',
    reason: (f ? f.reason : r?.reason) ?? ENDED_TEXT.NO_REASON,
    by: r ? r.by ?? r.byEmail ?? '—' : '',
    where: r ? REJECTED_FROM_LABEL[r.from] : '',
    at: istDateTime(at), day: at ? new Date(new Date(at).getTime() + 5.5 * 3_600_000).toISOString().slice(0, 10) : '',
    code: f?.code ?? '', attempts: f?.ocrAttempts ?? 0, item: p,
  }
}

const COLS: Record<View, [string, keyof Row, ColKind][]> = {
  rejected: [['PO Number', 'poNumber', 'mono'], ['Channel', 'channel', 'text'], ['Rejected in', 'where', 'text'], ['Rejected by', 'by', 'text'], ['Reason', 'reason', 'text'], ['Source', 'source', 'text'], ['Received', 'received', 'mono'], ['Rejected at', 'at', 'mono']],
  failed: [['PO Number', 'poNumber', 'mono'], ['Channel', 'channel', 'text'], ['Why it failed', 'tag', 'text'], ['Reason', 'reason', 'text'], ['Code', 'code', 'mono'], ['OCR tries', 'attempts', 'num'], ['Source', 'source', 'text'], ['Received', 'received', 'mono'], ['Failed at', 'at', 'mono']],
}

export function RejectedFailed({ liveTick, canEdit }: { liveTick: number; canEdit: boolean }) {
  const qc = useQueryClient()
  const [view, setView] = useState<View>('rejected')
  const [open, setOpen] = useState<Row | null>(null)
  const [notice, setNotice] = useState('')
  const rejected = useQuery({ queryKey: ['po-ended', PO_STATUS.REJECTED, liveTick], queryFn: ({ signal }) => listAllPoReview({ status: PO_STATUS.REJECTED }, signal) })
  const failed = useQuery({ queryKey: ['po-ended', PO_STATUS.FAILED, liveTick], queryFn: ({ signal }) => listAllPoReview({ status: PO_STATUS.FAILED }, signal) })
  const q = view === 'rejected' ? rejected : failed
  const rows = useMemo(() => (q.data ?? []).map(toRow), [q.data])
  const s = useSection(rows, ['poNumber', 'channel', 'reason', 'file', 'by', 'code'])
  // the search / filters belong to one view
  const { setFilters, setQ } = s
  useEffect(() => { setFilters({}); setQ('') }, [view, setFilters, setQ])
  const uniq = (k: 'channel' | 'where' | 'by' | 'tag' | 'source') => [...new Set(rows.map((r) => r[k]).filter(Boolean))].sort()
  const filters: FilterDef[] = view === 'rejected'
    ? [{ key: 'channel', label: 'Channel', type: 'multi', options: uniq('channel') }, { key: 'where', label: 'Rejected in', type: 'multi', options: uniq('where') },
      { key: 'by', label: 'Rejected by', type: 'multi', options: uniq('by') }, { key: 'dayFrom', label: 'Rejected from', type: 'date' }, { key: 'dayTo', label: 'Rejected to', type: 'date' }]
    : [{ key: 'channel', label: 'Channel', type: 'multi', options: uniq('channel') }, { key: 'tag', label: 'Why it failed', type: 'multi', options: uniq('tag') },
      { key: 'source', label: 'Source', type: 'multi', options: uniq('source') }, { key: 'dayFrom', label: 'Failed from', type: 'date' }, { key: 'dayTo', label: 'Failed to', type: 'date' }]
  // failed: how many per tag, shown above the table
  const tags = useMemo(() => {
    const m = new Map<string, number>()
    for (const r of failed.data ? failed.data.map(toRow) : []) m.set(r.tag, (m.get(r.tag) ?? 0) + 1)
    return [...m.entries()].sort((a, b) => b[1] - a[1])
  }, [failed.data])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <PillToggle value={view} onChange={setView} options={[
          { key: 'rejected', label: `${ENDED_TEXT.REJECTED} (${rejected.data?.length ?? '…'})` },
          { key: 'failed', label: `${ENDED_TEXT.FAILED} (${failed.data?.length ?? '…'})` },
        ]} />
        <span className="text-[12.5px] text-ink-600">{view === 'rejected' ? `${ENDED_TEXT.REJECTED_SUB} ${ENDED_TEXT.OPEN_HINT}` : ENDED_TEXT.FAILED_SUB}</span>
      </div>
      {notice && (
        <div className="pf-tab-in flex items-start gap-2 rounded-[var(--radius)] bg-ok-soft px-3 py-2 text-[12.5px] text-ok">
          <Check className="mt-0.5 size-4 shrink-0" /><span className="flex-1">{notice}</span>
          <button onClick={() => setNotice('')}><X className="size-4" /></button>
        </div>
      )}
      {view === 'failed' && tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {tags.map(([tag, n]) => {
            const step = Object.entries(FAIL_STEP_LABEL).find(([, l]) => l === tag)?.[0]
            return (
              <button key={tag} onClick={() => s.setFilters({ tag: [tag] })} title={step ? FAIL_STEP_HINT[step] : undefined}
                className="inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1 text-[12.5px] hover:border-primary">
                <AlertTriangle className="size-3.5 text-warn" />{tag}<Badge tone="warn">{n}</Badge>
              </button>
            )
          })}
        </div>
      )}
      <SectionToolbar q={s.q} setQ={s.setQ} placeholder="Search PO number, channel, reason, file…" filtersOpen={s.open} onToggleFilters={() => s.setOpen(!s.open)}
        activeFilters={s.active} entity={view === 'rejected' ? 'rejected POs' : 'failed POs'} onExport={(ext) => exportRows(`${view}-pos`, ext, COLS[view], s.filtered)} />
      <Reveal open={s.open}><FilterPanel defs={filters} value={s.filters} onApply={s.setFilters} onClose={() => s.setOpen(false)} /></Reveal>
      <FilterChips defs={filters} value={s.filters} onChange={s.setFilters} />
      {q.isError ? (
        <div className="rounded-[var(--radius)] bg-crit-soft px-3 py-2 text-[12.5px] text-crit">
          {q.error instanceof ApiError ? q.error.message : String(q.error)} <button onClick={() => void q.refetch()} className="font-semibold underline">Try again</button>
        </div>
      ) : (
        <div key={view} className="pf-tab-in">
          <DataGrid cols={COLS[view]} rows={q.isPending ? [] : s.filtered} rowKey={(r) => r.id} pageSize={25} pageSizeKey={`ended-${view}`}
            onRowClick={view === 'rejected' ? setOpen : undefined}
            trailing={[{ label: 'Original file', render: (r) => <FileCell uploadId={r.id} name={r.file} /> }]} />
          {q.isPending && <p className="mt-2 text-[12.5px] text-ink-400">Loading…</p>}
          {!q.isPending && !rows.length && (
            <p className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-400"><Ban className="size-4" />{view === 'rejected' ? 'No rejected POs.' : 'No failed POs.'}</p>
          )}
        </div>
      )}
      {open && (
        <RejectionDrawer row={open} canEdit={canEdit} onClose={() => setOpen(null)}
          onReopened={(text) => { setNotice(text); setOpen(null); void qc.invalidateQueries({ queryKey: ['po-ended'] }) }} />
      )}
    </div>
  )
}

const val = (v: unknown): string =>
  v === null || v === undefined || v === '' ? '—' : typeof v === 'string' ? v : JSON.stringify(v)

/** One rejected PO: why it was rejected, and Reopen for review (2026-11-03). */
function RejectionDrawer({ row, canEdit, onClose, onReopened }: { row: Row; canEdit: boolean; onClose: () => void; onReopened: (text: string) => void }) {
  const d = useQuery({ queryKey: ['po-rejection', row.id], queryFn: ({ signal }) => getRejection(row.id, signal) })
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const go = async () => {
    setBusy(true)
    setError('')
    try {
      const r = await reopenPo(row.id, remark.trim())
      onReopened(ENDED_TEXT.REOPENED(row.poNumber, r.openIssues))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
      setBusy(false)
    }
  }
  const x = d.data
  return (
    <Drawer open onClose={onClose} title={`Rejected PO ${row.poNumber}`} sub={row.channel}>
      {d.isPending && <p className="text-[12.5px] text-ink-400">Loading…</p>}
      {d.isError && <p className="text-[12.5px] text-crit">{d.error instanceof ApiError ? d.error.message : String(d.error)}</p>}
      {x && (
        <div className="space-y-5 text-[12.5px]">
          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-600">{ENDED_TEXT.WHY_TITLE}</h4>
            <div className="rounded-[var(--radius)] bg-crit-soft px-3 py-2 text-crit">
              <div className="font-semibold">{x.rejection?.reason ?? ENDED_TEXT.NO_REASON}</div>
              <div className="mt-0.5 text-ink-600">
                {x.rejection ? `${REJECTED_FROM_LABEL[x.rejection.from]} · ${x.rejection.by ?? x.rejection.byEmail ?? '—'} · ${istDateTime(x.rejection.at)}` : '—'}
              </div>
            </div>
          </section>
          <section>
            <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-600">{ENDED_TEXT.ERRORS_TITLE}</h4>
            {x.rejectedIssues.length ? (
              <ul className="space-y-1.5">
                {x.rejectedIssues.map((i, n) => (
                  <li key={n} className="rounded-[var(--radius)] border border-line px-3 py-2">
                    <div className="flex items-center gap-2"><Badge tone="crit">{ISSUE_LABELS[i.type] ?? i.type}</Badge>{i.lineNo !== null && <span className="text-ink-600">line {i.lineNo}</span>}{i.field && <span className="font-mono text-ink-400">{i.field}</span>}</div>
                    {i.details && <div className="mt-1 text-ink-900">{i.details}</div>}
                  </li>
                ))}
              </ul>
            ) : <p className="text-ink-400">—</p>}
          </section>
          {x.reviewerFixes && (
            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-600">{ENDED_TEXT.FIXES_TITLE}</h4>
              <ul className="space-y-1">
                {x.reviewerFixes.location && <li className="flex items-center gap-1.5">Location: {val(x.reviewerFixes.location.from)} <ArrowRight className="size-3.5" /> <b>{val(x.reviewerFixes.location.to)}</b></li>}
                {x.reviewerFixes.lines.flatMap((l) => l.changes.map((c, n) => (
                  <li key={`${l.lineNo}-${n}`} className="flex items-center gap-1.5">Line {l.lineNo} {FIX_FIELD_LABEL[c.field] ?? c.field}: {val(c.from)} <ArrowRight className="size-3.5" /> <b>{val(c.to)}</b></li>
                )))}
              </ul>
            </section>
          )}
          {x.reopens.length > 0 && (
            <section>
              <h4 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-600">{ENDED_TEXT.REOPENS_TITLE}</h4>
              <ul className="space-y-1 text-ink-600">
                {x.reopens.map((r, n) => <li key={n}>{istDateTime(r.at)} · {r.by ?? '—'}: {r.remark}{r.rejectedReason ? ` (was rejected: ${r.rejectedReason})` : ''}</li>)}
              </ul>
            </section>
          )}
          {canEdit && x.status === PO_STATUS.REJECTED && (
            <section className="rounded-[var(--radius)] border border-primary/25 p-3">
              <p className="mb-2 text-ink-600">{ENDED_TEXT.REOPEN_HINT}</p>
              <textarea value={remark} onChange={(e) => setRemark(e.target.value.slice(0, PO_REVIEW_REMARK_MAX))} rows={2} placeholder={ENDED_TEXT.REOPEN_REMARK} className={`${inputCls} h-auto py-2`} />
              {error && <p className="mt-1 text-crit">{error}</p>}
              <div className="mt-2 flex justify-end">
                <Button variant="primary" disabled={busy || !remark.trim()} onClick={() => void go()} icon={<RotateCcw className="size-3.5" />}>{busy ? 'Reopening…' : ENDED_TEXT.REOPEN}</Button>
              </div>
            </section>
          )}
        </div>
      )}
    </Drawer>
  )
}
