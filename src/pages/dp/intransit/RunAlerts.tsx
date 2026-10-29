import { useEffect, useRef, useState } from 'react'
import { AlertTriangle } from 'lucide-react'
import { Button, Modal } from '../../../components/ui'
import { getRun, type IntransitRun } from '../../../api/intransit'
import { SOURCE_INFO, type Source } from '../../../constants/intransit'
import RunLog from './RunLog'
import { errText, type OnNotice } from './shared'

/*
 * A build or fetch that ends badly opens a pop-up (user, 2026-10-29: "it silently skips rather than a pop up"):
 * a failed run, a fetch that lost a file (not fetched / refused by the column check), or a build whose fetch failed
 * (it went on with earlier copies). Only runs seen running on this page are reported, once each.
 */

const whatOf = (r: IntransitRun) => (r.kind === 'report' ? `Report #${r.id}` : `${SOURCE_INFO[r.kind as Source]?.label ?? r.kind} fetch #${r.id}`)

/** What went wrong with an ended run, or null when it went well. */
const problemOf = (r: IntransitRun): string | null => {
  if (r.status === 'failed') return r.error ?? 'It failed without a message: see the log.'
  if (r.status !== 'succeeded') return null
  if (r.kind !== 'report') return r.error ? `Done, but ${r.error}.` : null
  const fetchFailed = (r.result?.fetched ?? []).filter((f) => f.error)
  return fetchFailed.length
    ? `Built, but ${fetchFailed.map((f) => `the ${SOURCE_INFO[f.source as Source]?.label ?? f.source} fetch failed (${f.error})`).join('; ')}, so earlier copies were used.`
    : null
}

/** Watches the runs going on (`running`) and returns the ones that ended badly, until dismissed. */
export function useRunAlerts(running: IntransitRun[]) {
  const [alerts, setAlerts] = useState<{ run: IntransitRun; problem: string }[]>([])
  const seen = useRef<string[]>([])
  const ids = running.map((r) => r.id).join(',')
  useEffect(() => {
    const now = ids ? ids.split(',') : []
    const ended = seen.current.filter((id) => !now.includes(id))
    seen.current = now
    for (const id of ended) {
      void getRun(id).then((r) => {
        const problem = problemOf(r)
        if (problem) setAlerts((a) => (a.some((x) => x.run.id === r.id) ? a : [...a, { run: r, problem }]))
      }).catch(() => undefined)
    }
  }, [ids])
  return { alerts, dismiss: () => setAlerts([]) }
}

export default function RunAlerts({ alerts, onClose, onNotice }: { alerts: { run: IntransitRun; problem: string }[]; onClose: () => void; onNotice: OnNotice }) {
  if (!alerts.length) return null
  const failed = alerts.filter((a) => a.run.status === 'failed').length
  return (
    <Modal open onClose={onClose} wide
      title={<span className="flex items-center gap-2 text-crit"><AlertTriangle className="size-4" />{failed ? `${failed} run${failed > 1 ? 's' : ''} failed` : 'A run needs a look'}</span>}
      sub="The log of each is below; History keeps them too."
      footer={<Button variant="primary" onClick={onClose}>Close</Button>}>
      <div className="space-y-4">
        {alerts.map(({ run, problem }) => (
          <div key={run.id}>
            <div className="text-[13px] font-semibold text-ink-900">{whatOf(run)}{run.asOf ? ` for ${run.asOf}` : ''}</div>
            <p className={`mt-0.5 text-[12.5px] ${run.status === 'failed' ? 'text-crit' : 'text-warn'}`}>{problem}</p>
            <RunLog runId={run.id} live={false} title="Log" onFail={(err) => onNotice('warn', errText(err))} />
          </div>
        ))}
      </div>
    </Modal>
  )
}
