import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { RotateCcw, Trash2 } from 'lucide-react'
import { ApiError } from '../../api/client'
import { approveBulkOrder, cancelBulkOrder, getBulkOrder, rejectBulkOrder, type BulkOrderEvent, type BulkOrderFull, type BulkRights } from '../../api/bulkOrders'
import { Badge, Drawer } from '../../components/ui'
import { BULK_EVENT_LABEL, BULK_STATUS, BULK_STATUS_LABEL, BULK_STATUS_TONE, BULK_TEXT, BULK_TYPE_LABEL } from '../../constants/bulkOrders'
import { lineTotal, priceAfterDiscount, round2, rupees, validDiscount } from '../../lib/bulkPrice'

/*
 * One bulk order (step 1 + 2): details, lines, timeline. While it waits for approval: its type's people may Edit /
 * Cancel; an approver may change qty / discount per line, remove lines, then Approve or Reject (reason). The server
 * prices the approval on today's MRP; the screen shows the order's MRP until then.
 */

const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const errorText = (e: Error) => (e instanceof ApiError && Array.isArray(e.details) ? (e.details as { message: string }[]).map((d) => d.message).join(' · ') : e.message)
const input = 'w-full rounded-md border border-line bg-surface px-2 py-1 text-right text-[13px] outline-none focus:border-primary'

function Timeline({ events }: { events: BulkOrderEvent[] }) {
  return (
    <ol className="relative ml-1 border-l border-line pl-4">
      {events.map((e, i) => (
        <li key={i} className="mb-3 last:mb-0">
          <span className="absolute -left-[5px] mt-1.5 size-2.5 rounded-full border-2 border-surface bg-primary" />
          <div className="text-[13px]"><strong>{BULK_EVENT_LABEL[e.action] ?? e.action}</strong> <span className="text-ink-600">· {e.by.name} · {when(e.at)}</span></div>
          {e.note && <div className="text-[12px] text-ink-600">“{e.note}”</div>}
          {e.changes?.lines?.map((c) => (
            <div key={c.lineNo} className="text-[12px] text-ink-600">
              <span className="font-mono">{c.pepCode}</span>:{' '}
              {c.removed ? BULK_TEXT.REMOVED : [
                c.qty && BULK_TEXT.CHANGED('qty', String(c.qty[0]), String(c.qty[1])),
                c.discountPct && BULK_TEXT.CHANGED('discount', `${c.discountPct[0]}%`, `${c.discountPct[1]}%`),
                c.mrp && BULK_TEXT.CHANGED('MRP', rupees(c.mrp[0]), rupees(c.mrp[1])),
              ].filter(Boolean).join(', ')}
            </div>
          ))}
          {e.changes?.fields && e.changes.fields.length > 0 && <div className="text-[12px] text-ink-600">{BULK_TEXT.EDITED_FIELDS(e.changes.fields.length)}</div>}
        </li>
      ))}
    </ol>
  )
}

export default function BulkOrderDrawer({ id, rights, onClose, onEdit, onToast }: {
  id: string | null
  rights: BulkRights
  onClose: () => void
  onEdit: (o: BulkOrderFull) => void
  onToast: (text: string) => void
}) {
  const qc = useQueryClient()
  const o = useQuery({ queryKey: ['bulk', 'order', id], queryFn: () => getBulkOrder(id!), enabled: !!id })
  const d = o.data
  // approver's working copy: lineNo -> { qty, discount } as typed; removed line numbers
  const [edits, setEdits] = useState<Record<number, { qty: string; discount: string }>>({})
  const [removed, setRemoved] = useState<Set<number>>(new Set())
  const [note, setNote] = useState('')
  const [ask, setAsk] = useState<'' | 'reject' | 'cancel'>('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')

  const reset = () => { setEdits({}); setRemoved(new Set()); setNote(''); setAsk(''); setReason(''); setError('') }
  const close = () => { reset(); onClose() }
  const done = (text: string) => (r: BulkOrderFull) => {
    qc.setQueryData(['bulk', 'order', id], r)
    void qc.invalidateQueries({ queryKey: ['bulk', 'orders'] })
    reset()
    onToast(text)
  }
  const fail = (e: Error) => setError(errorText(e))

  const pending = d?.status === BULK_STATUS.PENDING
  const canDecide = !!d && pending && rights.approve
  const canChange = !!d && pending && rights.create.includes(d.type)

  const rows = (d?.lines ?? []).map((l) => {
    const e = edits[l.lineNo]
    const qty = e ? Number(e.qty) : l.qty
    const disc = e ? (e.discount === '' ? 0 : Number(e.discount)) : l.discountPct
    const ok = Number.isInteger(qty) && qty >= 1 && validDiscount(disc)
    return { l, qty, disc, ok, gone: removed.has(l.lineNo) }
  })
  const keptRows = rows.filter((r) => !r.gone)
  const preview = keptRows.reduce((t, r) => (r.ok ? round2(t + lineTotal(r.l.mrp, r.disc, r.qty)) : t), 0)
  const valid = keptRows.length > 0 && keptRows.every((r) => r.ok)

  const approve = useMutation({
    mutationFn: () => approveBulkOrder(id!, {
      lines: keptRows.filter((r) => r.qty !== r.l.qty || r.disc !== r.l.discountPct).map((r) => ({ lineNo: r.l.lineNo, qty: r.qty, discountPct: r.disc })),
      ...(removed.size ? { removeLines: [...removed] } : {}),
      ...(note.trim() ? { note: note.trim() } : {}),
    }),
    onSuccess: (r) => done(BULK_TEXT.APPROVED(r.poNumber))(r),
    onError: fail,
  })
  const reject = useMutation({ mutationFn: () => rejectBulkOrder(id!, reason.trim()), onSuccess: (r) => done(BULK_TEXT.REJECTED(r.poNumber))(r), onError: fail })
  const cancel = useMutation({ mutationFn: () => cancelBulkOrder(id!, reason.trim() || undefined), onSuccess: (r) => done(BULK_TEXT.CANCELLED(r.poNumber))(r), onError: fail })
  const busy = approve.isPending || reject.isPending || cancel.isPending

  const row = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-4 py-1.5 text-[13px]"><span className="text-ink-600">{k}</span><span className="text-right text-ink-900">{v}</span></div>
  )
  const btn = 'rounded-md px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50'

  const footer = d && (canDecide || canChange) ? (
    ask ? (
      <>
        <input autoFocus className="mr-auto min-w-0 flex-1 rounded-md border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
          placeholder={ask === 'reject' ? BULK_TEXT.REJECT_REASON : BULK_TEXT.CANCEL_REASON} value={reason} onChange={(e) => setReason(e.target.value)} />
        <button onClick={() => { setAsk(''); setReason('') }} className={`${btn} border border-line`}>{BULK_TEXT.KEEP}</button>
        {ask === 'reject'
          ? <button disabled={busy || !reason.trim()} onClick={() => reject.mutate()} className={`${btn} bg-crit text-white`}>{BULK_TEXT.REJECT_CONFIRM}</button>
          : <button disabled={busy} onClick={() => cancel.mutate()} className={`${btn} bg-crit text-white`}>{BULK_TEXT.CANCEL_CONFIRM}</button>}
      </>
    ) : (
      <>
        {canChange && <button disabled={busy} onClick={() => setAsk('cancel')} className={`${btn} mr-auto text-crit hover:bg-crit-soft`}>{BULK_TEXT.CANCEL_ORDER}</button>}
        {canChange && <button disabled={busy} onClick={() => d && onEdit(d)} className={`${btn} border border-line`}>{BULK_TEXT.EDIT}</button>}
        {canDecide && <button disabled={busy} onClick={() => setAsk('reject')} className={`${btn} border border-crit text-crit`}>{BULK_TEXT.REJECT}</button>}
        {canDecide && <button disabled={busy || !valid} onClick={() => approve.mutate()} className={`${btn} bg-ok text-white`}>{BULK_TEXT.APPROVE}{valid ? ` · ${rupees(preview)}` : ''}</button>}
      </>
    )
  ) : undefined

  return (
    <Drawer open={!!id} onClose={close} wide footer={footer}
      title={d ? <span className="font-mono">{d.poNumber}</span> : BULK_TEXT.LOADING}
      sub={d && <span className="inline-flex items-center gap-2">{BULK_TYPE_LABEL[d.type]} · <Badge tone={BULK_STATUS_TONE[d.status] ?? 'neutral'}>{BULK_STATUS_LABEL[d.status] ?? d.status}</Badge></span>}>
      {o.isError && <div className="text-[13px] text-crit">{o.error.message}</div>}
      {error && <div className="mb-3 rounded-md bg-crit-soft px-3 py-2 text-[12px] text-crit">{error}</div>}
      {d && (
        <div className="flex flex-col gap-5">
          <div className="grid gap-5 md:grid-cols-2">
            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.DRAWER_ORDER}</h3>
              {row(BULK_TEXT.ORDERED_BY, d.orderedBy)}
              {row(BULK_TEXT.CREATED_BY, `${d.createdBy.name ?? ''} · ${when(d.createdAt)}`)}
              {row(BULK_TEXT.PRIORITY, d.priority)}
              {d.mode && row(BULK_TEXT.MODE, d.mode)}
              {row(BULK_TEXT.TOTAL_MRP, rupees(d.totalMrp))}
              {row(BULK_TEXT.TOTAL_VALUE, <strong>{rupees(d.totalValue)}</strong>)}
              {d.note && <p className="mt-2 rounded-md bg-alt px-3 py-2 text-[12px] text-ink-600">{d.note}</p>}
            </section>
            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.DRAWER_DELIVERY}</h3>
              {row(BULK_TEXT.NEEDED_BY, day(d.neededBy))}
              {row(BULK_TEXT.RECEIVER_NAME, d.receiverName)}
              {row(BULK_TEXT.RECEIVER_PHONE, d.receiverPhone)}
              {d.location.label && row(BULK_TEXT.LOCATION, d.location.label)}
              <p className="mt-1 text-right text-[13px] text-ink-900">{d.location.address.line}<br />{d.location.address.city}, {d.location.address.state} {d.location.address.pincode}</p>
            </section>
          </div>

          {d.decidedBy && (
            <section className={`rounded-md px-3 py-2 text-[13px] ${d.status === BULK_STATUS.APPROVED ? 'bg-ok-soft' : 'bg-crit-soft'}`}>
              <strong>{BULK_STATUS_LABEL[d.status]}</strong> · {d.decidedBy.name} · {d.decidedAt && when(d.decidedAt)}
              {d.decisionNote && <div className="text-ink-600">“{d.decisionNote}”</div>}
            </section>
          )}

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.DRAWER_LINES} ({d.lines.length})</h3>
            {canDecide && <p className="mb-2 text-[12px] text-ink-600">{BULK_TEXT.APPROVE_HINT}</p>}
            <div className="overflow-x-auto rounded-md border border-line">
              <table className="w-full min-w-[640px] text-left text-[13px]">
                <thead className="bg-alt/60 text-[11px] font-semibold uppercase text-ink-600">
                  <tr><th className="px-3 py-2">{BULK_TEXT.COL_SKU}</th><th className="px-3 py-2 text-right">{BULK_TEXT.COL_MRP}</th><th className="px-3 py-2 text-right">{BULK_TEXT.COL_QTY}</th><th className="px-3 py-2 text-right">{BULK_TEXT.COL_DISCOUNT}</th><th className="px-3 py-2 text-right">{BULK_TEXT.COL_PRICE}</th><th className="px-3 py-2 text-right">{BULK_TEXT.COL_TOTAL}</th>{canDecide && <th className="w-8" />}</tr>
                </thead>
                <tbody>
                  {rows.map(({ l, qty, disc, ok, gone }) => (
                    <tr key={l.lineNo} className={`border-t border-line ${gone ? 'opacity-40 line-through' : ''}`}>
                      <td className="px-3 py-2"><div className="font-mono text-[12px] font-semibold">{l.pepCode}</div><div className="text-[11px] text-ink-600">{l.name}</div>
                        {(l.qty !== l.requestedQty || l.discountPct !== l.requestedDiscountPct) && <div className="text-[11px] text-warn">{BULK_TEXT.CHANGED_BY_APPROVER(l.requestedQty, l.requestedDiscountPct)}</div>}</td>
                      <td className="px-3 py-2 text-right tnum">{rupees(l.mrp)}</td>
                      {canDecide && !gone ? (
                        <>
                          <td className="w-24 px-2 py-1.5"><input type="number" min={1} step={1} className={`${input} ${Number.isInteger(qty) && qty >= 1 ? '' : 'border-crit'}`} value={edits[l.lineNo]?.qty ?? String(l.qty)}
                            onChange={(e) => setEdits({ ...edits, [l.lineNo]: { qty: e.target.value, discount: edits[l.lineNo]?.discount ?? String(l.discountPct) } })} /></td>
                          <td className="w-24 px-2 py-1.5"><input type="number" min={0} max={100} step={0.01} className={`${input} ${validDiscount(disc) ? '' : 'border-crit'}`} value={edits[l.lineNo]?.discount ?? String(l.discountPct)}
                            onChange={(e) => setEdits({ ...edits, [l.lineNo]: { qty: edits[l.lineNo]?.qty ?? String(l.qty), discount: e.target.value } })} /></td>
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-right tnum">{l.qty}</td>
                          <td className="px-3 py-2 text-right tnum">{l.discountPct}%</td>
                        </>
                      )}
                      <td className="px-3 py-2 text-right tnum">{ok ? rupees(priceAfterDiscount(l.mrp, disc)) : '–'}</td>
                      <td className="px-3 py-2 text-right font-semibold tnum">{ok ? rupees(lineTotal(l.mrp, disc, qty)) : '–'}</td>
                      {canDecide && (
                        <td className="px-1 text-right">
                          <button title={gone ? BULK_TEXT.RESTORE_LINE : BULK_TEXT.REMOVE_LINE} disabled={!gone && keptRows.length === 1}
                            onClick={() => { const n = new Set(removed); if (gone) n.delete(l.lineNo); else n.add(l.lineNo); setRemoved(n) }}
                            className="rounded p-1 text-ink-400 hover:text-crit disabled:opacity-30">{gone ? <RotateCcw className="size-4" /> : <Trash2 className="size-4" />}</button>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {canDecide && (
              <input className="mt-2 w-full rounded-md border border-line px-2.5 py-1.5 text-[13px] outline-none focus:border-primary" placeholder={BULK_TEXT.APPROVER_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
            )}
          </section>

          {d.events.length > 0 && (
            <section>
              <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.TIMELINE}</h3>
              <Timeline events={d.events} />
            </section>
          )}
        </div>
      )}
    </Drawer>
  )
}
