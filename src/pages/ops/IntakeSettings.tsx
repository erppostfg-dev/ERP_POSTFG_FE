import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, Check, Inbox, X } from 'lucide-react'
import { Badge, Modal } from '../../components/ui'
import { ApiError } from '../../api/client'
import { listIntake, setUniversalStart, updateIntake, type IntakeChannel } from '../../api/intake'
import { INTAKE_TEXT as T } from '../../constants/intake'
import { istDateTime } from '../../lib/time'
import { Toggle } from './VerifySettings'

/*
 * Users & Roles -> Settings -> PO intake (user, 2026-10-23): one row per channel that comes by email or API: ON / OFF,
 * "Process from" (date + time; older emails stay in Gmail, an earlier date fetches the ones since then), a limit per
 * day (empty = none), today's count and the held POs. A universal start sets every channel's "Process from" at once
 * (each can be changed after). Switching a channel on asks for an optional start. Changes apply at once; switching
 * on (or raising the limit) lets the held POs go on, one by one. Admin / developer only.
 */

const KEY = ['admin', 'po-intake']

/** ISO -> the value a datetime-local field shows (this computer's time zone, India here). */
const toLocal = (iso: string | null) => {
  if (!iso) return ''
  const d = new Date(iso)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}
const toIso = (local: string) => (local ? new Date(local).toISOString() : null)

const CATCH_UP_REFRESH_MS = 10_000
const CATCH_UP_TONE = { waiting: 'neutral', running: 'info', done: 'ok', failed: 'warn' } as const

/** The channel's last Gmail catch-up: status, what it took, or when it is tried again (and why it failed). */
function CatchUpCell({ c }: { c: IntakeChannel }) {
  const u = c.catchUp
  if (!u) return <span className="text-ink-400">—</span>
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5" title={u.lastError ?? `${T.FROM}: ${istDateTime(u.from)}`}>
      <Badge tone={CATCH_UP_TONE[u.status]}>{T.CATCH_UP_STATUS[u.status] ?? u.status}</Badge>
      {u.status === 'done' && u.sent !== null && <span className="tnum text-ink-600">{T.CATCH_UP_DONE(u.sent)}</span>}
      {u.status === 'failed' && u.nextTryAt && <span className="tnum text-warn">{T.CATCH_UP_RETRY(istDateTime(u.nextTryAt), u.attempts)}</span>}
    </span>
  )
}

const fieldCls = 'h-8 rounded-[var(--radius)] border border-line bg-surface px-2 text-[13px] outline-none focus:border-primary disabled:opacity-60'

/** The limit field: saved on Enter or when the field is left, only when it changed. */
function LimitField({ c, busy, onSave }: { c: IntakeChannel; busy: boolean; onSave: (v: number | null) => void }) {
  const [v, setV] = useState(c.dailyLimit === null ? '' : String(c.dailyLimit))
  useEffect(() => setV(c.dailyLimit === null ? '' : String(c.dailyLimit)), [c.dailyLimit])
  const commit = () => {
    const next = v.trim() === '' ? null : Math.max(0, Math.floor(Number(v)))
    if (next !== null && !Number.isFinite(next)) return setV(c.dailyLimit === null ? '' : String(c.dailyLimit))
    if (next !== c.dailyLimit) onSave(next)
  }
  return (
    <input type="number" min={0} value={v} disabled={busy} placeholder={T.NO_LIMIT} title={T.LIMIT_HINT}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`tnum w-24 text-right ${fieldCls}`} />
  )
}

/** "Process from": saved when the field is left, only when it changed (empty = cleared). */
function FromField({ value, busy, onSave }: { value: string | null; busy: boolean; onSave: (iso: string | null) => void }) {
  const [v, setV] = useState(toLocal(value))
  useEffect(() => setV(toLocal(value)), [value])
  const commit = () => { const iso = toIso(v); if ((iso ?? '') !== (value ? new Date(value).toISOString() : '')) onSave(iso) }
  return (
    <input type="datetime-local" value={v} disabled={busy} title={T.FROM_HINT}
      onChange={(e) => setV(e.target.value)} onBlur={commit} onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      className={`tnum w-[190px] ${fieldCls}`} />
  )
}

export function IntakeSettings() {
  const qc = useQueryClient()
  // while a catch-up is waiting / running, look again every 10 s (it runs in the background)
  const q = useQuery({
    queryKey: KEY, queryFn: ({ signal }) => listIntake(signal),
    refetchInterval: (query) => (query.state.data?.channels.some((c) => c.catchUp && ['waiting', 'running'].includes(c.catchUp.status)) ? CATCH_UP_REFRESH_MS : false),
  })
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const [universal, setUniversal] = useState('')
  const [switchOn, setSwitchOn] = useState<{ c: IntakeChannel; from: string } | null>(null)
  useEffect(() => setUniversal(toLocal(q.data?.universal.processFrom ?? null)), [q.data?.universal.processFrom])

  const run = async (key: string, fn: () => Promise<string>) => {
    setBusy(key)
    try {
      const text = await fn()
      await qc.invalidateQueries({ queryKey: KEY })
      setNotice({ tone: 'ok', text })
    } catch (e) {
      setNotice({ tone: 'err', text: e instanceof ApiError ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }
  const change = (c: IntakeChannel, patch: { enabled?: boolean; dailyLimit?: number | null; processFrom?: string | null }) =>
    run(c.channel, async () => {
      const out = await updateIntake(c.channel, patch)
      if (patch.enabled !== undefined) return patch.enabled ? T.SAVED_ON(c.name, c.held) : T.SAVED_OFF(c.name)
      if (patch.processFrom !== undefined) return T.SAVED_FROM(c.name, out.processFrom ? istDateTime(out.processFrom) : null)
      return T.SAVED_LIMIT(c.name, out.dailyLimit)
    })
  const applyUniversal = (iso: string | null) =>
    run('universal', async () => {
      await setUniversalStart(iso)
      return T.SAVED_UNIVERSAL(iso ? istDateTime(iso) : null)
    })

  const th = 'border-b border-primary/20 bg-primary-soft px-3 py-2 text-left text-[11.5px] font-semibold text-primary whitespace-nowrap'
  const td = 'border-b border-line px-3 py-2.5 align-middle'
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <Inbox className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <div className="text-[14px] font-semibold text-ink-900">{T.TITLE}</div>
          <p className="mt-1 max-w-3xl text-[12.5px] text-ink-600">{T.SUB}</p>
        </div>
      </div>

      {/* Universal start: the same "Process from" on every channel */}
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-primary/25 bg-primary-soft/40 px-4 py-3">
        <CalendarClock className="size-5 shrink-0 text-primary" />
        <div className="min-w-[200px] flex-1">
          <div className="text-[13px] font-semibold text-ink-900">{T.UNIVERSAL}</div>
          <div className="text-[11.5px] text-ink-600">{T.UNIVERSAL_HINT}</div>
          {q.data?.universal.updatedAt && <div className="mt-0.5 text-[11px] text-ink-400">{q.data.universal.updatedBy ?? '—'} · {istDateTime(q.data.universal.updatedAt)}</div>}
        </div>
        <input type="datetime-local" value={universal} onChange={(e) => setUniversal(e.target.value)} disabled={busy === 'universal'} className={`tnum w-[200px] ${fieldCls}`} />
        <button onClick={() => void applyUniversal(toIso(universal))} disabled={!universal || busy === 'universal'}
          className="pf-press inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-[12.5px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
          {T.APPLY_ALL}
        </button>
        {q.data?.universal.processFrom && (
          <button onClick={() => void applyUniversal(null)} disabled={busy === 'universal'} className="text-[12px] text-ink-400 hover:text-crit">{T.CLEAR}</button>
        )}
      </div>

      {notice && (
        <div className={`pf-tab-in flex items-start gap-2 rounded-[var(--radius)] px-3 py-2 text-[12.5px] ${notice.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'}`}>
          {notice.tone === 'ok' ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)}><X className="size-4" /></button>
        </div>
      )}
      {q.error ? (
        <div className="rounded-[var(--radius)] bg-crit-soft px-4 py-3 text-[13px] text-crit">{q.error instanceof ApiError ? q.error.message : String(q.error)}</div>
      ) : !q.data ? (
        <div className="rounded-[var(--radius)] border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-600">{T.LOADING}</div>
      ) : (
        <div className="overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface">
          <table className="min-w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th className={th}>{T.CHANNEL}</th>
                <th className={th}>{T.SOURCE}</th>
                <th className={th}>{T.TAKE}</th>
                <th className={th} title={T.FROM_HINT}>{T.FROM}</th>
                <th className={th} title={T.LIMIT_HINT}>{T.LIMIT}</th>
                <th className={`${th} text-right`}>{T.TODAY}</th>
                <th className={`${th} text-right`} title={T.HELD_HINT}>{T.HELD}</th>
                <th className={`${th} text-right`} title={T.BEFORE_START_HINT}>{T.BEFORE_START}</th>
                <th className={th} title={T.CATCH_UP_HINT}>{T.CATCH_UP}</th>
                <th className={th}>{T.CHANGED}</th>
              </tr>
            </thead>
            <tbody>
              {q.data.channels.map((c) => {
                const full = c.dailyLimit !== null && c.today >= c.dailyLimit
                return (
                  <tr key={c.channel} className="hover:bg-primary/5">
                    <td className={`${td} font-semibold text-ink-900`}>{c.name}</td>
                    <td className={td}><Badge tone={c.source === 'api' ? 'info' : 'neutral'}>{T.SOURCE_LABEL[c.source] ?? c.source}</Badge></td>
                    <td className={td}>
                      <span className="inline-flex items-center gap-2.5">
                        {/* Switching ON asks for an optional start first; OFF is immediate. */}
                        <Toggle on={c.enabled} busy={busy === c.channel}
                          onChange={(v) => (v ? setSwitchOn({ c, from: toLocal(c.processFrom ?? new Date().toISOString()) }) : void change(c, { enabled: false }))} />
                        <span className={`text-[12px] font-semibold ${c.enabled ? 'text-primary' : 'text-ink-400'}`}>{c.enabled ? T.ON : T.OFF}</span>
                      </span>
                    </td>
                    <td className={td}><FromField value={c.processFrom} busy={busy === c.channel} onSave={(iso) => void change(c, { processFrom: iso })} /></td>
                    <td className={td}><LimitField c={c} busy={busy === c.channel} onSave={(v) => void change(c, { dailyLimit: v })} /></td>
                    <td className={`${td} tnum text-right ${full ? 'font-semibold text-warn' : ''}`}>{c.dailyLimit === null ? c.today : `${c.today} / ${c.dailyLimit}`}</td>
                    <td className={`${td} tnum text-right ${c.held ? 'font-semibold text-warn' : 'text-ink-400'}`}>{c.held}</td>
                    <td className={`${td} tnum text-right text-ink-400`}>{c.heldBeforeStart}</td>
                    <td className={`${td} text-[12px]`}><CatchUpCell c={c} /></td>
                    <td className={`${td} text-[12px] text-ink-600`}>{c.updatedAt ? `${c.updatedBy ?? '—'} · ${istDateTime(c.updatedAt)}` : <span className="text-ink-400">{T.NEVER}</span>}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Switch on: an optional start date first */}
      <Modal open={!!switchOn} onClose={() => setSwitchOn(null)} title={switchOn ? T.SWITCH_ON_TITLE(switchOn.c.name) : ''} sub={T.SWITCH_ON_HINT}
        footer={switchOn && (
          <>
            <button onClick={() => setSwitchOn(null)} className="h-9 rounded-[var(--radius)] px-3 text-[13px] font-semibold text-ink-600 hover:bg-alt">{T.CANCEL}</button>
            <button disabled={!switchOn.from} onClick={() => { const s = switchOn; setSwitchOn(null); void change(s.c, { enabled: true, processFrom: toIso(s.from) }) }}
              className="disabled:opacity-50 pf-press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-4 text-[13px] font-semibold text-white hover:opacity-90">{T.SWITCH_ON}</button>
          </>
        )}>
        {switchOn && (
          <label className="flex flex-wrap items-center gap-3 text-[13px]">
            <span className="font-semibold text-ink-900">{T.FROM}</span>
            <input type="datetime-local" value={switchOn.from} onChange={(e) => setSwitchOn({ ...switchOn, from: e.target.value })} className={`tnum w-[210px] ${fieldCls}`} />
          </label>
        )}
      </Modal>
    </div>
  )
}
