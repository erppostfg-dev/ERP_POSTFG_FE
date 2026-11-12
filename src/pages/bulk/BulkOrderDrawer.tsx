import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, FileText, RotateCcw, Trash2, Upload } from 'lucide-react'
import { ApiError } from '../../api/client'
import { approveBulkOrder, bulkDocumentUrl, cancelBulkOrder, getBulkOrder, rejectBulkOrder, setBulkPayment, uploadBulkDocument, type BulkOrderEvent, type BulkOrderFull, type BulkRights } from '../../api/bulkOrders'
import { Badge, Drawer } from '../../components/ui'
import {
  BULK_DOC_ACCEPT, BULK_DOC_KIND, BULK_DOC_KIND_LABEL, BULK_DOC_MAX_BYTES, BULK_EVENT_LABEL, BULK_PAYMENT, BULK_PAYMENT_ACTION, BULK_PAYMENT_LABEL, BULK_PAYMENT_TONE,
  BULK_STATUS, BULK_STATUS_LABEL, BULK_STATUS_TONE, BULK_STEP_OF, BULK_STEPS, BULK_TEXT, BULK_TYPE_LABEL, type BulkPaymentAction,
} from '../../constants/bulkOrders'
import { lineTotal, priceAfterDiscount, round2, rupees, validDiscount } from '../../lib/bulkPrice'

/*
 * One bulk order (step 1 + 2): status timeline on top, details, lines, History (activity log, folded). While it waits for approval: its type's people may Edit /
 * Cancel; an approver may change qty / discount per line, remove lines, then Approve or Reject (reason). The server
 * prices the approval on today's MRP; the screen shows the order's MRP until then.
 * Read only (step 3a, POST_FG PO Processing & Review > Bulk Orders): pass `load` (the team API) and no `rights`.
 * Payment + documents (2026-11-12): payment line under the status timeline (only orders with a payment check), the
 * approver verifies / refuses the proof or marks it not needed; documents list + upload (portal: the type's editors and
 * approvers; our team: `teamCanUpload`). Nothing here blocks approval or processing.
 */

const day = (s: string) => new Date(`${s.slice(0, 10)}T00:00:00`).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })
const errorText = (e: Error) => (e instanceof ApiError && Array.isArray(e.details) ? (e.details as { message: string }[]).map((d) => d.message).join(' · ') : e.message)
const input = 'w-full rounded-md border border-line bg-surface px-2 py-1 text-right text-[13px] outline-none focus:border-primary'

/** The design's status stepper: each step done with who / when where we know it; rejected / cancelled = a closed card. */
function StatusTimeline({ d }: { d: BulkOrderFull }) {
  if (d.status === BULK_STATUS.REJECTED || d.status === BULK_STATUS.CANCELLED) {
    const ev = [...d.events].reverse().find((e) => e.action === d.status)
    return (
      <div className="flex items-start gap-3 rounded-md bg-crit-soft px-3 py-2.5 text-[13px]">
        <span className="mt-1 size-2.5 shrink-0 rounded-full bg-crit" />
        <div>
          <strong>{BULK_STATUS_LABEL[d.status]}</strong> <span className="text-ink-600">· {BULK_TEXT.CLOSED}{ev ? ` · ${ev.by.name ?? ''} · ${when(ev.at)}` : ''}</span>
          {(ev?.note ?? d.decisionNote) && <div className="text-ink-600">“{ev?.note ?? d.decisionNote}”</div>}
        </div>
      </div>
    )
  }
  const at = BULK_STEP_OF[d.status] ?? 0
  const info: (string | null)[] = [
    `${d.createdBy.name ?? ''} · ${when(d.createdAt)}`,
    d.decidedBy && d.decidedAt ? `${d.decidedBy.name ?? ''} · ${when(d.decidedAt)}` : null,
  ]
  return (
    <div>
      <ol className="flex">
        {BULK_STEPS.map((step, i) => (
          <li key={step} className="relative flex flex-1 flex-col items-center text-center">
            {i > 0 && <span className={`absolute right-1/2 top-3 h-0.5 w-full -translate-y-1/2 ${i <= at ? 'bg-ok' : 'bg-line'}`} />}
            <span className={`relative z-10 flex size-6 items-center justify-center rounded-full border-2 ${i <= at ? 'border-ok bg-ok text-white' : i === at + 1 ? 'border-warn bg-surface' : 'border-line bg-surface'}`}>
              {i <= at && <Check className="size-3.5" />}
            </span>
            <span className={`mt-1.5 text-[11px] leading-tight ${i <= at ? 'font-semibold text-ink-900' : 'text-ink-400'}`}>{step}</span>
            {i <= at && info[i] && <span className="mt-0.5 hidden text-[10px] leading-tight text-ink-600 sm:block">{info[i]}</span>}
          </li>
        ))}
      </ol>
      {d.decisionNote && d.status === BULK_STATUS.APPROVED && <p className="mt-2 rounded-md bg-ok-soft px-3 py-1.5 text-[12px] text-ink-600">“{d.decisionNote}”</p>}
      {d.payment && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-line pt-3 text-[13px]">
          <span className="text-ink-600">{BULK_TEXT.PAYMENT}</span>
          <Badge tone={BULK_PAYMENT_TONE[d.payment.status] ?? 'neutral'}>{BULK_PAYMENT_LABEL[d.payment.status] ?? d.payment.status}</Badge>
          {d.payment.by && <span className="text-[12px] text-ink-600">{d.payment.by.name} · {d.payment.at && when(d.payment.at)}</span>}
          {d.payment.note && <span className="w-full text-[12px] text-ink-600">“{d.payment.note}”</span>}
        </div>
      )}
    </div>
  )
}

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
          {e.changes?.fileName && <div className="text-[12px] text-ink-600">{BULK_DOC_KIND_LABEL[e.changes.kind ?? ''] ?? e.changes.kind}: {e.changes.fileName}{e.changes.replaced?.length ? ` (${BULK_TEXT.REPLACED} ${e.changes.replaced.join(', ')})` : ''}</div>}
          {e.changes?.status && <div className="text-[12px] text-ink-600">{BULK_TEXT.CHANGED('', BULK_PAYMENT_LABEL[e.changes.status[0]] ?? e.changes.status[0], BULK_PAYMENT_LABEL[e.changes.status[1]] ?? e.changes.status[1]).trim()}</div>}
        </li>
      ))}
    </ol>
  )
}

export default function BulkOrderDrawer({ id, rights, load, teamCanUpload, onClose, onEdit, onToast }: {
  id: string | null
  /** Our team's view (load given): may they upload documents (PO review editor). */
  teamCanUpload?: boolean
  /** The portal person's rights; none = read only (no Edit / Cancel / Approve / Reject). */
  rights?: BulkRights
  /** Where the order is read from (default the portal API). */
  load?: (id: string) => Promise<BulkOrderFull>
  onClose: () => void
  onEdit?: (o: BulkOrderFull) => void
  onToast?: (text: string) => void
}) {
  const qc = useQueryClient()
  const team = !!load
  const key = ['bulk', team ? 'team-order' : 'order', id]
  const o = useQuery({ queryKey: key, queryFn: () => (load ?? getBulkOrder)(id!), enabled: !!id })
  const d = o.data
  // approver's working copy: lineNo -> { qty, discount } as typed; removed line numbers
  const [edits, setEdits] = useState<Record<number, { qty: string; discount: string }>>({})
  const [removed, setRemoved] = useState<Set<number>>(new Set())
  const [note, setNote] = useState('')
  const [ask, setAsk] = useState<'' | 'reject' | 'cancel'>('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState('')
  const [history, setHistory] = useState(false)
  const [payNote, setPayNote] = useState('')
  const [docKind, setDocKind] = useState('')

  const reset = () => { setEdits({}); setRemoved(new Set()); setNote(''); setAsk(''); setReason(''); setError(''); setPayNote('') }
  const close = () => { reset(); onClose() }
  const done = (text: string) => (r: BulkOrderFull) => {
    qc.setQueryData(key, r)
    void qc.invalidateQueries({ queryKey: ['bulk', 'orders'] })
    void qc.invalidateQueries({ queryKey: ['bulk', 'team-orders'] })
    reset()
    onToast?.(text)
  }
  const fail = (e: Error) => setError(errorText(e))

  const pending = d?.status === BULK_STATUS.PENDING
  const canDecide = !!d && pending && !!rights?.approve
  const canChange = !!d && pending && !!rights?.create.includes(d.type)

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
  const open = !!d && d.status !== BULK_STATUS.REJECTED && d.status !== BULK_STATUS.CANCELLED
  const canUpload = open && (team ? !!teamCanUpload : !!rights && (rights.create.includes(d.type) || rights.approve))
  const canPay = open && !team && !!rights?.approve && !!d?.payment
  const kind = docKind || (d?.payment ? BULK_DOC_KIND.PAYMENT_PROOF : BULK_DOC_KIND.PROFORMA)
  const upload = useMutation({
    mutationFn: (file: File) => uploadBulkDocument(id!, kind, file, team),
    onSuccess: (r) => { done(BULK_TEXT.UPLOADED(r.documents[0]?.fileName ?? ''))(r); setDocKind('') },
    onError: fail,
  })
  const pick = (f: File | undefined) => {
    if (!f) return
    if (f.size > BULK_DOC_MAX_BYTES) { setError(BULK_TEXT.TOO_BIG); return }
    setError('')
    upload.mutate(f)
  }
  const pay = useMutation({
    mutationFn: (action: BulkPaymentAction) => setBulkPayment(id!, action, payNote.trim() || undefined),
    onSuccess: (r) => done(BULK_TEXT.PAYMENT_SAVED(BULK_PAYMENT_LABEL[r.payment?.status ?? ''] ?? ''))(r),
    onError: fail,
  })
  const busy = approve.isPending || reject.isPending || cancel.isPending || upload.isPending || pay.isPending

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
        {canChange && <button disabled={busy} onClick={() => d && onEdit?.(d)} className={`${btn} border border-line`}>{BULK_TEXT.EDIT}</button>}
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
          <section>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.STATUS_TIMELINE}</h3>
            <StatusTimeline d={d} />
          </section>

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

          {(d.documents.length > 0 || canUpload || canPay) && (
            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.DOCUMENTS}</h3>
              <p className="mb-2 text-[12px] text-ink-600">{BULK_TEXT.DOCUMENTS_SUB}</p>
              <div className="divide-y divide-line rounded-md border border-line">
                {d.documents.map((doc) => (
                  <div key={doc.id} className={`flex items-center gap-3 px-3 py-2 text-[13px] ${doc.replacedAt ? 'opacity-50' : ''}`}>
                    <FileText className="size-4 shrink-0 text-ink-400" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-medium">{doc.fileName}{doc.replacedAt && <span className="ml-2 text-[11px] font-normal text-ink-400">({BULK_TEXT.REPLACED})</span>}</div>
                      <div className="text-[11px] text-ink-600">{BULK_DOC_KIND_LABEL[doc.kind] ?? doc.kind} · {doc.by.name} · {when(doc.at)}</div>
                    </div>
                    <a href={bulkDocumentUrl(d.id, doc.id, team)} target="_blank" rel="noreferrer" className="text-[12px] font-semibold text-primary">{BULK_TEXT.VIEW}</a>
                  </div>
                ))}
                {!d.documents.length && <div className="px-3 py-3 text-[12px] text-ink-400">{BULK_TEXT.NO_DOCUMENTS}</div>}
              </div>
              {canUpload && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <select value={kind} onChange={(e) => setDocKind(e.target.value)} className="rounded-md border border-line bg-surface px-2 py-1.5 text-[13px]">
                    {Object.values(BULK_DOC_KIND).map((k) => <option key={k} value={k}>{BULK_DOC_KIND_LABEL[k]}</option>)}
                  </select>
                  <label className={`${btn} inline-flex cursor-pointer items-center gap-1.5 border border-line ${busy ? 'pointer-events-none opacity-50' : 'hover:bg-alt'}`}>
                    <Upload className="size-3.5" />{upload.isPending ? BULK_TEXT.UPLOADING : BULK_TEXT.UPLOAD}
                    <input type="file" accept={BULK_DOC_ACCEPT} className="hidden" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = '' }} />
                  </label>
                </div>
              )}
              {canPay && d.payment && (
                <div className="mt-3 rounded-md bg-alt/60 p-3">
                  <p className="mb-2 text-[12px] text-ink-600">{BULK_TEXT.PAYMENT_HINT}</p>
                  <input className="mb-2 w-full rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-primary" placeholder={BULK_TEXT.PAYMENT_NOTE} value={payNote} onChange={(e) => setPayNote(e.target.value)} />
                  <div className="flex flex-wrap gap-2">
                    {d.payment.status === BULK_PAYMENT.UPLOADED && <button disabled={busy} onClick={() => pay.mutate(BULK_PAYMENT_ACTION.VERIFY)} className={`${btn} bg-ok text-white`}>{BULK_TEXT.VERIFY_PAYMENT}</button>}
                    {d.payment.status === BULK_PAYMENT.UPLOADED && <button disabled={busy || !payNote.trim()} onClick={() => pay.mutate(BULK_PAYMENT_ACTION.REFUSE)} className={`${btn} border border-crit text-crit`}>{BULK_TEXT.REFUSE_PROOF}</button>}
                    {d.payment.status !== BULK_PAYMENT.NOT_NEEDED && <button disabled={busy} onClick={() => pay.mutate(BULK_PAYMENT_ACTION.NOT_NEEDED)} className={`${btn} border border-line`}>{BULK_TEXT.PAYMENT_NOT_NEEDED}</button>}
                  </div>
                </div>
              )}
            </section>
          )}

          {d.events.length > 0 && (
            <section className="rounded-md border border-line">
              <button onClick={() => setHistory(!history)} className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-600 hover:bg-alt/50">
                {BULK_TEXT.TIMELINE} ({d.events.length})
                <ChevronDown className={`size-4 transition-transform ${history ? 'rotate-180' : ''}`} />
              </button>
              {history && <div className="border-t border-line px-3 py-3"><Timeline events={d.events} /></div>}
            </section>
          )}
        </div>
      )}
    </Drawer>
  )
}
