import { useState } from 'react'
import { DatabaseZap } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui'
import { ApiError } from '../api/client'
import { getPepimsSync, startPepimsSync } from '../api/poOverview'
import { PEPIMS_SYNC_REFRESH_MS, PEPIMS_SYNC_TEXT as T } from '../constants/poOverview'
import { istDateTime } from '../lib/time'

/*
 * PO Overview's "Sync from PEPIMS" (2026-11-16, PEPIMS -> POST_FG migration): the last run (when, who, what came in)
 * for everyone who sees the page; the button for admin / developer (the server checks too). The server may also run it
 * by itself every PEPIMS_SYNC_MINUTES.
 */
export function PepimsSyncButton({ canSync }: { canSync: boolean }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const status = useQuery({ queryKey: ['po-overview', 'pepims-sync'], queryFn: ({ signal }) => getPepimsSync(signal), refetchInterval: PEPIMS_SYNC_REFRESH_MS })
  const s = status.data
  const sync = async () => {
    setNote('')
    try {
      const r = await startPepimsSync()
      qc.setQueryData(['po-overview', 'pepims-sync'], r)
      setNote(T.STARTED)
    } catch (e) {
      setNote(T.FAILED(e instanceof ApiError ? e.message : String(e)))
      void status.refetch()
    }
  }
  const last = !s?.finishedAt ? T.NEVER : s.ok === false ? T.FAILED_LAST(s.error ?? '') : T.LAST(istDateTime(s.finishedAt), s.by, s.summary)
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-600" title={T.HINT}>
      <span className={s?.ok === false ? 'text-warn' : ''}>{last}</span>
      {canSync && (
        <Button icon={<DatabaseZap className={`size-4 ${s?.running ? 'animate-pulse' : ''}`} />} disabled={!!s?.running} onClick={() => void sync()}>
          {s?.running ? T.RUNNING : T.BUTTON}
        </Button>
      )}
      {note && <span>{note}</span>}
    </div>
  )
}
