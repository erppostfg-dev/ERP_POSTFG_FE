import { useState } from 'react'
import { AlertTriangle, ArrowRight, DatabaseZap, Moon } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button } from '../../components/ui'
import { ApiError } from '../../api/client'
import { getDataSync, setNightlyDataSync, startDataSync, type DataSyncJob, type DataSyncRun, type DataSyncStatus } from '../../api/admin'
import { DATA_SYNC_REFRESH_MS, DATA_SYNC_TEXT as T } from '../../constants/admin'
import { istDateTime } from '../../lib/time'

/*
 * Admin > Data sync (2026-11-17, user: "every night ~1 AM IST until I say; a tab in Admin for developers with the
 * buttons; one way only"): PEPIMS -> this database and dev -> this database, never back. Each job: what it does, its
 * last run (when, who, counts / error), a Run now button; the nightly switch on top. On a server whose database is not
 * the target (dev, laptop) the buttons are off and a note says why (the backend refuses too).
 */

const KEY = ['admin', 'data-sync'] as const
const errText = (e: unknown) => (e instanceof ApiError ? e.message : String(e))

function JobCard({ job, run, d, busy, onRun }: { job: DataSyncJob; run: DataSyncRun; d: DataSyncStatus; busy: boolean; onRun: () => void }) {
  const t = T.JOBS[job]
  const isRunning = d.running === job
  return (
    <section className="space-y-3 rounded-[var(--radius-card)] border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="font-semibold text-ink-900">{t.TITLE}</h3>
        <span className="flex items-center gap-1 text-[12px] text-ink-400">{job === 'pepims' ? 'PEPIMS' : 'dev'}<ArrowRight className="size-3" />{d.targetDb}</span>
        {isRunning ? <Badge tone="info">{T.RUNNING}</Badge> : run.ok === true ? <Badge tone="ok">OK</Badge> : run.ok === false ? <Badge tone="crit">Failed</Badge> : null}
      </div>
      <p className="text-[12.5px] text-ink-600">{t.WHAT}</p>
      <div className="text-[12.5px] text-ink-900">
        {run.finishedAt || run.startedAt ? T.LAST(istDateTime(run.finishedAt ?? run.startedAt), run.by) : <span className="text-ink-400">{T.NEVER}</span>}
      </div>
      {run.ok === false && run.error && <p className="text-[12.5px] text-crit">{T.FAILED(run.error)}</p>}
      {run.summary && (
        <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-ink-600">
          {Object.entries(run.summary).map(([k, n]) => <li key={k}><span className="font-semibold text-ink-900">{n.toLocaleString('en-IN')}</span> {T.SUMMARY[k] ?? k}</li>)}
        </ul>
      )}
      <Button icon={<DatabaseZap className={`size-4 ${isRunning ? 'animate-pulse' : ''}`} />} disabled={!d.allowed || !!d.running || busy} onClick={onRun}>
        {isRunning ? T.RUNNING : t.BUTTON}
      </Button>
    </section>
  )
}

export function DataSyncTab() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: KEY, queryFn: ({ signal }) => getDataSync(signal), refetchInterval: DATA_SYNC_REFRESH_MS })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const act = async (fn: () => Promise<DataSyncStatus>, ok?: string) => {
    setBusy(true)
    setNote(null)
    try {
      qc.setQueryData(KEY, await fn())
      if (ok) setNote({ tone: 'ok', text: ok })
    } catch (e) {
      setNote({ tone: 'err', text: errText(e) })
      void q.refetch()
    } finally {
      setBusy(false)
    }
  }
  const d = q.data
  if (q.isError) return <p className="text-[12.5px] text-crit">{errText(q.error)}</p>
  if (!d) return <p className="text-[12.5px] text-ink-400">Loading…</p>
  const n = d.nightly
  return (
    <div className="space-y-5 text-[13px]">
      <p className="text-[12.5px] text-ink-600">{T.SUB}</p>
      {!d.allowed && <div className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{T.NOT_HERE(d.database, d.targetDb)}</div>}

      <section className="space-y-2 rounded-[var(--radius-card)] border border-line p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Moon className="size-4 text-primary" />
          <h3 className="font-semibold text-ink-900">{T.NIGHTLY}</h3>
          <Badge tone={n.enabled ? 'ok' : 'warn'}>{n.enabled ? T.NIGHTLY_ON : T.NIGHTLY_OFF}</Badge>
          <Button disabled={busy} onClick={() => void act(() => setNightlyDataSync(!n.enabled))}>{n.enabled ? T.TURN_OFF : T.TURN_ON}</Button>
        </div>
        <p className="text-[12.5px] text-ink-600">{T.NIGHTLY_HINT(n.atIst)}</p>
        <div className="text-[12px] text-ink-400">{T.LAST_NIGHT(n.lastDate)}{n.changedAt ? ` · ${T.CHANGED(n.changedBy, istDateTime(n.changedAt))}` : ''}</div>
      </section>

      {note && <p className={`text-[12.5px] ${note.tone === 'ok' ? 'text-ok' : 'text-crit'}`}>{note.text}</p>}
      <div className="grid gap-4 lg:grid-cols-2">
        {(['pepims', 'devCopy'] as const).map((job) => (
          <JobCard key={job} job={job} run={d[job]} d={d} busy={busy} onRun={() => void act(() => startDataSync(job), T.STARTED)} />
        ))}
      </div>
    </div>
  )
}
