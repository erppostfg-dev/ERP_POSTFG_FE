import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, X } from 'lucide-react'
import { Badge } from '../../../components/ui'
import { uploadInput, type CsvTarget, type IntransitRun } from '../../../api/intransit'
import { RUN_STATUS, RUN_STATUS_LABEL, RUN_STATUS_TONE } from '../../../constants/intransit'
import { fileKey } from '../../../lib/folderFiles'

/* Small pieces shared by the In-transit Stock page's tabs. */

export const isActive = (r: IntransitRun) => r.status === RUN_STATUS.QUEUED || r.status === RUN_STATUS.RUNNING
export const StatusBadge = ({ run }: { run: IntransitRun }) => <Badge tone={RUN_STATUS_TONE[run.status]}>{RUN_STATUS_LABEL[run.status]}</Badge>

export const fmtSize = (n: number | null) => (n === null ? '' : n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

export const took = (r: IntransitRun) => {
  if (!r.startedAt) return ''
  const s = Math.round(((r.finishedAt ? Date.parse(r.finishedAt) : Date.now()) - Date.parse(r.startedAt)) / 1000)
  return s >= 60 ? `${Math.floor(s / 60)}m ${s % 60}s` : `${s}s`
}

const IST = 'Asia/Kolkata'
/** "Sun 19 Oct" for a YYYY-MM-DD day. */
export const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
/** "19 Oct" */
export const shortDay = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })
/** "09:12" (IST) */
export const clock = (iso: string) => new Date(iso).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: IST })
/** "09:12" when the moment is on `day` (IST), else "18 Oct, 09:12". */
export const whenOn = (iso: string, day: string) => {
  const d = new Intl.DateTimeFormat('en-CA', { timeZone: IST }).format(new Date(iso))
  return d === day ? clock(iso) : `${shortDay(d)}, ${clock(iso)}`
}

export type Notice = { tone: 'ok' | 'warn'; text: string } | null
export type OnNotice = (tone: 'ok' | 'warn', text: string) => void
/** Opens the CSV viewer on a file. */
export type OpenCsv = (target: CsvTarget, subtitle?: string) => void
export const isCsv = (name: string) => /\.csv$/i.test(name)
export const errText = (err: unknown) => (err instanceof Error ? err.message : String(err))

export function NoticeBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  if (!notice) return null
  return (
    <div role="status" className={`pf-tab-in flex items-start gap-2 rounded-[var(--radius)] px-3 py-2 text-[12.5px] ${notice.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
      {notice.tone === 'ok' ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
      <span className="flex-1 whitespace-pre-line">{notice.text}</span>
      <button onClick={onClose} aria-label="Dismiss"><X className="size-4" /></button>
    </div>
  )
}

/** A file's state as one glyph: the day's own copy, an earlier copy, none, a problem, uploading. */
export type FileState = 'ok' | 'earlier' | 'missing' | 'problem' | 'busy'
export function FileGlyph({ state }: { state: FileState }) {
  const base = 'inline-block size-2.5 shrink-0 rounded-full'
  if (state === 'ok') return <span className={`${base} bg-ok`} aria-label="ready" />
  if (state === 'problem') return <span className={`${base} bg-crit`} aria-label="has a problem" />
  if (state === 'busy') return <span className={`${base} animate-pulse bg-info`} aria-label="working" />
  // an earlier day's copy: half filled; none: an empty ring
  if (state === 'earlier') return <span className={`${base} border border-warn bg-[linear-gradient(90deg,var(--color-warn)_50%,transparent_50%)]`} aria-label="earlier copy" />
  return <span className={`${base} border border-ink-400`} aria-label="missing" />
}

/**
 * Uploading files to the inputs of a day: progress and refusals per input, by name. `send` matches loose files to
 * `names` (case, spaces and " (1)" ignored) unless a target input is given.
 */
export function useUploader(date: string, onNotice: OnNotice, canEdit: boolean) {
  const qc = useQueryClient()
  const [progress, setProgress] = useState<Record<string, number>>({})
  const [errors, setErrors] = useState<Record<string, string[]>>({})

  /** null when saved, else the problems; unchanged = a master identical to the current one. */
  const uploadOne = async (name: string, file: File): Promise<{ problems: string[] | null; unchanged: boolean }> => {
    setErrors((e) => ({ ...e, [name]: [] }))
    setProgress((p) => ({ ...p, [name]: 0 }))
    try {
      const saved = await uploadInput(name, file, date, (v) => setProgress((p) => ({ ...p, [name]: v })))
      return { problems: null, unchanged: saved.unchanged }
    } catch (err) {
      const problems = (err as { details?: { problems?: string[] } }).details?.problems ?? [errText(err)]
      setErrors((e) => ({ ...e, [name]: problems }))
      return { problems, unchanged: false }
    } finally {
      setProgress((p) => { const { [name]: _, ...rest } = p; return rest })
      void qc.invalidateQueries({ queryKey: ['intransit', 'day'] })
    }
  }

  const send = async (list: File[], names: string[], target?: string) => {
    if (!canEdit) return onNotice('warn', 'You can view this page only; ask an admin for editor access to upload.')
    const byKey = new Map(names.map((n) => [fileKey(n), n]))
    const unmatched: string[] = []
    const saved: string[] = []
    const same: string[] = []
    for (const file of list) {
      const name = target ?? byKey.get(fileKey(file.name))
      if (!name) { unmatched.push(file.name); continue }
      const r = await uploadOne(name, file)
      if (!r.problems) (r.unchanged ? same : saved).push(name)
    }
    const lines = [
      saved.length ? `Saved: ${saved.join(', ')}.` : '',
      same.length ? `Already up to date: ${same.join(', ')}.` : '',
      unmatched.length ? `Not an input of the report (rename it to the input's name): ${unmatched.join(', ')}.` : '',
    ].filter(Boolean)
    if (lines.length) onNotice(unmatched.length ? 'warn' : 'ok', lines.join('\n'))
  }

  return { progress, errors, uploadOne, send }
}
