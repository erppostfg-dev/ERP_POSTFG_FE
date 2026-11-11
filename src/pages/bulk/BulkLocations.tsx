import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ApiError } from '../../api/client'
import { addBulkLocation, listBulkLocations, type BulkRights } from '../../api/bulkOrders'
import { PageTitle } from '../../components/ui'
import { BULK_TEXT, BULK_TYPE_LABEL, type BulkType } from '../../constants/bulkOrders'

/* Bulk Orders portal: saved delivery locations per type (also saved from the order form). */

const input = 'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-primary'
const EMPTY = { label: '', line: '', city: '', state: '', pincode: '' }

export default function BulkLocations({ rights }: { rights: BulkRights }) {
  const qc = useQueryClient()
  const [type, setType] = useState<BulkType>(rights.view[0])
  const [f, setF] = useState(EMPTY)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const list = useQuery({ queryKey: ['bulk', 'locations', type], queryFn: () => listBulkLocations(type) })
  const canAdd = rights.create.includes(type)
  const add = useMutation({
    mutationFn: () => addBulkLocation({ type, label: f.label.trim(), address: { line: f.line.trim(), city: f.city.trim(), state: f.state.trim(), pincode: f.pincode.trim() } }),
    onSuccess: (l) => {
      setF(EMPTY)
      setMsg({ ok: true, text: BULK_TEXT.LOCATION_SAVED(l.label) })
      void qc.invalidateQueries({ queryKey: ['bulk', 'locations'] })
    },
    onError: (e) => setMsg({ ok: false, text: e instanceof ApiError && Array.isArray(e.details) ? (e.details as { message: string }[]).map((d) => d.message).join(' · ') : e.message }),
  })
  const ok = f.label.trim() && f.line.trim() && f.city.trim() && f.state.trim() && /^[1-9]\d{5}$/.test(f.pincode.trim())

  return (
    <div className="flex flex-col gap-5">
      <PageTitle title={BULK_TEXT.LOCATIONS_TITLE} sub={BULK_TEXT.LOCATIONS_SUB}
        right={rights.view.length > 1 && (
          <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
            {rights.view.map((t) => <button key={t} onClick={() => setType(t)} className={`rounded px-2.5 py-1 text-[12px] ${type === t ? 'bg-primary-soft font-semibold text-primary' : 'text-ink-600'}`}>{BULK_TYPE_LABEL[t]}</button>)}
          </div>
        )} />

      {canAdd && (
        <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
          <div className="mb-3 text-[13px] font-semibold text-ink-900">{BULK_TEXT.ADD_LOCATION}</div>
          <div className="grid gap-2 md:grid-cols-6">
            <input className={`${input} md:col-span-2`} placeholder={BULK_TEXT.LABEL} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} />
            <input className={`${input} md:col-span-4`} placeholder={BULK_TEXT.ADDRESS_LINE} value={f.line} onChange={(e) => setF({ ...f, line: e.target.value })} />
            <input className={`${input} md:col-span-2`} placeholder={BULK_TEXT.CITY} value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
            <input className={`${input} md:col-span-2`} placeholder={BULK_TEXT.STATE} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })} />
            <input className={input} inputMode="numeric" maxLength={6} placeholder={BULK_TEXT.PINCODE} value={f.pincode} onChange={(e) => setF({ ...f, pincode: e.target.value })} />
            <button disabled={!ok || add.isPending} onClick={() => { setMsg(null); add.mutate() }} className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">{BULK_TEXT.SAVE}</button>
          </div>
          {msg && <div className={`mt-2 text-[12px] ${msg.ok ? 'text-ok' : 'text-crit'}`}>{msg.text}</div>}
        </div>
      )}

      <div className="rounded-[var(--radius-card)] border border-line bg-surface">
        {list.isPending ? <div className="px-4 py-8 text-center text-[13px] text-ink-600">{BULK_TEXT.LOADING}</div>
          : list.isError ? <div className="px-4 py-8 text-center text-[13px] text-crit">{list.error.message}</div>
          : !list.data.length ? <div className="px-4 py-8 text-center text-[13px] text-ink-600">{BULK_TEXT.NO_LOCATIONS}</div>
          : (
            <ul>
              {list.data.map((l) => (
                <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-2 border-t border-line px-4 py-2.5 first:border-t-0">
                  <span className="text-[13px] font-semibold text-ink-900">{l.label}</span>
                  <span className="text-[12px] text-ink-600">{l.address.line}, {l.address.city}, {l.address.state} {l.address.pincode}</span>
                </li>
              ))}
            </ul>
          )}
      </div>
    </div>
  )
}
