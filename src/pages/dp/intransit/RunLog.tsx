import { useEffect, useRef } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, X } from 'lucide-react'
import { downloadLog, getRunLog } from '../../../api/intransit'
import { INTRANSIT_POLL_MS } from '../../../constants/intransit'
import { errText } from './shared'

/*
 * A run's whole log on the page (user, 2026-10-29: "we have to download each time"): read again every few seconds
 * while the run goes on, kept scrolled to the newest line unless the reader scrolled up; Download keeps the file.
 */

/** Pixels from the bottom that still count as "at the end" (the view follows new lines there). */
const FOLLOW_SLACK_PX = 40

export default function RunLog({ runId, live, title = 'Log', onClose, onFail }: {
  runId: string; live: boolean; title?: string; onClose?: () => void; onFail: (err: unknown) => void
}) {
  const log = useQuery({
    queryKey: ['intransit', 'run-log', runId],
    queryFn: ({ signal }) => getRunLog(runId, signal),
    refetchInterval: live ? INTRANSIT_POLL_MS : false,
  })
  const box = useRef<HTMLPreElement>(null)
  const follow = useRef(true)
  const text = log.data ?? ''

  useEffect(() => {
    const el = box.current
    if (el && follow.current) el.scrollTop = el.scrollHeight
  }, [text])

  return (
    <div className="mt-1.5 overflow-hidden rounded-[var(--radius)] border border-line">
      <div className="flex items-center gap-2 border-b border-line bg-alt px-3 py-1">
        <span className="text-[11.5px] font-medium text-ink-600">{title}</span>
        {live && <span className="text-[11px] text-primary">live</span>}
        <span className="flex-1" />
        <button onClick={() => void downloadLog(runId).catch(onFail)} title="Download the log" aria-label="Download the log" className="text-ink-400 hover:text-primary">
          <Download className="size-3.5" />
        </button>
        {onClose && (
          <button onClick={onClose} title="Close the log" aria-label="Close the log" className="text-ink-400 hover:text-ink-900">
            <X className="size-3.5" />
          </button>
        )}
      </div>
      <pre ref={box} onScroll={(e) => { const el = e.currentTarget; follow.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_SLACK_PX }}
        className="max-h-64 overflow-auto whitespace-pre-wrap break-words bg-canvas px-3 py-2 font-mono text-[11.5px] text-ink-600">
        {log.isError ? errText(log.error) : text || (log.isPending ? 'Loading…' : 'Waiting to start…')}
      </pre>
    </div>
  )
}
