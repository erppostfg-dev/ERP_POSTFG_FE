import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, Trash2 } from 'lucide-react'
import { DataGrid } from '../../../components/kit'
import { PillToggle } from '../../../components/ui'
import { deleteRun, downloadPeriod, downloadReport, listPeriods, listRuns, type IntransitRun, type PeriodCopy } from '../../../api/intransit'
import { INTRANSIT_POLL_MS, SOURCE_INFO, type Source } from '../../../constants/intransit'
import { istDateTime } from '../../../lib/time'
import type { ColKind } from '../../../lib/ops'
import ReportPanel from './ReportPanel'
import RunLog from './RunLog'
import { errText, isActive, shortDay, StatusBadge, took, type OnNotice, type OpenCsv } from './shared'

/*
 * Every build and fetch, newest first (user, 2026-10-19), with the day each was for. Opening a report shows it above
 * the list; a fetch's files open in the viewer as they were fetched (also the ones the column check refused).
 * With the S3 store (user, 2026-10-26) a build's workbook is kept 90 days; each week's and month's final workbook is
 * kept for good (the Weekly / Monthly list).
 */

type Kind = 'all' | 'report' | 'fetch' | 'periods'
type Row = { id: string; what: string; day: string; by: string; started: string; took: string; result: string; run: IntransitRun }

const totalOf = (r: IntransitRun) => r.summary?.find((s) => s['Final Status'] === 'TOTAL INTRANSIT')

export default function HistoryTab({ canEdit, onNotice, openCsv }: { canEdit: boolean; onNotice: OnNotice; openCsv: OpenCsv }) {
  const qc = useQueryClient()
  const [kind, setKind] = useState<Kind>('all')
  const [open, setOpen] = useState<string | null>(null)
  // the run whose log is shown above the list ("Log" on its row)
  const [logOf, setLogOf] = useState<string | null>(null)
  const runs = useQuery({
    queryKey: ['intransit', 'runs'],
    queryFn: ({ signal }) => listRuns(undefined, signal),
    refetchInterval: (q) => (q.state.data?.some(isActive) ? INTRANSIT_POLL_MS : false),
  })
  const all = runs.data ?? []
  const shown = all.filter((r) => kind === 'all' || (kind === 'report') === (r.kind === 'report'))
  const opened = all.find((r) => r.id === open && r.kind === 'report')
  const logRun = all.find((r) => r.id === logOf)
  const fail = (err: unknown) => onNotice('warn', errText(err))

  const remove = async (id: string) => {
    if (!window.confirm(`Delete report #${id}? It no longer counts as its day's build (nor its week's or month's).`)) return
    try { await deleteRun(id); if (open === id) setOpen(null); void qc.invalidateQueries({ queryKey: ['intransit'] }) } catch (err) { fail(err) }
  }

  const rows: Row[] = shown.map((r) => {
    const t = totalOf(r)
    const saved = r.result?.saved ?? []
    return {
      id: r.id,
      what: r.kind === 'report' ? 'Report' : `${SOURCE_INFO[r.kind as Source]?.label ?? r.kind} fetch`,
      day: r.asOf ?? String(r.options?.date ?? ''),
      by: r.createdBy?.name ?? '',
      started: istDateTime(r.startedAt ?? r.createdAt),
      took: took(r),
      result: r.error ?? (r.kind === 'report' ? (t ? `${Number(t['Updated Qty']).toLocaleString('en-IN')} units in transit` : '') : saved.length ? `${saved.length} file${saved.length > 1 ? 's' : ''}` : ''),
      run: r,
    }
  })
  const cols: [string, keyof Row, ColKind][] = [['#', 'id', 'mono'], ['What', 'what', 'text'], ['For', 'day', 'date'], ['By', 'by', 'text'], ['Started', 'started', 'mono'], ['Took', 'took', 'mono'], ['Result', 'result', 'text']]

  return (
    <div className="space-y-4">
      {opened && kind !== 'periods' && <ReportPanel key={opened.id} run={opened} canEdit={canEdit} onNotice={onNotice} />}
      {logRun && kind !== 'periods' && (
        <RunLog key={logRun.id} runId={logRun.id} live={isActive(logRun)} onClose={() => setLogOf(null)} onFail={fail}
          title={`${logRun.kind === 'report' ? 'Report' : `${SOURCE_INFO[logRun.kind as Source]?.label ?? logRun.kind} fetch`} #${logRun.id} log`} />
      )}
      <div className="flex items-center justify-between gap-3">
        <PillToggle value={kind} onChange={setKind} options={[
          { key: 'all', label: 'All' }, { key: 'report', label: 'Reports' }, { key: 'fetch', label: 'Fetches' }, { key: 'periods', label: 'Weekly / Monthly' },
        ]} />
        {runs.isPending && <span className="text-[12px] text-ink-400">Loading…</span>}
      </div>
      {kind === 'periods' ? <Periods onFail={fail} /> : <DataGrid cols={cols} rows={rows} rowKey={(r) => r.id}
        onRowClick={(r) => r.run.kind === 'report' && setOpen(r.id)}
        rowClass={(r) => (r.id === open ? 'bg-primary-soft/40' : '')}
        trailing={[
          { label: 'Status', render: (r) => <StatusBadge run={r.run} /> },
          {
            label: '', render: (r) => {
              if (r.run.kind === 'report') {
                return (
                  <span className="flex items-center gap-3">
                    <button onClick={() => setOpen(r.id)} className="text-primary hover:underline">Open</button>
                    {r.run.hasReport && r.run.report?.state !== 'expired' && <button onClick={() => void downloadReport(r.id).catch(fail)} className="text-primary hover:underline">Download</button>}
                    {r.run.report?.state === 'expired' && (
                      <span className="text-[12px] text-ink-400" title={`Workbooks are kept 90 days; the week's and month's final builds are kept for good (${r.run.report.weekly}, ${r.run.report.monthly})`}>
                        Expired · see {r.run.report.weekly}
                      </span>
                    )}
                    <button onClick={() => setLogOf(r.id)} className="text-primary hover:underline">Log</button>
                    {canEdit && !isActive(r.run) && <button onClick={() => void remove(r.id)} title="Delete" aria-label={`Delete report ${r.id}`} className="text-ink-400 hover:text-crit"><Trash2 className="size-3.5" /></button>}
                  </span>
                )
              }
              const saved = r.run.result?.saved ?? []
              const refused = Object.keys(r.run.result?.rejected ?? {})
              return (
                <span className="flex flex-wrap items-center gap-1">
                  {[...saved.map((n) => [n, false] as const), ...refused.map((n) => [n, true] as const)].map(([n, bad]) => (
                    <button key={n} onClick={() => openCsv({ kind: 'run', runId: r.id, name: n }, `${r.what} #${r.id} for ${r.day ? shortDay(r.day) : ''}${bad ? ', refused by the column check' : ''}`)}
                      title={bad ? `${n}: ${(r.run.result?.rejected?.[n] ?? []).join('; ')}` : `View ${n} as fetched`}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11.5px] ${bad ? 'border-crit/40 text-crit' : 'border-line text-primary'} hover:bg-primary-soft/60`}>
                      <Eye className="size-3" /> {n.replace(/\.csv$/i, '')}
                    </button>
                  ))}
                  <button onClick={() => setLogOf(r.id)} className="ml-1 text-primary hover:underline">Log</button>
                </span>
              )
            },
          },
        ]} />}
    </div>
  )
}

type PeriodRow = { id: string; kind: string; fy: string; label: string; from: string; size: string; updated: string; copy: PeriodCopy }

/** The weekly / monthly copies: the final workbook of each week and month, kept for good (newest period first). */
function Periods({ onFail }: { onFail: (err: unknown) => void }) {
  const periods = useQuery({ queryKey: ['intransit', 'periods'], queryFn: ({ signal }) => listPeriods(signal) })
  if (periods.isPending) return <p className="text-[12px] text-ink-400">Loading…</p>
  if (periods.isError) return <p className="text-[12px] text-crit">{errText(periods.error)}</p>
  if (!periods.data.length) return <p className="text-[12px] text-ink-400">No weekly or monthly copies yet: they are made from the live server's builds.</p>
  const rows: PeriodRow[] = periods.data.map((p) => ({
    id: p.key, kind: p.kind === 'weekly' ? 'Week' : 'Month', fy: p.fy, label: p.label, from: p.from ?? '',
    size: `${(p.size / 1048576).toFixed(1)} MB`, updated: istDateTime(p.modified), copy: p,
  }))
  const cols: [string, keyof PeriodRow, ColKind][] = [['Period', 'kind', 'text'], ['FY', 'fy', 'text'], ['Name', 'label', 'mono'], ['From', 'from', 'date'], ['Size', 'size', 'mono'], ['Updated', 'updated', 'mono']]
  return (
    <DataGrid cols={cols} rows={rows} rowKey={(r) => r.id} trailing={[
      { label: '', render: (r) => <button onClick={() => void downloadPeriod(r.copy).catch(onFail)} className="text-primary hover:underline">Download</button> },
    ]} />
  )
}
