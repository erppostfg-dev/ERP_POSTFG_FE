import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Package } from 'lucide-react'
import { useState } from 'react'
import { listBulkSettings, updateBulkSetting, type BulkSetting } from '../../api/bulkOrders'
import { BULK_TEXT, BULK_TYPE_LABEL, type BulkType } from '../../constants/bulkOrders'
import { Toggle } from '../ops/VerifySettings'

/*
 * Users & Roles -> Settings -> Bulk Orders (2026-11-12, user: "keep the admin in POST_FG only, central admin"): per order
 * type, the proof of payment check ON / OFF (now ON for Institutional) and (v2 1c, 2026-11-23) the approval threshold:
 * an order with MORE units than it needs approval (empty = never by size; Porter always does for Marketing / Head
 * office). Admin / developer (backend: editor on /bulk-orders). Applies to orders created (or edited) after the change.
 */

const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

type Change = { paymentCheck?: boolean; approvalOverUnits?: number | null }

/** The threshold box: typed text, saved with Save (empty = never by size). */
function ApprovalOver({ s, busy, onSave }: { s: BulkSetting; busy: boolean; onSave: (v: number | null) => void }) {
  const saved = s.approvalOverUnits === null ? '' : String(s.approvalOverUnits)
  const [text, setText] = useState(saved)
  const value = text.trim() === '' ? null : Number(text)
  const ok = value === null || (Number.isInteger(value) && value >= 0)
  const changed = text.trim() !== saved
  return (
    <div className="mt-2 flex flex-wrap items-center gap-2 text-[12.5px] text-ink-600">
      <span>{BULK_TEXT.APPROVAL_OVER}</span>
      <input type="number" min={0} step={1} value={text} placeholder={BULK_TEXT.APPROVAL_NEVER} onChange={(e) => setText(e.target.value)}
        className={`h-8 w-28 rounded-md border bg-surface px-2 text-[13px] ${ok ? 'border-line' : 'border-crit'}`} />
      <span>{BULK_TEXT.APPROVAL_OVER_UNITS}</span>
      {changed && <button disabled={busy || !ok} onClick={() => onSave(value)} className="h-8 rounded-md bg-primary px-3 text-[12px] font-semibold text-white disabled:opacity-50">{BULK_TEXT.SAVE}</button>}
    </div>
  )
}

export function BulkOrderSettings() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['bulk', 'settings'], queryFn: listBulkSettings })
  const save = useMutation({
    mutationFn: ({ type, change }: { type: BulkType; change: Change }) => updateBulkSetting(type, change),
    onSuccess: (rows) => qc.setQueryData(['bulk', 'settings'], rows),
  })
  const error = list.error ?? save.error
  return (
    <div className="space-y-3">
      <p className="max-w-3xl text-[12.5px] text-ink-600">{BULK_TEXT.SETTINGS_SUB}</p>
      {list.data?.map((s) => (
        <div key={s.type} className="flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <Package className="mt-0.5 size-5 shrink-0 text-primary" />
          <div className="flex-1">
            <div className="text-[14px] font-semibold text-ink-900">{BULK_TYPE_LABEL[s.type]} · {BULK_TEXT.PAYMENT_CHECK}</div>
            <p className="mt-1 max-w-3xl text-[12.5px] text-ink-600">{BULK_TEXT.PAYMENT_CHECK_HINT}</p>
            <ApprovalOver key={String(s.approvalOverUnits)} s={s} busy={save.isPending} onSave={(v) => save.mutate({ type: s.type, change: { approvalOverUnits: v } })} />
            <p className="mt-1 max-w-3xl text-[11.5px] text-ink-400">{BULK_TEXT.APPROVAL_HINT}</p>
            {s.updatedBy && s.updatedAt && <p className="mt-0.5 text-[11px] text-ink-400">{BULK_TEXT.CHANGED_BY(s.updatedBy.name ?? '', when(s.updatedAt))}</p>}
          </div>
          <Toggle on={s.paymentCheck} busy={save.isPending} onChange={(on) => save.mutate({ type: s.type, change: { paymentCheck: on } })} />
        </div>
      ))}
      {error && <div className="flex items-start gap-2 rounded-[var(--radius)] bg-crit-soft px-3 py-2 text-[12.5px] text-crit"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{error.message}</div>}
    </div>
  )
}
