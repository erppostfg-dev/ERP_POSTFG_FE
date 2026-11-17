import { AlertTriangle, Check, Eye, Phone, X as XIcon } from 'lucide-react'
import { Badge } from '../../components/ui'
import type { UniwarePreviewItem } from '../../api/poReview'
import { UNIWARE_PREVIEW_TEXT as T } from '../../constants/poReview'

/*
 * Preview of "Create in Uniware" (2026-11-09): for the ticked POs, what would be sent to Uniware's saleOrder/create,
 * or why it would not be sent. NOTHING is sent and nothing is saved: the backend only reads the PO and its CSV.
 */

const money = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

export function UniwareCreatePreview({ items, createEnabled, onClose }: { items: UniwarePreviewItem[]; createEnabled: boolean; onClose: () => void }) {
  const ready = items.filter((i) => i.wouldSend).length
  const noPhone = items.some((i) => !i.phoneSet)
  return (
    <div className="pf-tab-in space-y-3 rounded-[var(--radius)] border border-primary/40 bg-surface px-4 py-3 text-[12.5px] text-ink-900">
      <div className="flex items-start gap-2">
        <Eye className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="flex-1">
          <div className="font-semibold">{T.TITLE(items.length, ready)}</div>
          <div className="text-ink-600">{createEnabled ? T.NOTHING_SENT : T.CREATE_OFF}</div>
        </div>
        <button onClick={onClose} title={T.CLOSE}><XIcon className="size-4" /></button>
      </div>
      {noPhone && (
        <div className="flex items-center gap-2 rounded-[var(--radius)] bg-warn-soft px-3 py-2 text-warn"><Phone className="size-4" />{T.NO_PHONE}</div>
      )}
      {items.map((i) => (
        <div key={i.uploadId} className="space-y-2 rounded-[var(--radius)] border border-line px-3 py-2.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-semibold">{i.poNumber ?? i.uploadId}</span>
            {i.saleOrderCode && <span className="text-ink-400">→ {i.saleOrderCode}</span>}
            {i.wouldSend
              ? <Badge tone="ok"><Check className="size-3" />{T.WOULD_SEND}</Badge>
              : <Badge tone="crit"><AlertTriangle className="size-3" />{T.WOULD_NOT}</Badge>}
          </div>
          {i.problems.length > 0 && (
            <ul className="list-disc space-y-0.5 pl-5 text-crit">{i.problems.map((p) => <li key={p}>{p}</li>)}</ul>
          )}
          {i.summary && (
            <>
              <div className="grid grid-cols-2 gap-x-4 gap-y-1 sm:grid-cols-4">
                {([
                  [T.CHANNEL, i.summary.channel], [T.CUSTOMER, i.summary.customerCode], [T.FACILITY, i.summary.facility], [T.PO_DATE, i.summary.poDate ?? '—'],
                  [T.UNITS, String(i.summary.units)], [T.TOTAL, money(i.summary.value)], [T.GSTIN, i.summary.gstin ?? '—'], [T.DISPLAY, i.summary.displayOrderCode],
                ] as const).map(([k, v]) => (
                  <div key={k}><div className="text-[11px] uppercase tracking-wide text-ink-400">{k}</div><div className="break-all">{v}</div></div>
                ))}
              </div>
              <div>
                <div className="text-[11px] uppercase tracking-wide text-ink-400">{T.ADDRESS}</div>
                <div>{[i.summary.address.name, i.summary.address.line1, i.summary.address.city, i.summary.address.state, i.summary.address.pincode].filter(Boolean).join(', ')}</div>
              </div>
              <table className="w-full text-left">
                <thead className="text-[11px] uppercase tracking-wide text-ink-400">
                  <tr><th className="py-1 font-medium">{T.SKU}</th><th className="py-1 text-right font-medium">{T.UNITS}</th><th className="py-1 text-right font-medium">{T.PRICE}</th><th className="py-1 text-right font-medium">{T.VALUE}</th></tr>
                </thead>
                <tbody>
                  {i.summary.lines.map((l, n) => (
                    <tr key={`${l.sku}-${n}`} className="border-t border-line"><td className="py-1">{l.sku}</td><td className="py-1 text-right">{l.units}</td><td className="py-1 text-right">{money(l.price)}</td><td className="py-1 text-right">{money(l.value)}</td></tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
          {i.request && (
            <details>
              <summary className="cursor-pointer text-ink-600">{T.SHOW_JSON}</summary>
              <pre className="mt-2 max-h-72 overflow-auto rounded bg-alt p-2 text-[11px]">{JSON.stringify(i.request, null, 2)}</pre>
            </details>
          )}
        </div>
      ))}
    </div>
  )
}
