import { useState } from 'react'
import { RefreshCw } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from './ui'
import { ApiError } from '../api/client'
import { getUniwareSync, startUniwareSync } from '../api/poOverview'
import { UNIWARE_SYNC_REFRESH_MS, UNIWARE_SYNC_TEXT as T } from '../constants/poOverview'

/*
 * PO Overview's Uniware sync (2026-11-06): "Uniware · synced N min ago" + Sync now. The server reads every 30 min by
 * itself; the rows change through the page's live updates as each sale order is read.
 */
export function UniwareSyncButton({ canSync }: { canSync: boolean }) {
  const qc = useQueryClient()
  const [note, setNote] = useState('')
  const status = useQuery({ queryKey: ['po-overview', 'uniware-sync'], queryFn: ({ signal }) => getUniwareSync(signal), refetchInterval: UNIWARE_SYNC_REFRESH_MS })
  const s = status.data
  const busy = !!s && (s.running || s.queued)
  const sync = async () => {
    setNote('')
    try {
      const r = await startUniwareSync()
      qc.setQueryData(['po-overview', 'uniware-sync'], r)
      setNote(T.STARTED)
    } catch (e) {
      setNote(T.FAILED(e instanceof ApiError ? e.message : String(e)))
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-2 text-[12px] text-ink-600" title={T.HINT}>
      <span className={s?.lastError ? 'text-warn' : ''}>
        {s?.minutesAgo === null || s?.minutesAgo === undefined ? T.NEVER : T.AGO(s.minutesAgo)}{s?.lastError ? ` · ${s.lastError}` : ''}
      </span>
      {canSync && (
        <Button icon={<RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} />} disabled={busy} onClick={() => void sync()}>
          {busy ? T.RUNNING : T.BUTTON}
        </Button>
      )}
      {note && <span>{note}</span>}
    </div>
  )
}
