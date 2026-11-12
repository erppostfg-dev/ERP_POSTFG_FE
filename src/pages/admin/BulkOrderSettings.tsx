import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Package } from 'lucide-react'
import { listBulkSettings, updateBulkSetting } from '../../api/bulkOrders'
import { BULK_TEXT, BULK_TYPE_LABEL, type BulkType } from '../../constants/bulkOrders'
import { Toggle } from '../ops/VerifySettings'

/*
 * Users & Roles -> Settings -> Bulk Orders (2026-11-12, user: "keep the admin in POST_FG only, central admin"): per order
 * type, the proof of payment check ON / OFF (now ON for Institutional). Admin / developer (backend: editor on
 * /bulk-orders). Applies to orders created after the change.
 */

const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function BulkOrderSettings() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['bulk', 'settings'], queryFn: listBulkSettings })
  const save = useMutation({
    mutationFn: ({ type, on }: { type: BulkType; on: boolean }) => updateBulkSetting(type, on),
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
            {s.updatedBy && s.updatedAt && <p className="mt-0.5 text-[11px] text-ink-400">{BULK_TEXT.CHANGED_BY(s.updatedBy.name ?? '', when(s.updatedAt))}</p>}
          </div>
          <Toggle on={s.paymentCheck} busy={save.isPending} onChange={(on) => save.mutate({ type: s.type, on })} />
        </div>
      ))}
      {error && <div className="flex items-start gap-2 rounded-[var(--radius)] bg-crit-soft px-3 py-2 text-[12.5px] text-crit"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{error.message}</div>}
    </div>
  )
}
