import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, Ban } from 'lucide-react'
import { Badge, PillToggle } from '../../components/ui'
import { DataGrid, FilterChips, FilterPanel, SectionToolbar, exportRows, useSection, type FilterDef } from '../../components/kit'
import { Reveal } from '../../components/shell'
import { ApiError } from '../../api/client'
import { listAllPoReview, type PoReviewItem } from '../../api/poReview'
import { ENDED_TEXT, FAIL_STEP_HINT, FAIL_STEP_LABEL, PO_STATUS, REJECTED_FROM_LABEL, SOURCE_LABELS } from '../../constants/poReview'
import type { ColKind } from '../../lib/ops'
import { istDateTime } from '../../lib/time'
import { FileCell } from './SourceCells'

/*
 * Rejected & Failed (2026-11-02, user: "a section after Price differences with the rejected POs, and OCR failed / all the
 * failed POs with the tag why they failed"). Two views of GET /po-review (status=rejected / failed), newest first:
 *   Rejected: who rejected it, when, why, and where (PO review = the reviewer, Approvals = the approver).
 *   Failed:   a tag for the step that failed (OCR, reading, saving, Uniware CSV, held PO), its code and the reason.
 * Read-only: nothing is re-run from here (a re-run is a separate step, later).
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

export function RejectedFailed({ liveTick }: { liveTick: number }) {
  const [view, setView] = useState<View>('rejected')
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
        <span className="text-[12.5px] text-ink-600">{view === 'rejected' ? ENDED_TEXT.REJECTED_SUB : ENDED_TEXT.FAILED_SUB}</span>
      </div>
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
            trailing={[{ label: 'Original file', render: (r) => <FileCell uploadId={r.id} name={r.file} /> }]} />
          {q.isPending && <p className="mt-2 text-[12.5px] text-ink-400">Loading…</p>}
          {!q.isPending && !rows.length && (
            <p className="mt-2 flex items-center gap-2 text-[12.5px] text-ink-400"><Ban className="size-4" />{view === 'rejected' ? 'No rejected POs.' : 'No failed POs.'}</p>
          )}
        </div>
      )}
    </div>
  )
}
