import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client'
import { GroupedSelect } from '../../components/pickers'
import { getBulkProcessOptions, hideBulkCustomer, processBulkOrder, type BulkCustomerMatch, type BulkOrderFull } from '../../api/bulkOrders'
import { BULK_FIXED_PRICE, BULK_PAYMENT, BULK_TEXT } from '../../constants/bulkOrders'
import { rupees } from '../../lib/bulkPrice'

/*
 * Bulk Orders step 3b (2026-11-12, POST_FG PO Processing & Review > Bulk Orders, PO review editors): an APPROVED
 * order -> warehouse + Uniware channel + Uniware customer code (typed: the person creates the customer in Uniware first)
 * -> Create sale order (a normal saved PO: Processed tab, PO Overview; no Verify step). Payment is shown, never blocks.
 * Marketing (2026-11-13): the same panel; every unit at MARKETING_UNIT_PRICE (BULK_FIXED_PRICE; ₹0.01 since v2).
 * Address book (2026-11-13, user: "fill it, but they have to create the sale order by checking"): every processed
 * order saves its delivery address + channel + code (both types). The SAME delivery address seen before -> channel + code
 * FILLED from the newest one, and "Create sale order" waits for the tick "I checked ...". Same GSTIN / name + pincode =
 * suggestions only ("Use" fills them, the same tick then). "Don't suggest" hides a saved one (never deleted).
 */

const input = 'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-primary'
const errorText = (e: Error) => (e instanceof ApiError && Array.isArray(e.details) ? (e.details as { message: string }[]).map((d) => d.message).join(' · ') : e.message)
const day = (s: string) => new Date(s).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const oneLine = (a: { line: string; city: string | null; pincode: string | null } | null) => (a ? [a.line, a.city, a.pincode].filter(Boolean).join(', ') : '')

/** Channel + code being typed, and the saved one they came from (null = typed by hand). */
interface Pick { uniwareChannel: string; customerCode: string; fromId: string | null }

export function BulkProcessPanel({ d, onDone }: { d: BulkOrderFull; onDone: (r: BulkOrderFull) => void }) {
  const qc = useQueryClient()
  const key = ['bulk', 'process-options', d.id]
  const opts = useQuery({ queryKey: key, queryFn: () => getBulkProcessOptions(d.id) })
  const customers = useMemo(() => opts.data?.customers ?? [], [opts.data])
  const [facilityCode, setFacility] = useState('')
  // null = not touched: the newest saved code of the same delivery address is used (filled)
  const [picked, setPicked] = useState<Pick | null>(null)
  const auto = customers[0]?.matchedBy === 'address' ? customers[0] : null
  const f: Pick = picked ?? (auto ? { uniwareChannel: auto.uniwareChannel, customerCode: auto.customerCode, fromId: auto.id } : { uniwareChannel: '', customerCode: '', fromId: null })
  const from = customers.find((c) => c.id === f.fromId) ?? null
  // still the saved values -> the person must tick that they checked them
  const fromSaved = from !== null && from.uniwareChannel === f.uniwareChannel.trim() && from.customerCode === f.customerCode.trim()
  const [checkedFor, setCheckedFor] = useState<string | null>(null)
  const checked = fromSaved && checkedFor === `${from.id}|${f.uniwareChannel}|${f.customerCode}`
  const [askHide, setAskHide] = useState<string | null>(null)
  const [error, setError] = useState('')

  const go = useMutation({
    mutationFn: () => processBulkOrder(d.id, { facilityCode, uniwareChannel: f.uniwareChannel.trim(), customerCode: f.customerCode.trim() }),
    onSuccess: (r) => { setError(''); onDone(r) },
    onError: (e: Error) => setError(errorText(e)),
  })
  const hide = useMutation({
    mutationFn: (c: BulkCustomerMatch) => hideBulkCustomer(c.id),
    onSuccess: (_r, c) => {
      setAskHide(null)
      // the hidden one was in the fields: empty them (the next saved one of the address fills in by itself)
      if (f.fromId === c.id) setPicked(picked ? { uniwareChannel: '', customerCode: '', fromId: null } : null)
      void qc.invalidateQueries({ queryKey: key })
    },
    onError: (e: Error) => setError(errorText(e)),
  })
  const ready = !!facilityCode && !!f.uniwareChannel.trim() && !!f.customerCode.trim() && (!fromSaved || checked)
  // 2026-11-25: two groups, mother (MWH) and child (D2C / MWH under a mother); search looks through both
  const warehouses = useMemo(() => {
    const item = (w: { code: string; name: string | null; parentCode: string | null }) => ({ value: w.code, label: [w.code, w.name, w.parentCode ? `under ${w.parentCode}` : null].filter(Boolean).join(' · ') })
    const all = opts.data?.facilities ?? []
    return [
      { label: BULK_TEXT.WH_MOTHER, items: all.filter((w) => w.group === 'mother').map(item) },
      { label: BULK_TEXT.WH_CHILD, items: all.filter((w) => w.group === 'child').map(item) },
    ]
  }, [opts.data])
  const fixed = BULK_FIXED_PRICE[d.type]
  const unpaid = !!d.payment && d.payment.status !== BULK_PAYMENT.VERIFIED && d.payment.status !== BULK_PAYMENT.NOT_NEEDED
  const type = (k: 'uniwareChannel' | 'customerCode', v: string) => setPicked({ ...f, [k]: v })

  return (
    <section className="rounded-md border border-primary/40 bg-primary-soft/30 p-3">
      <h3 className="text-[13px] font-semibold text-ink-900">{BULK_TEXT.PROCESS_TITLE}</h3>
      <p className="mb-3 text-[12px] text-ink-600">{BULK_TEXT.PROCESS_SUB}</p>
      {fixed !== undefined && <p className="mb-3 rounded-md bg-primary-soft px-3 py-1.5 text-[12px] text-ink-600">{BULK_TEXT.FIXED_PRICE_NOTE(rupees(fixed))}</p>}
      {unpaid && <p className="mb-3 rounded-md bg-warn-soft px-3 py-1.5 text-[12px] text-ink-600">{BULK_TEXT.PAYMENT_PENDING_NOTE}</p>}
      {opts.isError && <p className="mb-2 text-[12px] text-crit">{opts.error.message}</p>}

      {customers.length > 0 && (
        <div className="mb-3">
          <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.SUGGESTED}</div>
          <div className="flex flex-col gap-1.5">
            {customers.map((c) => (
              <div key={c.id} className={`pf-fade-in flex flex-wrap items-center gap-2 rounded-md border px-3 py-2 text-[12px] transition-colors duration-200 ${c.id === f.fromId ? 'border-primary bg-primary-soft/50' : 'border-line bg-surface'}`}>
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-ink-900">{c.name}</span>{c.gstin ? ` · ${c.gstin}` : ''}
                  {c.deliveryAddress && <span className="block truncate text-ink-600">{c.receiverName ? `${c.receiverName} · ` : ''}{oneLine(c.deliveryAddress)}</span>}
                  <span className="block text-ink-600">
                    <span className="font-mono">{c.uniwareChannel}</span> · <span className="font-mono">{c.customerCode}</span> · {BULK_TEXT.USED_TIMES(c.usedCount)} · {BULK_TEXT.LAST_USED(day(c.lastUsedAt))} · <span className={c.matchedBy === 'address' ? 'font-semibold text-ok' : ''}>{BULK_TEXT.MATCHED_BY[c.matchedBy] ?? c.matchedBy}</span>
                  </span>
                </span>
                {askHide === c.id ? (
                  <span className="flex items-center gap-1.5">
                    <span className="text-ink-600">{BULK_TEXT.HIDE_ASK}</span>
                    <button type="button" disabled={hide.isPending} onClick={() => hide.mutate(c)} className="rounded-md border border-crit px-2 py-1 font-semibold text-crit hover:bg-crit-soft disabled:opacity-50">{BULK_TEXT.HIDE_YES}</button>
                    <button type="button" onClick={() => setAskHide(null)} className="rounded-md border border-line px-2 py-1 hover:bg-alt">{BULK_TEXT.HIDE_NO}</button>
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5">
                    <button type="button" onClick={() => setAskHide(c.id)} className="rounded-md px-2 py-1 text-ink-400 hover:bg-alt hover:text-ink-900">{BULK_TEXT.HIDE}</button>
                    <button type="button" onClick={() => setPicked({ uniwareChannel: c.uniwareChannel, customerCode: c.customerCode, fromId: c.id })}
                      className="rounded-md border border-line px-2.5 py-1 font-semibold text-primary hover:bg-primary-soft">{BULK_TEXT.USE}</button>
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-3">
        <div className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-600">{BULK_TEXT.WAREHOUSE}</span>
          {/* 2026-11-25: Mother warehouses (MWH) and Child warehouses, each a group; search looks through both */}
          <GroupedSelect value={facilityCode} onChange={setFacility} groups={warehouses} placeholder={opts.isLoading ? BULK_TEXT.LOADING : BULK_TEXT.PICK_WAREHOUSE} />
        </div>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-600">{BULK_TEXT.UNIWARE_CHANNEL}</span>
          <input className={`${input} font-mono`} maxLength={100} value={f.uniwareChannel} onChange={(e) => type('uniwareChannel', e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[12px] font-medium text-ink-600">{BULK_TEXT.CUSTOMER_CODE}</span>
          <input className={`${input} font-mono`} maxLength={100} value={f.customerCode} onChange={(e) => type('customerCode', e.target.value)} />
        </label>
      </div>

      {fromSaved && (
        <div key={from.id} className="pf-fade-in mt-3 rounded-md border border-warn/40 bg-warn-soft/60 px-3 py-2 text-[12px] text-ink-600">
          <p>{BULK_TEXT.FILLED_FROM(from.usedCount, day(from.lastUsedAt))}</p>
          <label className="mt-1.5 flex cursor-pointer items-center gap-2 font-medium text-ink-900">
            <input type="checkbox" className="size-4 accent-[var(--color-primary)]" checked={checked}
              onChange={(e) => setCheckedFor(e.target.checked ? `${from.id}|${f.uniwareChannel}|${f.customerCode}` : null)} />
            {BULK_TEXT.CHECKED}
          </label>
        </div>
      )}
      {error && <p className="mt-2 rounded-md bg-crit-soft px-3 py-1.5 text-[12px] text-crit">{error}</p>}
      <div className="mt-3 flex justify-end">
        <button type="button" disabled={!ready || go.isPending} onClick={() => go.mutate()}
          className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-white transition-opacity duration-200 disabled:opacity-50">{go.isPending ? BULK_TEXT.CREATING : BULK_TEXT.CREATE_SALE_ORDER}</button>
      </div>
    </section>
  )
}
