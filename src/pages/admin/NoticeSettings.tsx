import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, Megaphone } from 'lucide-react'
import { ApiError } from '../../api/client'
import { noticesKey, noticeSettings, noticeSettingsKey, saveNoticeSettings } from '../../api/notices'
import { NOTICES_TEXT as T } from '../../constants/notices'
import { Toggle } from '../ops/VerifySettings'

/** Users & Roles -> Settings -> Notices (2026-11-10): the ON / OFF switch for notices in the bell. Admin / developer. */
export function NoticeSettings() {
  const qc = useQueryClient()
  const q = useQuery({ queryKey: noticeSettingsKey, queryFn: ({ signal }) => noticeSettings(signal) })
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)
  const change = async (enabled: boolean) => {
    setBusy(true)
    try {
      qc.setQueryData(noticeSettingsKey, await saveNoticeSettings(enabled))
      await qc.invalidateQueries({ queryKey: noticesKey })
      setNote({ tone: 'ok', text: T.SAVED(enabled) })
    } catch (e) {
      setNote({ tone: 'err', text: e instanceof ApiError ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-3">
      <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <Megaphone className="mt-0.5 size-5 shrink-0 text-primary" />
        <div className="flex-1">
          <div className="text-[14px] font-semibold text-ink-900">{T.SETTINGS_TITLE}</div>
          <p className="mt-1 max-w-3xl text-[12.5px] text-ink-600">{T.SETTINGS_SUB}</p>
        </div>
        {q.data && <Toggle on={q.data.enabled} busy={busy} onChange={(v) => void change(v)} />}
      </div>
      {q.error && <div className="rounded-[var(--radius)] bg-crit-soft px-3 py-2 text-[12.5px] text-crit">{q.error instanceof ApiError ? q.error.message : String(q.error)}</div>}
      {note && (
        <div className={`pf-tab-in flex items-start gap-2 rounded-[var(--radius)] px-3 py-2 text-[12.5px] ${note.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'}`}>
          {note.tone === 'ok' ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}{note.text}
        </div>
      )}
    </div>
  )
}
