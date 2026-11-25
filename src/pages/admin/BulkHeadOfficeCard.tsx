import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { useState } from 'react'
import { ApiError } from '../../api/client'
import { getHeadOffice, saveHeadOffice, type BulkHeadOffice } from '../../api/bulkOrders'
import { BULK_TEXT } from '../../constants/bulkOrders'

const input = 'w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-primary'
type Form = Record<'receiverName' | 'receiverPhone' | 'line' | 'city' | 'state' | 'pincode', string>
const formOf = (h: BulkHeadOffice | null | undefined): Form => ({
  receiverName: h?.receiverName ?? '', receiverPhone: h?.receiverPhone ?? '', line: h?.line ?? '', city: h?.city ?? '', state: h?.state ?? '', pincode: h?.pincode ?? '',
})

/** 2026-11-25 (user): the head office address = the default delivery of Head office orders; another address needs approval. */
function HeadOfficeForm({ saved }: { saved: BulkHeadOffice | null }) {
  const qc = useQueryClient()
  const [f, setF] = useState<Form>(() => formOf(saved))
  const [done, setDone] = useState(false)
  const save = useMutation({
    mutationFn: () => saveHeadOffice({ receiverName: f.receiverName, receiverPhone: f.receiverPhone, address: { line: f.line, city: f.city, state: f.state, pincode: f.pincode } }),
    onSuccess: (h) => { qc.setQueryData(['bulk', 'head-office'], h); void qc.invalidateQueries({ queryKey: ['bulk', 'form-meta'] }); setDone(true) },
  })
  const details = save.error instanceof ApiError && Array.isArray(save.error.details) ? (save.error.details as { field?: string; message: string }[]) : []
  const bad = (k: string) => details.find((d) => d.field === k)?.message
  const field = (k: keyof Form, label: string, errKey: string, wide = false) => (
    <label className={`block ${wide ? 'md:col-span-2' : ''}`}>
      <span className="mb-1 block text-[12px] font-medium text-ink-600">{label}</span>
      <input className={`${input} ${bad(errKey) ? 'border-crit' : ''}`} value={f[k]} onChange={(e) => { setDone(false); setF((x) => ({ ...x, [k]: e.target.value })) }} />
      {bad(errKey) && <span className="mt-0.5 block text-[11.5px] text-crit">{bad(errKey)}</span>}
    </label>
  )
  return (
    <>
      <div className="mt-2 grid max-w-3xl gap-2.5 md:grid-cols-2">
        {field('receiverName', BULK_TEXT.RECEIVER_NAME, 'receiverName')}
        {field('receiverPhone', BULK_TEXT.RECEIVER_PHONE, 'receiverPhone')}
        {field('line', BULK_TEXT.ADDRESS_LINE, 'address.line', true)}
        {field('city', BULK_TEXT.CITY, 'address.city')}
        {field('state', BULK_TEXT.STATE, 'address.state')}
        {field('pincode', BULK_TEXT.PINCODE, 'address.pincode')}
      </div>
      <div className="mt-2.5 flex items-center gap-2">
        <button type="button" disabled={save.isPending} onClick={() => save.mutate()} className="rounded-md bg-primary px-3 py-1.5 text-[12.5px] font-medium text-white disabled:opacity-50">{BULK_TEXT.HO_SAVE}</button>
        {done && <span className="text-[12px] text-ok">{BULK_TEXT.HO_SAVED}</span>}
        {save.error && !details.length && <span className="text-[12px] text-crit">{save.error.message}</span>}
      </div>
    </>
  )
}

export function BulkHeadOfficeCard() {
  const q = useQuery({ queryKey: ['bulk', 'head-office'], queryFn: getHeadOffice })
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <Building2 className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="flex-1">
        <div className="text-[14px] font-semibold text-ink-900">{BULK_TEXT.HO_TITLE}</div>
        <p className="mt-1 max-w-3xl text-[12.5px] text-ink-600">{BULK_TEXT.HO_SUB}</p>
        {q.data === null && <p className="mt-1 text-[12px] text-ink-400">{BULK_TEXT.HO_NOT_SET}</p>}
        {q.isSuccess && <HeadOfficeForm saved={q.data} />}
        {q.error && <p className="mt-1 text-[12px] text-crit">{q.error.message}</p>}
      </div>
    </div>
  )
}
