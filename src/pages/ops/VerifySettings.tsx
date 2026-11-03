import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Loader2, ShieldCheck, X } from 'lucide-react'
import { ApiError } from '../../api/client'
import { listVerifySettings, updateVerifySetting, type VerifyChannelSetting } from '../../api/poVerify'
import { VERIFY_SETTINGS_TEXT as T } from '../../constants/poVerify'
import { istDateTime } from '../../lib/time'

/*
 * Users & Roles -> Settings (2026-10-22, user): the verify-before-Uniware switch, one per channel ("ON for the channels
 * that fail"). The counts of verified / sent back POs help decide. A change applies at once for everyone (no restart);
 * who and when are kept. Admin / developer only (the page and the API check it). Part of the removable po-verify step.
 */

const KEY = ['admin', 'verify-settings']

/** An ON / OFF switch in the app's blue. */
export function Toggle({ on, busy, onChange }: { on: boolean; busy: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={on} disabled={busy} onClick={() => onChange(!on)}
      className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors duration-200 disabled:opacity-60 ${on ? 'bg-primary' : 'bg-ink-400/40'}`}>
      <span className={`inline-block size-5 rounded-full bg-white shadow transition-transform duration-200 ${on ? 'translate-x-[22px]' : 'translate-x-0.5'}`} />
      {busy && <Loader2 className="absolute left-1/2 top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 animate-spin text-ink-600" />}
    </button>
  )
}

export function VerifySettings() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: KEY, queryFn: ({ signal }) => listVerifySettings(signal) })
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const change = async (c: VerifyChannelSetting, required: boolean) => {
    setBusy(c.channel)
    try {
      await updateVerifySetting(c.channel, required)
      await qc.invalidateQueries({ queryKey: KEY })
      setNotice({ tone: 'ok', text: T.SAVED(c.channel, required) })
    } catch (e) {
      setNotice({ tone: 'err', text: e instanceof ApiError ? e.message : String(e) })
    } finally {
      setBusy(null)
    }
  }

  const th = 'border-b border-primary/20 bg-primary-soft px-3 py-2 text-left text-[11.5px] font-semibold text-primary whitespace-nowrap'
  const td = 'border-b border-line px-3 py-2.5 align-middle'
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-primary" />
        <div>
          <div className="text-[14px] font-semibold text-ink-900">{T.TITLE}</div>
          <p className="mt-1 max-w-3xl text-[12.5px] text-ink-600">{T.SUB}</p>
        </div>
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
        <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
          <table className="min-w-full border-separate border-spacing-0 text-[13px]">
            <thead>
              <tr>
                <th className={th}>{T.CHANNEL}</th>
                <th className={th}>{T.SWITCH}</th>
                <th className={`${th} text-right`}>{T.VERIFIED}</th>
                <th className={`${th} text-right`} title={T.SENT_BACK_HINT}>{T.SENT_BACK}</th>
                <th className={th}>{T.CHANGED}</th>
              </tr>
            </thead>
            <tbody>
              {q.data.channels.map((c) => (
                <tr key={c.channel} className="hover:bg-primary/5">
                  <td className={`${td} font-semibold text-ink-900`}>{c.channel}</td>
                  <td className={td}>
                    <span className="inline-flex items-center gap-2.5">
                      <Toggle on={c.required} busy={busy === c.channel} onChange={(v) => void change(c, v)} />
                      <span className={`text-[12px] font-semibold ${c.required ? 'text-primary' : 'text-ink-400'}`}>{c.required ? T.ON : T.OFF}</span>
                    </span>
                  </td>
                  <td className={`${td} tnum text-right`}>{c.verified}</td>
                  <td className={`${td} tnum text-right ${c.sentBack ? 'font-semibold text-crit' : ''}`} title={T.SENT_BACK_HINT}>{c.sentBack}</td>
                  <td className={`${td} text-[12px] text-ink-600`}>
                    {c.isDefault ? <span className="text-ink-400">{T.DEFAULT(q.data!.defaultRequired)}</span> : `${c.updatedBy ?? '—'} · ${istDateTime(c.updatedAt)}`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
