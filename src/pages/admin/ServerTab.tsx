import { useState } from 'react'
import { AlertTriangle, Check, HardDrive, Play, Search } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button } from '../../components/ui'
import { ApiError } from '../../api/client'
import { getServer, runServerCleanup, type CleanupRun } from '../../api/admin'
import { SERVER_TEXT as T } from '../../constants/admin'
import { istDateTime } from '../../lib/time'

/*
 * Admin > Server (2026-11-04, user: "does it fill the server disk?"; shown to developers only): how full the server disk
 * is (the folder POs are worked in), the local cleanup (switched on or not, its rules, the last run, why folders were
 * kept), Check now (dry run: what it would remove) and Run cleanup now. S3 keeps everything: only local copies go.
 */

const gb = (b: number) => `${(b / 1_073_741_824).toFixed(1)} GB`
const mb = (b: number) => `${(b / 1_048_576).toFixed(1)} MB`

export function ServerTab() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: ['admin', 'server'], queryFn: ({ signal }) => getServer(signal), refetchInterval: 60_000 })
  const [busy, setBusy] = useState<'dry' | 'apply' | null>(null)
  const [error, setError] = useState('')
  const run = async (apply: boolean) => {
    setBusy(apply ? 'apply' : 'dry')
    setError('')
    try {
      qc.setQueryData(['admin', 'server'], await runServerCleanup(apply))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }
  const d = q.data
  if (q.isError) return <p className="text-[12.5px] text-crit">{q.error instanceof ApiError ? q.error.message : String(q.error)}</p>
  if (!d) return <p className="text-[12.5px] text-ink-400">Loading…</p>
  const pct = d.disk?.usedPct ?? 0
  const tone = pct >= d.thresholds.errorPct ? 'crit' : pct >= d.thresholds.warnPct ? 'warn' : 'ok'
  const last: CleanupRun | null = d.cleanup.last
  return (
    <div className="space-y-5 text-[13px]">
      <p className="text-[12.5px] text-ink-600">{T.SUB}</p>
      <section className="space-y-2 rounded-[var(--radius-card)] border border-line p-4">
        <div className="flex items-center gap-2"><HardDrive className="size-4 text-primary" /><h3 className="font-semibold text-ink-900">{T.DISK}</h3>
          {d.disk && <Badge tone={tone}>{pct}% {T.USED}</Badge>}</div>
        {d.disk ? (
          <>
            <div className="h-2.5 w-full overflow-hidden rounded-full bg-alt">
              <div className={`h-full ${tone === 'crit' ? 'bg-crit' : tone === 'warn' ? 'bg-warn' : 'bg-ok'}`} style={{ width: `${Math.min(100, pct)}%` }} />
            </div>
            <div className="text-[12.5px] text-ink-600">{T.FREE(gb(d.disk.freeBytes), gb(d.disk.totalBytes))} · <span className="font-mono">{d.disk.path}</span></div>
            <div className="text-[12px] text-ink-400">{T.THRESHOLDS(d.thresholds.warnPct, d.thresholds.errorPct)}</div>
          </>
        ) : <p className="text-ink-400">{T.NO_DISK}</p>}
      </section>

      <section className="space-y-3 rounded-[var(--radius-card)] border border-line p-4">
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="font-semibold text-ink-900">{T.CLEANUP}</h3>
          <Badge tone={d.cleanup.enabled ? 'ok' : 'warn'}>{d.cleanup.enabled ? T.ON : T.OFF}</Badge>
          {!d.cleanup.s3 && <Badge tone="crit">{T.NO_S3}</Badge>}
        </div>
        {!d.cleanup.enabled && <div className="flex items-start gap-2 rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-warn"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{T.OFF_HINT}</div>}
        <ul className="list-disc space-y-0.5 pl-5 text-[12.5px] text-ink-600">
          <li>{T.RULE_FINISHED(d.cleanup.minAgeHours)}</li>
          <li>{T.RULE_STALE(d.cleanup.staleDays)}</li>
          <li>{T.RULE_S3}</li>
          <li>{T.RULE_EVERY(d.cleanup.everyHours)}</li>
        </ul>
        <div>
          <div className="text-[11.5px] font-semibold text-ink-400">{T.LAST_RUN}</div>
          {last ? (
            <div className="space-y-1 text-[12.5px] text-ink-900">
              <div>{istDateTime(last.at)} · {last.apply ? T.REMOVED(last.removed, mb(last.removedBytes)) : T.WOULD_REMOVE(last.removed, mb(last.removedBytes))} · {T.KEPT(last.folders - last.removed, mb(last.keptBytes))}</div>
              {last.kept.length > 0 && <ul className="text-[12px] text-ink-600">{last.kept.map((k) => <li key={k.reason}>{k.n} × {k.reason}</li>)}</ul>}
            </div>
          ) : <div className="text-ink-400">{T.NEVER}</div>}
        </div>
        {error && <p className="text-[12.5px] text-crit">{error}</p>}
        <div className="flex flex-wrap gap-2">
          <Button disabled={!!busy || !d.cleanup.s3} onClick={() => void run(false)} icon={<Search className="size-4" />}>{busy === 'dry' ? T.CHECKING : T.CHECK}</Button>
          <Button variant="primary" disabled={!!busy || !d.cleanup.s3} onClick={() => void run(true)} icon={busy === 'apply' ? <Check className="size-4" /> : <Play className="size-4" />}>{busy === 'apply' ? T.RUNNING : T.RUN}</Button>
        </div>
      </section>
    </div>
  )
}
