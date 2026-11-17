import { useEffect, useRef, useState } from 'react'
import { AlertTriangle, Loader2, RefreshCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/ui'
import { getSyncStatus, syncNow } from '../../../api/d2cTransfers'
import { D2C_SYNC_POLL_MS, D2C_SYNC_POLL_RUNNING_MS, D2C_TEXT } from '../../../constants/d2cTransfers'
import { D2C_KEY } from '../../../lib/liveTransfers'
import { errorOf, fmtDateTime } from './format'

/*
 * Header of the D2C page, phase 6 (POST_FG sync.service.ts; GET /sync-status, POST /sync): "Uniware · synced N min
 * ago" (or syncing / last sync failed with Uniware's reason on hover) and, for editors, Sync now. The status is
 * re-read every minute, every 3 s while a run is going on; when a run ends the lists reload (the live stream also
 * reloads each transfer the sync changed).
 */

const SYNC_KEY = [D2C_KEY, 'sync-status'] as const

export function SyncStatus({ editor }: { editor: boolean }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const status = useQuery({
    queryKey: SYNC_KEY,
    queryFn: ({ signal }) => getSyncStatus(signal),
    refetchInterval: (q) => (q.state.data?.running || q.state.data?.queued ? D2C_SYNC_POLL_RUNNING_MS : D2C_SYNC_POLL_MS),
  })
  const s = status.data
  // a run that ended: the lists may have moved
  const wasRunning = useRef(false)
  useEffect(() => {
    if (!s) return
    if (wasRunning.current && !s.running) void qc.invalidateQueries({ queryKey: [D2C_KEY], predicate: (q) => q.queryKey[1] !== 'sync-status' })
    wasRunning.current = s.running
  }, [s, qc])

  const run = async () => {
    setBusy(true)
    setNote(null)
    try {
      const r = await syncNow()
      qc.setQueryData(SYNC_KEY, r)
      if (r.state === 'queued') setNote(D2C_TEXT.SYNC_QUEUED)
    } catch (e) {
      setNote(errorOf(e).message)
    } finally {
      setBusy(false)
    }
  }

  const failed = !!s?.lastError
  const text = !s ? (status.error ? D2C_TEXT.SYNC_FAILED : D2C_TEXT.SYNC_NEVER)
    : s.running ? D2C_TEXT.SYNC_RUNNING
      : failed ? D2C_TEXT.SYNC_FAILED
        : s.minutesAgo === null ? D2C_TEXT.SYNC_NEVER : D2C_TEXT.SYNC_AGO(s.minutesAgo)
  const hint = [
    s ? D2C_TEXT.SYNC_HINT(s.syncMinutes) : null,
    s && !s.timerOn ? D2C_TEXT.SYNC_OFF_HINT : null,
    s?.lastError ? `Last error: ${s.lastError}` : null,
    s?.lastOkAt ? `Last good sync: ${fmtDateTime(s.lastOkAt)}` : null,
    s?.counts ? `Last run: ${s.counts.read} read, ${s.counts.changed} changed, ${s.counts.errors} with errors${s.counts.notStarted ? `, ${s.counts.notStarted} left for the next run` : ''}` : null,
    s?.nextRunAt ? `Next run: ${fmtDateTime(s.nextRunAt)}` : null,
    status.error ? errorOf(status.error).message : null,
  ].filter(Boolean).join('\n')
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span title={hint} data-testid="d2c-sync-status"
        className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11.5px] ${failed || status.error ? 'border-crit/30 bg-crit-soft text-crit' : 'border-line bg-alt text-ink-600'}`}>
        {s?.running ? <Loader2 className="size-3.5 animate-spin" /> : failed ? <AlertTriangle className="size-3.5" /> : <RefreshCw className="size-3.5" />}
        {text}
      </span>
      {editor && <Button icon={<RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} />} disabled={busy || !!s?.running} onClick={() => void run()}>{D2C_TEXT.SYNC_NOW}</Button>}
      {note && <span className="text-[11.5px] text-ink-600">{note}</span>}
    </span>
  )
}
