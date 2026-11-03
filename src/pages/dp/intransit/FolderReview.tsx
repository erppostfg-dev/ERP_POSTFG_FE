import { useEffect, useState } from 'react'
import type { ReactNode } from 'react'
import { Upload } from 'lucide-react'
import { Badge, Button, Modal } from '../../../components/ui'
import type { DayPlan } from '../../../api/intransit'
import type { FolderMatch } from '../../../lib/folderFiles'
import { dayLabel, fmtSize, shortDay } from './shared'

/*
 * What a dropped / picked folder holds, before anything is sent (user, 2026-10-16 / 19): the day's files go into the
 * day; masters only when they differ from the current one (compared by SHA-256 in the browser, so an unchanged
 * 70 MB PO_Format is not sent again); what the folder lacks and what the day will use instead; files matched twice;
 * files that are not inputs. Then Upload, with progress, and optionally Build.
 */

export type Batch = { done: number; total: number; current: string } | null

const MAX_HASH_BYTES = 300 * 1048576

async function sha256(file: File): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

export default function FolderReview({ match, plan, batch, buildAfter, setBuildAfter, onCancel, onUpload }: {
  match: FolderMatch; plan: DayPlan; batch: Batch; buildAfter: boolean; setBuildAfter: (v: boolean) => void
  onCancel: () => void; onUpload: (inputs: string[]) => void
}) {
  const masters = new Map(plan.masters.items.map((m) => [m.name, m]))
  const dailyBy = new Map(plan.daily.items.map((d) => [d.name, d]))
  const day = dayLabel(plan.date)
  // input -> true when the folder's master is the same file as the server's
  const [same, setSame] = useState<Record<string, boolean | undefined>>({})
  useEffect(() => {
    let stop = false
    void (async () => {
      for (const m of match.matched) {
        const cur = masters.get(m.input)
        if (!cur?.sha256 || m.file.size > MAX_HASH_BYTES || (cur.size !== null && cur.size !== m.file.size)) {
          if (!stop) setSame((s) => ({ ...s, [m.input]: false }))
          continue
        }
        const h = await sha256(m.file).catch(() => '')
        if (!stop) setSame((s) => ({ ...s, [m.input]: h === cur.sha256 }))
      }
    })()
    return () => { stop = true }
  }, [match]) // eslint-disable-line react-hooks/exhaustive-deps

  const masterHits = match.matched.filter((m) => masters.has(m.input))
  const dailyHits = match.matched.filter((m) => dailyBy.has(m.input))
  const checking = masterHits.some((m) => same[m.input] === undefined)
  const toSend = [...dailyHits, ...masterHits.filter((m) => same[m.input] === false)]
  const missingDaily = match.missing.filter((n) => dailyBy.has(n))
  const fetchable = new Set(plan.build.toFetch.flatMap((s) => s.files))
  const blocked = missingDaily.filter((n) => dailyBy.get(n)?.on === 'missing' && !fetchable.has(n))

  const section = (title: string, n: number, tone: 'ok' | 'warn' | 'neutral', body: ReactNode, startOpen = true) =>
    n > 0 && (
      <details open={startOpen} className="rounded-[var(--radius)] border border-line">
        <summary className="flex cursor-pointer items-center gap-2 px-3 py-2 text-[12.5px] font-semibold text-ink-900">{title} <Badge tone={tone}>{n}</Badge></summary>
        <div className="border-t border-line px-3 py-2 text-[12px]">{body}</div>
      </details>
    )
  const row = (key: string, name: string, path: string, size: number, note: ReactNode) => (
    <tr key={key} className="border-t border-line first:border-0">
      <td className="py-1 pr-3 font-medium text-ink-900">{name}</td>
      <td className="py-1 pr-3 text-ink-400">from {path}</td>
      <td className="tnum py-1 pr-3 text-right text-ink-600">{fmtSize(size)}</td>
      <td className="py-1 text-right">{note}</td>
    </tr>
  )

  return (
    <Modal open onClose={onCancel} wide title={`Upload a folder${match.folder ? `: ${match.folder}` : ''}`}
      sub={`${dailyHits.length} files for ${day} and ${masterHits.length} masters found`}
      footer={batch ? (
        <div className="flex w-full items-center gap-3">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-alt"><div className="h-full rounded-full bg-primary transition-all" style={{ width: `${(batch.done / batch.total) * 100}%` }} /></div>
          <span className="tnum text-[12px] text-ink-600">Uploading {batch.done + 1} of {batch.total}: {batch.current}</span>
        </div>
      ) : (
        <>
          <label className={`mr-auto flex items-center gap-2 text-[12.5px] ${blocked.length ? 'text-ink-400' : 'text-ink-900'}`}>
            <input type="checkbox" checked={buildAfter && !blocked.length} disabled={!!blocked.length} onChange={(e) => setBuildAfter(e.target.checked)} className="accent-[var(--color-primary)]" />
            Then build the report for {shortDay(plan.date)}
          </label>
          <Button onClick={onCancel}>Cancel</Button>
          <Button variant="primary" disabled={!toSend.length || checking} icon={<Upload className="size-3.5" />} onClick={() => onUpload(toSend.map((m) => m.input))}>
            {checking ? 'Comparing masters…' : `Upload ${toSend.length} file${toSend.length === 1 ? '' : 's'}`}
          </Button>
        </>
      )}>
      <div className="space-y-2">
        {section(`Files for ${day}`, dailyHits.length, 'ok', (
          <table className="w-full"><tbody>
            {dailyHits.map((m) => row(m.input, m.input, m.path, m.file.size, <span className="text-ink-400">{dailyBy.get(m.input)?.on === 'date' ? `replaces the ${day} copy` : 'new for the day'}</span>))}
          </tbody></table>
        ))}
        {section('Masters', masterHits.length, 'neutral', (
          <table className="w-full"><tbody>
            {masterHits.map((m) => row(m.input, m.input, m.path, m.file.size,
              same[m.input] === undefined ? <span className="text-ink-400">comparing…</span>
                : same[m.input] ? <span className="text-ink-400">same as the current one, skipped</span>
                : <span className="text-primary">changed, replaces the current one</span>))}
          </tbody></table>
        ))}
        {section(`Not in the folder`, missingDaily.length, blocked.length ? 'warn' : 'neutral', (
          <ul className="space-y-0.5">
            {missingDaily.map((n) => {
              const d = dailyBy.get(n)
              const text = d?.on === 'date' ? `the ${day} copy stays`
                : fetchable.has(n) ? 'fetched from the API when you build'
                : d?.on === 'earlier' ? `the ${shortDay(d.fileDate as string)} copy is used`
                : 'no copy at all: upload it'
              return (
                <li key={n} className="flex justify-between gap-3">
                  <span>{n}</span>
                  <span className={blocked.includes(n) ? 'text-warn' : 'text-ink-400'}>{text}</span>
                </li>
              )
            })}
          </ul>
        ))}
        {section('Matched twice: the newest file is used', match.duplicates.length, 'warn', (
          <ul className="space-y-1">{match.duplicates.map((d) => <li key={d.input}>{d.input}: using {d.kept}; skipping {d.skipped.join(', ')}</li>)}</ul>
        ), false)}
        {section('Not inputs of the report, ignored', match.ignored.length, 'neutral', (
          <ul className="space-y-0.5 text-ink-600">{match.ignored.map((p) => <li key={p}>{p}</li>)}</ul>
        ), false)}
      </div>
    </Modal>
  )
}
