import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, History, Upload } from 'lucide-react'
import { Button, Card, Modal } from '../../../components/ui'
import { getMasterHistory, restoreMaster, type DayPlan, type MasterItem } from '../../../api/intransit'
import { errText, FileGlyph, fmtSize, isCsv, whenOn, type OnNotice, type OpenCsv, useUploader } from './shared'

/*
 * The 11 masters (user, 2026-10-19): kept once, used by every build. Each: when and by whom it was last replaced, how
 * often it is expected to change, its earlier versions (restorable), and an upload for a new version. Uploading the
 * same file again changes nothing.
 */

const REFRESH_LABEL = { daily: 'Updated every day', 'on-change': 'Updated when it changes' } as const

export default function MastersTab({ plan, canEdit, onNotice, openCsv }: { plan: DayPlan; canEdit: boolean; onNotice: OnNotice; openCsv: OpenCsv }) {
  const up = useUploader(plan.date, onNotice, canEdit)
  const picker = useRef<HTMLInputElement>(null)
  const target = useRef<string | null>(null)
  const [history, setHistory] = useState<MasterItem | null>(null)
  const names = plan.masters.items.map((m) => m.name)
  const pick = (name: string) => { target.current = name; picker.current?.click() }
  const daily = plan.masters.items.filter((m) => m.refresh === 'daily')
  const rest = plan.masters.items.filter((m) => m.refresh !== 'daily')

  const tile = (m: MasterItem) => {
    const busy = up.progress[m.name] !== undefined
    const err = up.errors[m.name]?.length ? up.errors[m.name] : m.problems
    return (
      <li key={m.name} className="flex items-start gap-3 px-4 py-3">
        <span className="pt-1.5"><FileGlyph state={busy ? 'busy' : err.length ? 'problem' : !m.present ? 'missing' : m.stale ? 'earlier' : 'ok'} /></span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-medium text-ink-900">{m.name}</div>
          <div className="text-[12px] text-ink-600">{m.source}</div>
          <div className={`mt-0.5 text-[12px] ${err.length ? 'text-crit' : m.stale ? 'text-warn' : 'text-ink-400'}`}>
            {busy ? <span className="text-info">Uploading {Math.round(up.progress[m.name] * 100)}%</span>
              : err.length ? err.join('; ')
              : !m.present ? 'Not uploaded yet'
              : `${m.stale ? 'Last updated' : 'Updated'} ${whenOn(m.updatedAt as string, plan.today)}${m.updatedBy ? ` by ${m.updatedBy}` : m.via === 'edit' ? ' from the combo table' : ''}, ${fmtSize(m.size)}`}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {m.present && isCsv(m.name) && (
            <button onClick={() => openCsv({ kind: 'input', name: m.name }, 'current master')} title={`View ${m.name}`} aria-label={`View ${m.name}`} className="rounded-md p-1.5 text-ink-400 hover:bg-primary-soft hover:text-primary"><Eye className="size-4" /></button>
          )}
          {m.versions > 0 && (
            <button onClick={() => setHistory(m)} title="Earlier versions" className="inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] text-ink-600 hover:bg-primary-soft hover:text-primary">
              <History className="size-3.5" /> {m.versions}
            </button>
          )}
          {canEdit && <Button icon={<Upload className="size-3.5" />} disabled={busy} onClick={() => pick(m.name)}>New version</Button>}
        </div>
      </li>
    )
  }

  return (
    <div className="space-y-4">
      <input ref={picker} type="file" accept=".csv,.xlsx" className="hidden"
        onChange={(e) => { const f = e.target.files?.[0]; if (f && target.current) void up.send([f], names, target.current); e.target.value = '' }} />
      {daily.length > 0 && (
        <Card className="overflow-hidden">
          <h2 className="border-b border-line px-4 py-2.5 text-[13px] font-semibold text-ink-900">{REFRESH_LABEL.daily}</h2>
          <ul className="divide-y divide-line">{daily.map(tile)}</ul>
        </Card>
      )}
      <Card className="overflow-hidden">
        <h2 className="border-b border-line px-4 py-2.5 text-[13px] font-semibold text-ink-900">{REFRESH_LABEL['on-change']}</h2>
        <ul className="divide-y divide-line">{rest.map(tile)}</ul>
      </Card>
      {history && <VersionsModal master={history} canEdit={canEdit} onClose={() => setHistory(null)} onNotice={onNotice} today={plan.today} />}
    </div>
  )
}

function VersionsModal({ master, canEdit, onClose, onNotice, today }: { master: MasterItem; canEdit: boolean; onClose: () => void; onNotice: OnNotice; today: string }) {
  const qc = useQueryClient()
  const [busy, setBusy] = useState<string | null>(null)
  const versions = useQuery({ queryKey: ['intransit', 'versions', master.name], queryFn: ({ signal }) => getMasterHistory(master.name, signal) })
  const restore = async (version: string, at: string) => {
    if (!window.confirm(`Make the version of ${whenOn(at, today)} the current ${master.name}? The current one is kept as a version.`)) return
    setBusy(version)
    try {
      await restoreMaster(master.name, version)
      void qc.invalidateQueries({ queryKey: ['intransit'] })
      onNotice('ok', `${master.name}: the version of ${whenOn(at, today)} is current again. Build the report again to use it.`)
      onClose()
    } catch (err) {
      onNotice('warn', errText(err))
    } finally {
      setBusy(null)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Earlier versions of ${master.name}`} sub="Saved each time a new version replaced it">
      {versions.isPending ? <p className="text-[13px] text-ink-600">Loading…</p> : versions.isError ? <p className="text-[13px] text-crit">{versions.error.message}</p> : (
        <ul className="divide-y divide-line">
          {(versions.data ?? []).map((v) => (
            <li key={v.version} className="flex items-center gap-3 py-2 text-[12.5px]">
              <span className="flex-1">
                <span className="text-ink-900">{whenOn(v.at, today)}</span>
                <span className="text-ink-400">{v.byName ? `, ${v.byName}` : ''}, {fmtSize(v.size)}</span>
              </span>
              {canEdit && <Button disabled={busy !== null} onClick={() => void restore(v.version, v.at)}>{busy === v.version ? 'Restoring…' : 'Restore'}</Button>}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  )
}
