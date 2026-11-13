import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search, Trash2 } from 'lucide-react'
import { ApiError } from '../../api/client'
import { createBulkOrder, listBulkLocations, updateBulkOrder, searchBulkSkus, type BulkOrderFull, type BulkOrderInput, type BulkSku } from '../../api/bulkOrders'
import { Modal } from '../../components/ui'
import { BULK_INSTITUTION_RE, bulkHidesMoney, BULK_LIMIT, BULK_MODES, BULK_PRIORITIES, BULK_TEXT, BULK_TYPE, BULK_TYPE_LABEL, type BulkType } from '../../constants/bulkOrders'
import { lineTotal, normalPhone, priceAfterDiscount, round2, rupees, validDiscount } from '../../lib/bulkPrice'

/*
 * Create a bulk order (design: figma-make-bulk-orders CreateOrder, 3 steps). The screen works prices out as the server
 * will (lib/bulkPrice.ts) but the server reads the MRP from our master again and is the one that decides.
 */

interface Line { key: number; sku: BulkSku | null; qty: string; discount: string }

const { GSTIN: GSTIN_RE, EMAIL: EMAIL_RE } = BULK_INSTITUTION_RE
const todayIst = () => new Date(Date.now() + 5.5 * 3600_000).toISOString().slice(0, 10)
let nextKey = 1
const emptyLine = (): Line => ({ key: nextKey++, sku: null, qty: '1', discount: '0' })

const input = 'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-primary'

function Field({ label, children, wide = false, hint }: { label: string; children: React.ReactNode; wide?: boolean; hint?: string }) {
  return (
    <label className={`flex flex-col gap-1 ${wide ? 'md:col-span-2' : ''}`}>
      <span className="text-[12px] font-medium text-ink-600">{label}</span>
      {children}
      {hint && <span className="text-[11px] text-ink-400">{hint}</span>}
    </label>
  )
}

function Choice<T extends string>({ value, options, onChange }: { value: T; options: readonly T[]; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onChange(o)}
          className={`rounded-md border px-3 py-1.5 text-[12px] ${value === o ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-line text-ink-600 hover:bg-alt'}`}>{o}</button>
      ))}
    </div>
  )
}

/** SKU search box with a result list (code / name / EAN; active SKUs with an MRP only). */
function SkuPicker({ value, taken, onPick, hideMrp = false }: { value: BulkSku | null; taken: Set<string>; onPick: (s: BulkSku) => void; hideMrp?: boolean }) {
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const t = setTimeout(() => setQ(text.trim()), BULK_LIMIT.SKU_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [text])
  const found = useQuery({ queryKey: ['bulk', 'skus', q], queryFn: ({ signal }) => searchBulkSkus(q, signal), enabled: q.length >= BULK_LIMIT.SKU_QUERY_MIN })
  // where the result list goes: right under the search box, kept there while the form scrolls / the window resizes
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<{ top: number; left: number; width: number } | null>(null)
  useLayoutEffect(() => {
    if (!open) return
    const place = () => {
      const r = box.current?.getBoundingClientRect()
      if (r) setAt({ top: r.bottom + 4, left: r.left, width: r.width })
    }
    place()
    window.addEventListener('scroll', place, true)
    window.addEventListener('resize', place)
    return () => {
      window.removeEventListener('scroll', place, true)
      window.removeEventListener('resize', place)
    }
  }, [open])
  if (value && !open) {
    return (
      <button type="button" onClick={() => { setOpen(true); setText('') }} className="w-full rounded-md border border-line px-2.5 py-1 text-left hover:border-primary">
        <div className="font-mono text-[12px] font-semibold text-ink-900">{value.pepCode}</div>
        <div className="truncate text-[11px] text-ink-600">{value.name}</div>
      </button>
    )
  }
  const typed = text.trim()
  return (
    <div ref={box}>
      <div className="flex items-center gap-1.5 rounded-md border border-line px-2 py-1.5 focus-within:border-primary">
        <Search className="size-3.5 text-ink-400" />
        <input autoFocus={open} value={text} onChange={(e) => { setText(e.target.value); setOpen(true) }} onFocus={() => setOpen(true)}
          onBlur={() => setTimeout(() => setOpen(false), 150)} placeholder={BULK_TEXT.SKU_SEARCH} className="w-full bg-transparent text-[13px] outline-none" />
      </div>
      {/* drawn on the page itself (fixed, under the box): inside the table / form scroll areas it was cut off */}
      {open && typed && at && createPortal(
        <div style={{ position: 'fixed', top: at.top, left: at.left, width: Math.max(at.width, 340) }}
          className="z-[70] max-h-64 overflow-y-auto rounded-md border border-line bg-surface shadow-lg">
          {typed.length < BULK_LIMIT.SKU_QUERY_MIN ? <div className="px-3 py-2 text-[12px] text-ink-600">{BULK_TEXT.SKU_TYPE_MORE}</div>
            : found.isError ? <div className="px-3 py-2 text-[12px] text-crit">{found.error.message}</div>
            : (found.isFetching && !found.data) || typed !== q ? <div className="px-3 py-2 text-[12px] text-ink-600">{BULK_TEXT.LOADING}</div>
            : !found.data?.length ? <div className="px-3 py-2 text-[12px] text-ink-600">{BULK_TEXT.SKU_NONE}</div>
            : found.data.map((s) => (
              <button key={s.pepCode} type="button" disabled={taken.has(s.pepCode)} onMouseDown={(e) => e.preventDefault()}
                onClick={() => { onPick(s); setOpen(false); setText('') }}
                className="flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left hover:bg-alt disabled:opacity-40">
                <span className="min-w-0"><span className="block font-mono text-[12px] font-semibold">{s.pepCode}</span><span className="block truncate text-[11px] text-ink-600">{s.name}</span></span>
                {!hideMrp && <span className="text-[12px] tnum text-ink-900">{rupees(s.mrp)}</span>}
              </button>
            ))}
        </div>,
        document.body,
      )}
    </div>
  )
}

/** `initial` (step 2): edit that pending order (same PO number, type fixed); else a new order. */
export default function BulkCreateOrder({ types, initial, onClose, onCreated }: { types: BulkType[]; initial?: BulkOrderFull; onClose: () => void; onCreated: (o: BulkOrderFull) => void }) {
  const qc = useQueryClient()
  const [type, setType] = useState<BulkType>(initial?.type ?? types[0])
  const [step, setStep] = useState(1)
  const [lines, setLines] = useState<Line[]>(() => initial
    ? initial.lines.map((l) => ({ key: nextKey++, sku: { pepCode: l.pepCode, name: l.name, mrp: l.mrp, ean: null }, qty: String(l.qty), discount: String(l.discountPct) }))
    : [emptyLine()])
  const [form, setForm] = useState<Record<'orderedBy' | 'neededBy' | 'receiverName' | 'receiverPhone' | 'mode' | 'priority' | 'note', string>>(initial
    ? { orderedBy: initial.orderedBy, neededBy: initial.neededBy.slice(0, 10), receiverName: initial.receiverName, receiverPhone: initial.receiverPhone, mode: initial.mode ?? 'Courier', priority: initial.priority, note: initial.note ?? '' }
    : { orderedBy: '', neededBy: '', receiverName: '', receiverPhone: '', mode: 'Courier', priority: BULK_PRIORITIES[0], note: '' })
  const [where, setWhere] = useState<string>(initial?.location.id ?? 'new') // 'new' or a saved location id
  const [address, setAddress] = useState(initial && !initial.location.id ? { ...initial.location.address } : { line: '', city: '', state: '', pincode: '' })
  const [saveAs, setSaveAs] = useState('')
  const [errors, setErrors] = useState<string[]>([])
  // Institutional requester details (2026-11-12): name + billing required, GSTIN / email optional
  const [inst, setInst] = useState(() => ({
    name: initial?.institution?.name ?? '', gstin: initial?.institution?.gstin ?? '', email: initial?.institution?.email ?? '',
    same: !initial?.institution || JSON.stringify(initial.institution.billingAddress) === JSON.stringify(initial.location.address),
    billing: initial?.institution ? { ...initial.institution.billingAddress } : { line: '', city: '', state: '', pincode: '' },
  }))
  const setI = (patch: Partial<typeof inst>) => setInst((x) => ({ ...x, ...patch }))

  const locations = useQuery({ queryKey: ['bulk', 'locations', type], queryFn: () => listBulkLocations(type) })

  const set = (patch: Partial<typeof form>) => setForm((f) => ({ ...f, ...patch }))
  const setLine = (key: number, patch: Partial<Line>) => setLines((ls) => ls.map((l) => (l.key === key ? { ...l, ...patch } : l)))
  const taken = useMemo(() => new Set(lines.flatMap((l) => (l.sku ? [l.sku.pepCode] : []))), [lines])

  const parsed = lines.map((l) => ({ ...l, q: Number(l.qty), d: l.discount === '' || bulkHidesMoney(type) ? 0 : Number(l.discount) }))
  const lineOk = (l: (typeof parsed)[number]) => !!l.sku && Number.isInteger(l.q) && l.q >= 1 && validDiscount(l.d)
  const itemsOk = parsed.length > 0 && parsed.every(lineOk)
  const totals = parsed.reduce((t, l) => (l.sku && lineOk(l) ? { units: t.units + l.q, mrp: round2(t.mrp + l.sku.mrp * l.q), value: round2(t.value + lineTotal(l.sku.mrp, l.d, l.q)) } : t), { units: 0, mrp: 0, value: 0 })

  const phone = normalPhone(form.receiverPhone)
  const addressOk = where !== 'new' || (!!address.line.trim() && !!address.city.trim() && !!address.state.trim() && /^[1-9]\d{5}$/.test(address.pincode.trim()))
  const isInst = type === BULK_TYPE.INSTITUTIONAL
  // Marketing (2026-11-13): every unit ₹1 on the server, no discount; the portal shows SKU + qty only
  const noMoney = bulkHidesMoney(type)
  const gstinBad = !!inst.gstin.trim() && !GSTIN_RE.test(inst.gstin.trim().toUpperCase())
  const emailBad = !!inst.email.trim() && !EMAIL_RE.test(inst.email.trim())
  const billingOk = inst.same || (!!inst.billing.line.trim() && !!inst.billing.city.trim() && !!inst.billing.state.trim() && /^[1-9]\d{5}$/.test(inst.billing.pincode.trim()))
  const instOk = !isInst || (!!inst.name.trim() && !gstinBad && !emailBad && billingOk)
  const deliveryOk = !!form.orderedBy.trim() && !!form.neededBy && form.neededBy >= todayIst() && !!form.receiverName.trim() && !!phone && addressOk && instOk

  const save = useMutation({
    mutationFn: (body: BulkOrderInput) => (initial ? updateBulkOrder(initial.id, body) : createBulkOrder(body)),
    onSuccess: (o) => {
      void qc.invalidateQueries({ queryKey: ['bulk'] })
      onCreated(o)
    },
    onError: (e) => {
      const details = e instanceof ApiError && Array.isArray(e.details) ? (e.details as { message: string }[]).map((d) => d.message) : []
      setErrors(details.length ? details : [e.message])
    },
  })

  const submit = () => {
    setErrors([])
    save.mutate({
      type,
      orderedBy: form.orderedBy.trim(),
      receiverName: form.receiverName.trim(),
      receiverPhone: form.receiverPhone,
      ...(where === 'new'
        ? { address: { line: address.line.trim(), city: address.city.trim(), state: address.state.trim(), pincode: address.pincode.trim() }, ...(saveAs.trim() ? { saveLocationAs: saveAs.trim() } : {}) }
        : { locationId: where }),
      neededBy: form.neededBy,
      ...(type === BULK_TYPE.MARKETING ? { mode: form.mode } : {}),
      priority: form.priority,
      ...(form.note.trim() ? { note: form.note.trim() } : {}),
      lines: parsed.map((l) => (noMoney ? { pepCode: l.sku!.pepCode, qty: l.q } : { pepCode: l.sku!.pepCode, qty: l.q, discountPct: l.d })),
      ...(isInst ? {
        institutionName: inst.name.trim(),
        ...(inst.gstin.trim() ? { gstin: inst.gstin.trim().toUpperCase() } : {}),
        ...(inst.email.trim() ? { contactEmail: inst.email.trim() } : {}),
        billingSameAsDelivery: inst.same,
        ...(inst.same ? {} : { billingAddress: { line: inst.billing.line.trim(), city: inst.billing.city.trim(), state: inst.billing.state.trim(), pincode: inst.billing.pincode.trim() } }),
      } : {}),
    })
  }

  const saved = locations.data?.find((l) => l.id === where)

  const footer = (
    <>
      <span className="mr-auto text-[12px] text-ink-600">{totals.units} {BULK_TEXT.TOTAL_UNITS} · <strong className="text-ink-900">{rupees(totals.value)}</strong></span>
      {step > 1 ? <button onClick={() => setStep(step - 1)} className="rounded-md border border-line px-3 py-1.5 text-[12px] font-semibold">{BULK_TEXT.BACK}</button>
        : <button onClick={onClose} className="rounded-md border border-line px-3 py-1.5 text-[12px] font-semibold">{BULK_TEXT.CANCEL}</button>}
      {step < 3 ? (
        <button onClick={() => setStep(step + 1)} disabled={step === 1 ? !itemsOk : !deliveryOk} className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">{BULK_TEXT.NEXT}</button>
      ) : (
        <button onClick={submit} disabled={save.isPending} className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">{save.isPending ? BULK_TEXT.SUBMITTING : initial ? BULK_TEXT.SAVE_CHANGES : BULK_TEXT.SUBMIT}</button>
      )}
    </>
  )

  return (
    <Modal open wide onClose={onClose} title={initial ? BULK_TEXT.EDIT_TITLE(initial.poNumber) : BULK_TEXT.CREATE} sub={`${BULK_TYPE_LABEL[type]} order`} footer={footer}>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {BULK_TEXT.STEPS.map((label, i) => (
          <div key={label} className={`flex items-center gap-2 text-[12px] ${step >= i + 1 ? 'text-primary' : 'text-ink-400'}`}>
            <span className={`grid size-5 place-items-center rounded-full text-[11px] font-bold ${step >= i + 1 ? 'bg-primary text-white' : 'bg-alt'}`}>{i + 1}</span>
            <strong className="font-semibold">{label}</strong>
            {i < 2 && <span className="h-px w-6 bg-line" />}
          </div>
        ))}
        {types.length > 1 && step === 1 && (
          <div className="ml-auto flex items-center gap-2 text-[12px] text-ink-600">{BULK_TEXT.TYPE}<Choice value={BULK_TYPE_LABEL[type]} options={types.map((t) => BULK_TYPE_LABEL[t])} onChange={(v) => { setType(types.find((t) => BULK_TYPE_LABEL[t] === v)!); setWhere('new') /* saved locations are per type */ }} /></div>
        )}
      </div>

      {errors.length > 0 && (
        <ul className="mb-3 list-disc rounded-md bg-crit-soft py-2 pl-7 pr-3 text-[12px] text-crit">{errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
      )}

      {step === 1 && (
        <div>
          <h3 className="text-[14px] font-semibold text-ink-900">{BULK_TEXT.ITEMS_TITLE}</h3>
          <p className="mb-3 text-[12px] text-ink-600">{noMoney ? BULK_TEXT.ITEMS_SUB_QTY_ONLY : BULK_TEXT.ITEMS_SUB}</p>
          <div className="overflow-x-auto">
            <table className={`w-full ${noMoney ? 'min-w-[480px]' : 'min-w-[720px]'} text-left text-[13px]`}>
              <thead className="text-[11px] font-semibold uppercase text-ink-600">
                {noMoney
                  ? <tr><th className="w-8 py-1.5">#</th><th className="py-1.5">{BULK_TEXT.COL_SKU}</th><th className="w-28 py-1.5 pl-3">{BULK_TEXT.COL_QTY}</th><th className="w-8" /></tr>
                  : <tr><th className="w-8 py-1.5">#</th><th className="py-1.5">{BULK_TEXT.COL_SKU}</th><th className="py-1.5 text-right">{BULK_TEXT.COL_MRP}</th><th className="w-24 py-1.5 pl-3">{BULK_TEXT.COL_QTY}</th><th className="w-28 py-1.5 pl-3">{BULK_TEXT.COL_DISCOUNT}</th><th className="py-1.5 text-right">{BULK_TEXT.COL_PRICE}</th><th className="py-1.5 text-right">{BULK_TEXT.COL_TOTAL}</th><th className="w-8" /></tr>}
              </thead>
              <tbody>
                {parsed.map((l, i) => {
                  const badQty = !(Number.isInteger(l.q) && l.q >= 1)
                  const badD = !validDiscount(l.d)
                  return (
                    <tr key={l.key} className="border-t border-line align-top">
                      <td className="py-2 text-[11px] text-ink-400">{String(i + 1).padStart(2, '0')}</td>
                      <td className="py-2 pr-2"><SkuPicker value={l.sku} taken={taken} hideMrp={noMoney} onPick={(s) => setLine(l.key, { sku: s })} /></td>
                      {!noMoney && <td className="py-2 text-right tnum">{l.sku ? rupees(l.sku.mrp) : '–'}</td>}
                      <td className="py-2 pl-3"><input type="number" min={1} step={1} value={l.qty} onChange={(e) => setLine(l.key, { qty: e.target.value })} className={`${input} ${badQty ? 'border-crit' : ''}`} /></td>
                      {!noMoney && <>
                        <td className="py-2 pl-3"><input type="number" min={0} max={100} step={0.01} value={l.discount} onChange={(e) => setLine(l.key, { discount: e.target.value })} className={`${input} ${badD ? 'border-crit' : ''}`} /></td>
                        <td className="py-2 text-right tnum">{l.sku && !badD ? rupees(priceAfterDiscount(l.sku.mrp, l.d)) : '–'}</td>
                        <td className="py-2 text-right font-semibold tnum">{l.sku && !badD && !badQty ? rupees(lineTotal(l.sku.mrp, l.d, l.q)) : '–'}</td>
                      </>}
                      <td className="py-2 text-right">
                        <button type="button" disabled={lines.length === 1} onClick={() => setLines((ls) => ls.filter((x) => x.key !== l.key))} className="rounded p-1 text-ink-400 hover:text-crit disabled:opacity-30"><Trash2 className="size-4" /></button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <button type="button" disabled={lines.length >= BULK_LIMIT.LINES_MAX} onClick={() => setLines((ls) => [...ls, emptyLine()])}
            className="mt-3 inline-flex items-center gap-1.5 rounded-md border border-dashed border-line px-3 py-1.5 text-[12px] font-semibold text-primary hover:bg-primary-soft/50"><Plus className="size-4" />{BULK_TEXT.ADD_LINE}</button>
        </div>
      )}

      {step === 2 && (
        <div>
          <h3 className="text-[14px] font-semibold text-ink-900">{BULK_TEXT.DELIVERY_TITLE}</h3>
          <p className="mb-3 text-[12px] text-ink-600">{BULK_TEXT.DELIVERY_SUB}</p>
          <div className="grid gap-3 md:grid-cols-2">
            <Field label={BULK_TEXT.ORDERED_BY} hint={BULK_TEXT.ORDERED_BY_HINT[type]}><input className={input} value={form.orderedBy} onChange={(e) => set({ orderedBy: e.target.value })} /></Field>
            <Field label={BULK_TEXT.NEEDED_BY}><input type="date" min={todayIst()} className={input} value={form.neededBy} onChange={(e) => set({ neededBy: e.target.value })} /></Field>
            <Field label={BULK_TEXT.RECEIVER_NAME}><input className={input} value={form.receiverName} onChange={(e) => set({ receiverName: e.target.value })} /></Field>
            <Field label={BULK_TEXT.RECEIVER_PHONE}><input className={`${input} ${form.receiverPhone && !phone ? 'border-crit' : ''}`} placeholder="+91 98765 43210" value={form.receiverPhone} onChange={(e) => set({ receiverPhone: e.target.value })} /></Field>
            <Field label={BULK_TEXT.LOCATION} wide>
              <select className={input} value={where} onChange={(e) => setWhere(e.target.value)}>
                <option value="new">{BULK_TEXT.NEW_ADDRESS}</option>
                {locations.data?.map((l) => <option key={l.id} value={l.id}>{l.label} · {l.address.city} {l.address.pincode}</option>)}
              </select>
            </Field>
            {where === 'new' ? (
              <>
                <Field label={BULK_TEXT.ADDRESS_LINE} wide><input className={input} value={address.line} onChange={(e) => setAddress({ ...address, line: e.target.value })} /></Field>
                <Field label={BULK_TEXT.CITY}><input className={input} value={address.city} onChange={(e) => setAddress({ ...address, city: e.target.value })} /></Field>
                <Field label={BULK_TEXT.STATE}><input className={input} value={address.state} onChange={(e) => setAddress({ ...address, state: e.target.value })} /></Field>
                <Field label={BULK_TEXT.PINCODE}><input inputMode="numeric" maxLength={6} className={`${input} ${address.pincode && !/^[1-9]\d{5}$/.test(address.pincode) ? 'border-crit' : ''}`} value={address.pincode} onChange={(e) => setAddress({ ...address, pincode: e.target.value.trim() })} /></Field>
                <Field label={BULK_TEXT.SAVE_AS} hint={BULK_TEXT.SAVE_AS_HINT}><input className={input} value={saveAs} onChange={(e) => setSaveAs(e.target.value)} /></Field>
              </>
            ) : saved && (
              <p className="rounded-md bg-alt px-3 py-2 text-[12px] text-ink-600 md:col-span-2">{saved.address.line}, {saved.address.city}, {saved.address.state} {saved.address.pincode}</p>
            )}
            {type === BULK_TYPE.MARKETING && <Field label={BULK_TEXT.MODE}><Choice value={form.mode} options={BULK_MODES} onChange={(v) => set({ mode: v })} /></Field>}
            <Field label={BULK_TEXT.PRIORITY}><Choice value={form.priority} options={BULK_PRIORITIES} onChange={(v) => set({ priority: v })} /></Field>
            <Field label={BULK_TEXT.NOTE} wide><textarea rows={2} className={input} value={form.note} onChange={(e) => set({ note: e.target.value })} /></Field>
          </div>
          {isInst && (
            <div className="mt-5 border-t border-line pt-4">
              <h3 className="text-[14px] font-semibold text-ink-900">{BULK_TEXT.INSTITUTION_TITLE}</h3>
              <p className="mb-3 text-[12px] text-ink-600">{BULK_TEXT.INSTITUTION_SUB}</p>
              <div className="grid gap-3 md:grid-cols-2">
                <Field label={BULK_TEXT.INSTITUTION_NAME} wide><input className={input} maxLength={200} value={inst.name} onChange={(e) => setI({ name: e.target.value })} /></Field>
                <Field label={BULK_TEXT.GSTIN} hint={gstinBad ? BULK_TEXT.BAD_GSTIN : undefined}><input className={`${input} uppercase ${gstinBad ? 'border-crit' : ''}`} maxLength={15} value={inst.gstin} onChange={(e) => setI({ gstin: e.target.value.trim() })} /></Field>
                <Field label={BULK_TEXT.CONTACT_EMAIL} hint={emailBad ? BULK_TEXT.BAD_EMAIL : undefined}><input type="email" className={`${input} ${emailBad ? 'border-crit' : ''}`} maxLength={150} value={inst.email} onChange={(e) => setI({ email: e.target.value })} /></Field>
                <label className="flex items-center gap-2 text-[13px] text-ink-900 md:col-span-2">
                  <input type="checkbox" checked={inst.same} onChange={(e) => setI({ same: e.target.checked })} />{BULK_TEXT.BILLING_SAME}
                </label>
                {!inst.same && (
                  <>
                    <Field label={BULK_TEXT.BILLING_LINE} wide><input className={input} value={inst.billing.line} onChange={(e) => setI({ billing: { ...inst.billing, line: e.target.value } })} /></Field>
                    <Field label={BULK_TEXT.CITY}><input className={input} value={inst.billing.city} onChange={(e) => setI({ billing: { ...inst.billing, city: e.target.value } })} /></Field>
                    <Field label={BULK_TEXT.STATE}><input className={input} value={inst.billing.state} onChange={(e) => setI({ billing: { ...inst.billing, state: e.target.value } })} /></Field>
                    <Field label={BULK_TEXT.PINCODE}><input inputMode="numeric" maxLength={6} className={`${input} ${inst.billing.pincode && !/^[1-9]\d{5}$/.test(inst.billing.pincode) ? 'border-crit' : ''}`} value={inst.billing.pincode} onChange={(e) => setI({ billing: { ...inst.billing, pincode: e.target.value.trim() } })} /></Field>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 3 && (
        <div>
          <h3 className="text-[14px] font-semibold text-ink-900">{BULK_TEXT.REVIEW_TITLE}</h3>
          <p className="mb-3 text-[12px] text-ink-600">{BULK_TEXT.REVIEW_SUB}</p>
          <div className="grid gap-4 text-[13px] md:grid-cols-2">
            <div className="rounded-md border border-line p-3">
              <div className="font-semibold">{form.orderedBy}</div>
              <div className="text-ink-600">{BULK_TYPE_LABEL[type]} · {form.priority}{type === BULK_TYPE.MARKETING ? ` · ${form.mode}` : ''}</div>
              <div className="mt-2 text-ink-600">{BULK_TEXT.NEEDED_BY}: <span className="text-ink-900">{form.neededBy}</span></div>
            </div>
            <div className="rounded-md border border-line p-3">
              <div className="font-semibold">{form.receiverName} · {phone}</div>
              <div className="text-ink-600">{where === 'new' ? `${address.line}, ${address.city}, ${address.state} ${address.pincode}` : saved && `${saved.label}: ${saved.address.line}, ${saved.address.city} ${saved.address.pincode}`}</div>
            </div>
            {isInst && (
              <div className="rounded-md border border-line p-3 md:col-span-2">
                <div className="font-semibold">{inst.name}{inst.gstin ? ` · ${inst.gstin.toUpperCase()}` : ''}</div>
                <div className="text-ink-600">{inst.same ? BULK_TEXT.BILLING_SAME : `${inst.billing.line}, ${inst.billing.city}, ${inst.billing.state} ${inst.billing.pincode}`}{inst.email ? ` · ${inst.email}` : ''}</div>
              </div>
            )}
          </div>
          <table className="mt-3 w-full text-left text-[13px]">
            <tbody>
              {parsed.map((l) => l.sku && (
                <tr key={l.key} className="border-t border-line">
                  <td className="py-1.5"><span className="font-mono text-[12px] font-semibold">{l.sku.pepCode}</span> <span className="text-ink-600">{l.sku.name}</span></td>
                  {noMoney
                    ? <td className="py-1.5 text-right font-semibold tnum" colSpan={2}>{l.q}</td>
                    : <>
                      <td className="py-1.5 text-right tnum">{l.q} × {rupees(priceAfterDiscount(l.sku.mrp, l.d))}{l.d ? <span className="text-ink-400"> ({l.d}% off {rupees(l.sku.mrp)})</span> : null}</td>
                      <td className="py-1.5 text-right font-semibold tnum">{rupees(lineTotal(l.sku.mrp, l.d, l.q))}</td>
                    </>}
                </tr>
              ))}
              {noMoney
                ? <tr className="border-t border-line"><td className="py-2" /><td className="py-2 text-right text-[14px] font-semibold text-ink-900" colSpan={2}>{totals.units} {BULK_TEXT.TOTAL_UNITS}</td></tr>
                : <tr className="border-t border-line"><td className="py-2 text-ink-600">{BULK_TEXT.TOTAL_MRP} {rupees(totals.mrp)}</td><td className="py-2 text-right text-ink-600">{totals.units} {BULK_TEXT.TOTAL_UNITS}</td><td className="py-2 text-right text-[14px] font-semibold tnum">{rupees(totals.value)}</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  )
}
