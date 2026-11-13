import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { ApiError } from '../../api/client'
import { TreeSelect } from '../../components/pickers'
import { getBulkProcessOptions, processBulkOrder, type BulkOrderFull } from '../../api/bulkOrders'
import { BULK_FIXED_PRICE, BULK_PAYMENT, BULK_TEXT } from '../../constants/bulkOrders'
import { rupees } from '../../lib/bulkPrice'

/*
 * Bulk Orders step 3b (2026-11-12, POST_FG PO Processing & Review > Bulk Orders, PO review editors): an APPROVED
 * Institutional order -> warehouse + Uniware channel + Uniware customer code (typed: both change often; the person
 * creates the customer in Uniware first) -> Create sale order (a normal saved PO: Processed tab, PO Overview; no Verify
 * step). A customer processed before (same GSTIN, or same name + pincode) is offered: one click fills channel + code.
 * Payment is shown, never blocks.
 * Marketing (2026-11-13): the same panel; every unit at ₹1 (BULK_FIXED_PRICE), channel (e.g. Jiva) + customer code typed
 * for now (user: auto-filled later); no customer book suggestions (no institution).
 */

const input = 'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-primary'
const errorText = (e: Error) => (e instanceof ApiError && Array.isArray(e.details) ? (e.details as { message: string }[]).map((d) => d.message).join(' · ') : e.message)

export function BulkProcessPanel({ d, onDone }: { d: BulkOrderFull; onDone: (r: BulkOrderFull) => void }) {
  const opts = useQuery({ queryKey: ['bulk', 'process-options', d.id], queryFn: () => getBulkProcessOptions(d.id) })
  const [f, setF] = useState({ facilityCode: '', uniwareChannel: '', customerCode: '' })
  const [error, setError] = useState('')
  const go = useMutation({
    mutationFn: () => processBulkOrder(d.id, { facilityCode: f.facilityCode, uniwareChannel: f.uniwareChannel.trim(), customerCode: f.customerCode.trim() }),
    onSuccess: (r) => { setError(''); onDone(r) },
    onError: (e: Error) => setError(errorText(e)),
  })
  const ready = !!f.facilityCode && !!f.uniwareChannel.trim() && !!f.customerCode.trim()
  const warehouses = useMemo(() => (opts.data?.facilities ?? []).map((w) => ({ value: w.code, label: w.code, sub: w.name, parent: w.parentCode })), [opts.data])
  const fixed = BULK_FIXED_PRICE[d.type]
  const unpaid = !!d.payment && d.payment.status !== BULK_PAYMENT.VERIFIED && d.payment.status !== BULK_PAYMENT.NOT_NEEDED

  return (
    <section className="rounded-md border border-primary/40 bg-primary-soft/30 p-3">
      <h3 className="text-[13px] font-semibold text-ink-900">{BULK_TEXT.PROCESS_TITLE}</h3>
      <p className="mb-3 text-[12px] text-ink-600">{BULK_TEXT.PROCESS_SUB}</p>
      {fixed !== undefined && <p className="mb-3 rounded-md bg-primary-soft px-3 py-1.5 text-[12px] text-ink-600">{BULK_TEXT.FIXED_PRICE_NOTE(rupees(fixed))}</p>}
      {unpaid && <p className="mb-3 rounded-md bg-warn-soft px-3 py-1.5 text-[12px] text-ink-600">{BULK_TEXT.PAYMENT_PENDING_NOTE}</p>}
      {opts.isError && <p className="mb-2 text-[12px] text-crit">{opts.error.message}</p>}

      {!!opts.data?.customers.length && (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.SUGGESTED}</div>
          <div className="flex flex-col gap-1.5">
            {opts.data.customers.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3 py-2 text-[12px]">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-ink-900">{c.name}</span>{c.gstin ? ` · ${c.gstin}` : ''}
                  <span className="block text-ink-600">
                    <span className="font-mono">{c.uniwareChannel}</span> · <span className="font-mono">{c.customerCode}</span> · {BULK_TEXT.USED_TIMES(c.usedCount)} · {BULK_TEXT.MATCHED_BY[c.matchedBy] ?? c.matchedBy}
                  </span>
                </span>
                <button type="button" onClick={() => setF((x) => ({ ...x, uniwareChannel: c.uniwareChannel, customerCode: c.customerCode }))}
                  className="rounded-md border border-line px-2.5 py-1 font-semibold text-primary hover:bg-primary-soft">{BULK_TEXT.USE}</button>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-600">{BULK_TEXT.WAREHOUSE}</span>
          {/* main (mother) warehouses, their child warehouses folded under them; search looks through all */}
          <TreeSelect value={f.facilityCode} onChange={(v) => setF({ ...f, facilityCode: v })}
            options={warehouses} placeholder={opts.isLoading ? BULK_TEXT.LOADING : BULK_TEXT.PICK_WAREHOUSE}
            searchPlaceholder={BULK_TEXT.SEARCH_WAREHOUSE} noMatch={BULK_TEXT.NO_WAREHOUSE} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-600">{BULK_TEXT.UNIWARE_CHANNEL}</span>
          <input className={`${input} font-mono`} maxLength={100} value={f.uniwareChannel} onChange={(e) => setF({ ...f, uniwareChannel: e.target.value })} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-600">{BULK_TEXT.CUSTOMER_CODE}</span>
          <input className={`${input} font-mono`} maxLength={100} value={f.customerCode} onChange={(e) => setF({ ...f, customerCode: e.target.value })} />
        </label>
      </div>
      {error && <p className="mt-2 rounded-md bg-crit-soft px-3 py-1.5 text-[12px] text-crit">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button type="button" disabled={!ready || go.isPending} onClick={() => go.mutate()}
          className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">{go.isPending ? BULK_TEXT.CREATING : BULK_TEXT.CREATE_SALE_ORDER}</button>
      </div>
    </section>
  )
}
