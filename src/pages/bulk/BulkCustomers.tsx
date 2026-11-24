import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Search } from 'lucide-react'
import { ApiError } from '../../api/client'
import {
  addInstCustomer, addInstCustomerAddress, listInstCustomers, setInstCustomerAddressActive, updateInstCustomer,
  type BulkAddress, type BulkInstCustomer, type BulkInstCustomerInput, type BulkRights,
} from '../../api/bulkOrders'
import { PageTitle } from '../../components/ui'
import { BULK_INSTITUTION_RE, BULK_TEXT, BULK_TYPE } from '../../constants/bulkOrders'
import { normalPhone } from '../../lib/bulkPrice'

/*
 * Bulk Orders v2 piece 5a (2026-11-24): Institutional customers. Everyone with the Institutional page sees them; its
 * editors add / change / switch off customers and their shipping addresses (nothing is deleted). GSTIN shows
 * "unverified" until finance verifies it (piece 5b); a GSTIN change makes it unverified again.
 */

const input = 'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-primary'
const PIN = /^[1-9]\d{5}$/
const EMPTY_ADDR: BulkAddress = { line: '', city: '', state: '', pincode: '' }
const addrOk = (a: BulkAddress) => !!a.line.trim() && !!a.city.trim() && !!a.state.trim() && PIN.test(a.pincode.trim())
const oneLine = (a: BulkAddress) => `${a.line}, ${a.city}, ${a.state} ${a.pincode}`
const trimA = (a: BulkAddress): BulkAddress => ({ line: a.line.trim(), city: a.city.trim(), state: a.state.trim(), pincode: a.pincode.trim() })
const errText = (e: Error) => (e instanceof ApiError && Array.isArray(e.details) ? (e.details as { message: string }[]).map((d) => d.message).join(' · ') : e.message)

interface Form { companyName: string; gstin: string; billing: BulkAddress; contactName: string; contactPhone: string; contactEmail: string; discount: string; shipLabel: string; ship: BulkAddress }
const blank = (): Form => ({ companyName: '', gstin: '', billing: { ...EMPTY_ADDR }, contactName: '', contactPhone: '', contactEmail: '', discount: '0', shipLabel: '', ship: { ...EMPTY_ADDR } })
const fromCustomer = (c: BulkInstCustomer): Form => ({
  companyName: c.companyName, gstin: c.gstin ?? '', billing: { ...c.billingAddress }, contactName: c.contactName, contactPhone: c.contactPhone,
  contactEmail: c.contactEmail ?? '', discount: String(c.defaultDiscountPct), shipLabel: '', ship: { ...EMPTY_ADDR },
})

function AddressFields({ a, onChange }: { a: BulkAddress; onChange: (a: BulkAddress) => void }) {
  return (
    <>
      <input className={`${input} md:col-span-4`} placeholder={BULK_TEXT.ADDRESS_LINE} value={a.line} onChange={(e) => onChange({ ...a, line: e.target.value })} />
      <input className={`${input} md:col-span-2`} placeholder={BULK_TEXT.CITY} value={a.city} onChange={(e) => onChange({ ...a, city: e.target.value })} />
      <input className={`${input} md:col-span-2`} placeholder={BULK_TEXT.STATE} value={a.state} onChange={(e) => onChange({ ...a, state: e.target.value })} />
      <input className={`${input} md:col-span-2 ${a.pincode && !PIN.test(a.pincode) ? 'border-crit' : ''}`} inputMode="numeric" maxLength={6} placeholder={BULK_TEXT.PINCODE} value={a.pincode} onChange={(e) => onChange({ ...a, pincode: e.target.value.trim() })} />
    </>
  )
}

/** Add (customer = undefined) or change one customer. */
function CustomerForm({ customer, onDone, onCancel }: { customer?: BulkInstCustomer; onDone: (c: BulkInstCustomer) => void; onCancel: () => void }) {
  const [f, setF] = useState<Form>(() => (customer ? fromCustomer(customer) : blank()))
  const [err, setErr] = useState('')
  const d = Number(f.discount)
  const gstinBad = !!f.gstin.trim() && !BULK_INSTITUTION_RE.GSTIN.test(f.gstin.trim().toUpperCase())
  const emailBad = !!f.contactEmail.trim() && !BULK_INSTITUTION_RE.EMAIL.test(f.contactEmail.trim())
  const shipStarted = !customer && (!!f.shipLabel.trim() || !!f.ship.line.trim())
  const ok = !!f.companyName.trim() && !gstinBad && !emailBad && addrOk(f.billing) && !!f.contactName.trim() && !!normalPhone(f.contactPhone)
    && f.discount.trim() !== '' && Number.isFinite(d) && d >= 0 && d < 100 && (!shipStarted || (!!f.shipLabel.trim() && addrOk(f.ship)))
  const save = useMutation({
    mutationFn: () => {
      const body: BulkInstCustomerInput = {
        companyName: f.companyName.trim(), ...(f.gstin.trim() ? { gstin: f.gstin.trim().toUpperCase() } : {}), billingAddress: trimA(f.billing),
        contactName: f.contactName.trim(), contactPhone: f.contactPhone.trim(), ...(f.contactEmail.trim() ? { contactEmail: f.contactEmail.trim() } : {}),
        defaultDiscountPct: Math.round(d * 100) / 100,
        ...(shipStarted ? { addresses: [{ label: f.shipLabel.trim(), address: trimA(f.ship) }] } : {}),
      }
      return customer ? updateInstCustomer(customer.id, { ...body, active: customer.active }) : addInstCustomer(body)
    },
    onSuccess: onDone,
    onError: (e) => setErr(errText(e)),
  })
  const set = (patch: Partial<Form>) => setF((x) => ({ ...x, ...patch }))
  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <div className="mb-3 text-[13px] font-semibold text-ink-900">{customer ? `${BULK_TEXT.CUSTOMER_EDIT}: ${customer.companyName}` : BULK_TEXT.CUSTOMER_ADD}</div>
      <div className="grid gap-2 md:grid-cols-6">
        <input className={`${input} md:col-span-3`} placeholder={BULK_TEXT.COMPANY_NAME} value={f.companyName} onChange={(e) => set({ companyName: e.target.value })} />
        <input className={`${input} uppercase md:col-span-3 ${gstinBad ? 'border-crit' : ''}`} maxLength={15} placeholder={`${BULK_TEXT.GSTIN} (optional)`} value={f.gstin} onChange={(e) => set({ gstin: e.target.value.trim() })} />
        <div className="text-[11px] font-semibold uppercase text-ink-400 md:col-span-6">{BULK_TEXT.BILLING_ADDRESS}</div>
        <AddressFields a={f.billing} onChange={(billing) => set({ billing })} />
        <input className={`${input} md:col-span-2`} placeholder={BULK_TEXT.CONTACT_NAME} value={f.contactName} onChange={(e) => set({ contactName: e.target.value })} />
        <input className={`${input} md:col-span-2 ${f.contactPhone && !normalPhone(f.contactPhone) ? 'border-crit' : ''}`} placeholder={BULK_TEXT.CONTACT_PHONE} value={f.contactPhone} onChange={(e) => set({ contactPhone: e.target.value })} />
        <input className={`${input} md:col-span-2 ${emailBad ? 'border-crit' : ''}`} type="email" placeholder={`${BULK_TEXT.CONTACT_EMAIL} (optional)`} value={f.contactEmail} onChange={(e) => set({ contactEmail: e.target.value })} />
        <label className="flex items-center gap-2 text-[12px] text-ink-600 md:col-span-2">{BULK_TEXT.DEFAULT_DISCOUNT}
          <input type="number" min={0} max={99.99} step={0.01} className={`${input} w-24`} value={f.discount} onChange={(e) => set({ discount: e.target.value })} /></label>
        {!customer && (
          <>
            <div className="text-[11px] font-semibold uppercase text-ink-400 md:col-span-6">{BULK_TEXT.SHIP_ADDRESSES} (optional)</div>
            <input className={`${input} md:col-span-2`} placeholder={BULK_TEXT.SHIP_LABEL} value={f.shipLabel} onChange={(e) => set({ shipLabel: e.target.value })} />
            <AddressFields a={f.ship} onChange={(ship) => set({ ship })} />
          </>
        )}
      </div>
      {err && <div className="mt-2 text-[12px] text-crit">{err}</div>}
      <div className="mt-3 flex gap-2">
        <button disabled={!ok || save.isPending} onClick={() => { setErr(''); save.mutate() }} className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">{BULK_TEXT.CUSTOMER_SAVE}</button>
        <button onClick={onCancel} className="rounded-md border border-line px-3 py-1.5 text-[12px] font-semibold">{BULK_TEXT.CANCEL}</button>
      </div>
    </div>
  )
}

/** A new shipping address on a customer. */
function AddShip({ c, onDone }: { c: BulkInstCustomer; onDone: () => void }) {
  const [label, setLabel] = useState('')
  const [a, setA] = useState<BulkAddress>({ ...EMPTY_ADDR })
  const [err, setErr] = useState('')
  const add = useMutation({ mutationFn: () => addInstCustomerAddress(c.id, label.trim(), trimA(a)), onSuccess: () => { setLabel(''); setA({ ...EMPTY_ADDR }); onDone() }, onError: (e) => setErr(errText(e)) })
  return (
    <div className="mt-2 grid gap-2 md:grid-cols-6">
      <input className={`${input} md:col-span-2`} placeholder={BULK_TEXT.SHIP_LABEL} value={label} onChange={(e) => setLabel(e.target.value)} />
      <AddressFields a={a} onChange={setA} />
      <button disabled={!label.trim() || !addrOk(a) || add.isPending} onClick={() => { setErr(''); add.mutate() }} className="rounded-md border border-line px-3 py-1.5 text-[12px] font-semibold text-primary disabled:opacity-50 md:col-span-2">{BULK_TEXT.SHIP_ADD}</button>
      {err && <div className="text-[12px] text-crit md:col-span-6">{err}</div>}
    </div>
  )
}

export default function BulkCustomers({ rights }: { rights: BulkRights }) {
  const qc = useQueryClient()
  const canEdit = rights.create.includes(BULK_TYPE.INSTITUTIONAL)
  const list = useQuery({ queryKey: ['bulk', 'customers'], queryFn: listInstCustomers })
  const [q, setQ] = useState('')
  // a customer id, 'new' (the add form) or null
  const [editing, setEditing] = useState<string | null>(null)
  const [open, setOpen] = useState<string | null>(null)
  const refresh = () => void qc.invalidateQueries({ queryKey: ['bulk', 'customers'] })
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase()
    return (list.data ?? []).filter((c) => !t || [c.companyName, c.gstin ?? '', c.contactName, c.contactPhone].some((v) => v.toLowerCase().includes(t)))
  }, [list.data, q])
  const toggle = useMutation({
    mutationFn: (c: BulkInstCustomer) => updateInstCustomer(c.id, { ...fromInput(c), active: !c.active }),
    onSuccess: refresh,
  })
  const shipToggle = useMutation({ mutationFn: (x: { c: string; a: string; active: boolean }) => setInstCustomerAddressActive(x.c, x.a, x.active), onSuccess: refresh })

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={BULK_TEXT.CUSTOMERS_TITLE} sub={BULK_TEXT.CUSTOMERS_SUB}
        right={canEdit && editing !== 'new' && <button onClick={() => setEditing('new')} className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-white"><Plus className="size-4" />{BULK_TEXT.CUSTOMER_ADD}</button>} />
      {editing === 'new' && <CustomerForm onDone={() => { setEditing(null); refresh() }} onCancel={() => setEditing(null)} />}
      <div className="flex items-center gap-1.5 rounded-md border border-line bg-surface px-2 py-1.5 md:w-96">
        <Search className="size-3.5 text-ink-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={BULK_TEXT.CUSTOMER_SEARCH} className="w-full bg-transparent text-[13px] outline-none" />
      </div>
      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        {list.isPending ? <div className="px-4 py-8 text-center text-[13px] text-ink-600">{BULK_TEXT.LOADING}</div>
          : list.isError ? <div className="px-4 py-8 text-center text-[13px] text-crit">{list.error.message}</div>
          : !shown.length ? <div className="px-4 py-8 text-center text-[13px] text-ink-600">{BULK_TEXT.CUSTOMER_NONE}</div>
          : (
            <ul>
              {shown.map((c) => (
                <li key={c.id} className={`border-t border-line px-4 py-3 first:border-t-0 ${c.active ? '' : 'opacity-60'}`}>
                  {editing === c.id ? <CustomerForm customer={c} onDone={() => { setEditing(null); refresh() }} onCancel={() => setEditing(null)} /> : (
                    <>
                      <div className="flex flex-wrap items-center gap-2">
                        <button onClick={() => setOpen(open === c.id ? null : c.id)} className="text-left text-[13.5px] font-semibold text-ink-900 hover:text-primary">{c.companyName}</button>
                        {c.gstin && <span className="font-mono text-[12px] text-ink-600">{c.gstin}</span>}
                        {c.gstin && <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${c.gstinVerified ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>{c.gstinVerified ? BULK_TEXT.GSTIN_VERIFIED : BULK_TEXT.GSTIN_UNVERIFIED}</span>}
                        {!c.active && <span className="rounded-full bg-alt px-2 py-0.5 text-[11px] text-ink-600">{BULK_TEXT.CUSTOMER_OFF}</span>}
                        <span className="ml-auto text-[12px] text-ink-600">{c.contactName} · {c.contactPhone} · {c.defaultDiscountPct}%</span>
                        {canEdit && <button onClick={() => setEditing(c.id)} className="rounded-md border border-line px-2 py-0.5 text-[12px] font-semibold">{BULK_TEXT.CUSTOMER_EDIT}</button>}
                        {canEdit && <button disabled={toggle.isPending} onClick={() => toggle.mutate(c)} className="rounded-md border border-line px-2 py-0.5 text-[12px] text-ink-600">{c.active ? BULK_TEXT.CUSTOMER_SWITCH_OFF : BULK_TEXT.CUSTOMER_SWITCH_ON}</button>}
                      </div>
                      <div className="text-[12px] text-ink-600">{BULK_TEXT.BILLING_ADDRESS}: {oneLine(c.billingAddress)}</div>
                      {open === c.id && (
                        <div className="mt-2 rounded-md bg-alt/60 p-3">
                          <div className="mb-1 text-[11px] font-semibold uppercase text-ink-400">{BULK_TEXT.SHIP_ADDRESSES} ({c.addresses.filter((a) => a.active).length})</div>
                          {c.addresses.map((a) => (
                            <div key={a.id} className={`flex flex-wrap items-center gap-2 text-[12.5px] ${a.active ? '' : 'opacity-50'}`}>
                              <strong>{a.label}</strong><span className="text-ink-600">{oneLine(a.address)}</span>
                              {canEdit && <button onClick={() => shipToggle.mutate({ c: c.id, a: a.id, active: !a.active })} className="ml-auto text-[11.5px] text-ink-600 underline">{a.active ? BULK_TEXT.CUSTOMER_SWITCH_OFF : BULK_TEXT.CUSTOMER_SWITCH_ON}</button>}
                            </div>
                          ))}
                          {canEdit && <AddShip c={c} onDone={refresh} />}
                        </div>
                      )}
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
      </div>
    </div>
  )
}

/** A customer sent back as it is (to switch it on / off). */
const fromInput = (c: BulkInstCustomer): BulkInstCustomerInput => ({
  companyName: c.companyName, ...(c.gstin ? { gstin: c.gstin } : {}), billingAddress: c.billingAddress, contactName: c.contactName,
  contactPhone: c.contactPhone, ...(c.contactEmail ? { contactEmail: c.contactEmail } : {}), defaultDiscountPct: c.defaultDiscountPct,
})
