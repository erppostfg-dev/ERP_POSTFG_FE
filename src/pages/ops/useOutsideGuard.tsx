import { useCallback, useState, type ReactNode } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { AlertTriangle } from 'lucide-react'
import { Button, Modal } from '../../components/ui'
import { inputCls } from '../../components/kit'
import { ackOutside, precheckOutside, type OutsidePrecheck } from '../../api/uniwareOutside'
import { GUARD_TEXT as T, OUTSIDE_REMARK_MAX, type GuardAction } from '../../constants/uniwareOutside'

/*
 * Warn before an action (2026-11-25, user: "when they download the sale order, and in review, check and warn that these
 * are already in Uniware, so no PO gets duplicated"; "we don't block, we warn"). guard(uploadIds, action, run):
 *   1. POST precheck (Uniware read up to now, normally one call) -> the POs already in Uniware under another code;
 *   2. none -> run(all) at once (no extra click); the check failing -> run(all) too (never stuck);
 *   3. some -> a dialog: which POs, their Uniware code + status, an optional reason, then
 *      Skip these n (only where it makes sense: downloads / marks of several) | Continue anyway | Cancel.
 *      Continue anyway records it (POST ack) and runs; nothing is ever refused.
 */

interface Pending { action: GuardAction; uploadIds: string[]; found: OutsidePrecheck['found']; checked: boolean; run: (ids: string[]) => Promise<void> }

export function useOutsideGuard(): { guard: (uploadIds: string[], action: GuardAction, run: (ids: string[]) => Promise<void>) => Promise<void>; dialog: ReactNode } {
  const qc = useQueryClient()
  const [pending, setPending] = useState<Pending | null>(null)
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)

  const guard = useCallback(async (uploadIds: string[], action: GuardAction, run: (ids: string[]) => Promise<void>) => {
    if (!uploadIds.length) return run(uploadIds)
    let pre: OutsidePrecheck | null
    try {
      pre = await precheckOutside(uploadIds.slice(0, T.MAX))
    } catch {
      pre = null // the check itself failed: never stuck, go ahead
    }
    if (!pre || !pre.found.length) return run(uploadIds)
    void qc.invalidateQueries({ queryKey: ['uniware-outside'] })
    setRemark('')
    setPending({ action, uploadIds, found: pre.found, checked: pre.checked, run })
  }, [qc])

  const close = () => { if (!busy) setPending(null) }
  const go = async (ids: string[], anyway: boolean) => {
    if (!pending) return
    setBusy(true)
    try {
      if (anyway) await ackOutside(pending.found.map((f) => f.id), pending.action, remark.trim()).catch(() => undefined)
      await pending.run(ids)
    } finally {
      setBusy(false)
      setPending(null)
    }
  }

  let dialog: ReactNode = null
  if (pending) {
    const flagged = new Set(pending.found.map((f) => f.uploadId))
    const rest = pending.uploadIds.filter((id) => !flagged.has(id))
    const canSkip = T.SKIPPABLE.includes(pending.action) && rest.length > 0
    const n = flagged.size
    dialog = (
      <Modal open onClose={close} title={T.TITLE(n, pending.uploadIds.length)} sub={T.SUB[pending.action]}
        footer={
          <div className="flex flex-wrap items-center justify-end gap-2">
            <Button onClick={close} disabled={busy}>{T.CANCEL}</Button>
            {canSkip && <Button variant="primary" disabled={busy} onClick={() => void go(rest, false)}>{T.SKIP(n)}</Button>}
            <button type="button" disabled={busy} onClick={() => void go(pending.uploadIds, true)}
              className="pf-press inline-flex h-9 items-center whitespace-nowrap rounded-[var(--radius)] border border-warn/60 bg-warn-soft px-4 text-[13px] font-semibold text-ink-900 hover:bg-warn-soft/70 disabled:opacity-50">
              {T.ANYWAY[pending.action](pending.uploadIds.length)}
            </button>
          </div>
        }>
        <div className="space-y-3">
          <div className="flex items-start gap-2 rounded-[var(--radius)] bg-crit-soft px-3 py-2 text-[12.5px] text-ink-900">
            <AlertTriangle className="mt-0.5 size-4 shrink-0 text-crit" /><span>{T.EXPLAIN}</span>
          </div>
          <div className="max-h-60 overflow-y-auto rounded-[var(--radius)] border border-line">
            <table className="w-full table-fixed text-left text-[12.5px]">
              <thead className="sticky top-0 bg-alt text-[11.5px] uppercase tracking-wide text-ink-600">
                <tr><th className="w-[38%] px-3 py-1.5 font-semibold">{T.COL_PO}</th><th className="w-[38%] px-3 py-1.5 font-semibold">{T.COL_CODE}</th><th className="px-3 py-1.5 font-semibold">{T.COL_STATUS}</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {pending.found.map((f) => (
                  <tr key={f.id}>
                    <td className="truncate px-3 py-1.5 font-mono font-semibold text-ink-900" title={f.poNumber ?? ''}>{f.poNumber ?? '—'}</td>
                    <td className="truncate px-3 py-1.5 font-mono text-ink-900" title={`${f.code} · ${f.channel}`}>{f.code}</td>
                    <td className="truncate px-3 py-1.5 text-ink-600" title={f.status ?? ''}>{f.status ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!pending.checked && <p className="text-[12px] text-warn">{T.NOT_CHECKED}</p>}
          <div className="space-y-1">
            <label htmlFor="outside-guard-reason" className="text-[12px] font-medium text-ink-600">{T.REASON}</label>
            <textarea id="outside-guard-reason" value={remark} onChange={(e) => setRemark(e.target.value.slice(0, OUTSIDE_REMARK_MAX))} rows={2}
              className={`${inputCls} h-auto min-h-[60px] resize-y py-2 leading-snug`} />
          </div>
        </div>
      </Modal>
    )
  }
  return { guard, dialog }
}
