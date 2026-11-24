import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, RotateCcw, Trash2 } from 'lucide-react'
import { ApiError } from '../../api/client'
import { approveBulkOrder, cancelBulkOrder, remindBulkOrder, getBulkOrder, rejectBulkOrder, setBulkPayment, uploadBulkDocument, type BulkOrderEvent, type BulkOrderFull, type BulkRights } from '../../api/bulkOrders'
import { Badge, Drawer } from '../../components/ui'
import {
  BULK_DOC_KIND_LABEL, BULK_DOC_MAX_BYTES, BULK_EVENT_LABEL, BULK_PAYMENT_LABEL, BULK_PAYMENT_TONE,
  BULK_EDITABLE, BULK_FIELD_LABEL, BULK_FIXED_PRICE, bulkHidesMoney, BULK_PROCESS_TYPES, BULK_PROCESSABLE, BULK_STATUS, BULK_STATUS_LABEL, BULK_STATUS_TONE, BULK_STEP_OF, BULK_STEPS, BULK_TEXT, BULK_TYPE_LABEL, type BulkPaymentAction,
} from '../../constants/bulkOrders'
import { BulkProcessPanel } from '../ops/BulkProcessPanel'
import { BulkDocumentViewer } from './BulkDocumentViewer'
import { BulkDocumentsSection } from './BulkDocumentsSection'
import { lineTooSmall, lineTotal, round2, rupees, unitPrice, validDiscount } from '../../lib/bulkPrice'

/*
 * One bulk order (step 1 + 2): status timeline on top, details, lines, History (activity log, folded). While it waits for approval: its type's people may Edit /
 * Cancel; an approver may change qty / discount per line, remove lines, then Approve or Reject (reason). The server
 * prices the approval on today's MRP; the screen shows the order's MRP until then.
 * Read only (step 3a, POST_FG PO Processing & Review > Bulk Orders): pass `load` (the team API) and no `rights`.
 * Payment + documents (2026-11-12): payment line under the status timeline (only orders with a payment check), the
 * "verify payments" permission verifies / refuses the proof or marks it not needed; documents list + upload (portal: the type's editors and
 * approvers; our team: `teamCanUpload`). Nothing here blocks approval or processing.
 * Step 3b (2026-11-12): Institution details; our team's editors (`teamCanUpload`) get "Create sale order" on an approved
 * Institutional order (BulkProcessPanel); the sale order shows under the timeline (Processing step).
 * Marketing / Head office: every unit at MARKETING_UNIT_PRICE (₹0.01, v2), no discount; in the PORTAL (requester + approver) no amount at all (SKU + qty only),
 * our team (POST_FG) sees the real prices and gets "Create sale order" as for Institutional.
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
  // v2 1c: an order that needed no approval shows that step as "No approval needed"
  const steps = BULK_STEPS.map((s, i) => (i === 1 && !d.decidedBy && at >= 1 ? BULK_TEXT.STEP_NO_APPROVAL : s))
  const info: (string | null)[] = [
    `${d.createdBy.name ?? ''} · ${when(d.createdAt)}`,
    d.decidedBy && d.decidedAt ? `${d.decidedBy.name ?? ''} · ${when(d.decidedAt)}` : null,
    d.saleOrder?.by && d.saleOrder.at ? `${d.saleOrder.by.name ?? ''} · ${when(d.saleOrder.at)}` : null,
  ]
  return (
    <div>
      <ol className="flex">
        {steps.map((step, i) => (
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
      {d.tracking && (
        <div className="mt-3 rounded-md border border-line px-3 py-2 text-[12.5px]">
          <div className="mb-1 flex items-center gap-2 font-semibold text-ink-900">{BULK_TEXT.TRACKING}
            {d.tracking.link && /^https?:\/\//.test(d.tracking.link) && <a href={d.tracking.link} target="_blank" rel="noreferrer" className="text-[12px] font-normal text-primary underline">{BULK_TEXT.TRACK_LINK}</a>}
          </div>
          <div className="grid gap-x-4 gap-y-0.5 sm:grid-cols-2">
            {([[BULK_TEXT.AWB, d.tracking.awb], [BULK_TEXT.COURIER, d.tracking.courier], [BULK_TEXT.COURIER_STATUS, d.tracking.courierStatus],
              [BULK_TEXT.DISPATCHED_ON, d.tracking.dispatchedAt && when(d.tracking.dispatchedAt)], [BULK_TEXT.DELIVERED_ON, d.tracking.deliveredAt && when(d.tracking.deliveredAt)],
              [BULK_TEXT.INVOICE, d.tracking.invoiceCode]] as [string, string | null][]).filter(([, v]) => v).map(([k, v]) => (
              <div key={k}><span className="text-ink-600">{k}: </span><span className="font-mono text-ink-900">{v}</span></div>
            ))}
          </div>
          {d.tracking.checkedAt && <div className="mt-1 text-[11px] text-ink-400">{BULK_TEXT.TRACKING_UPDATED(when(d.tracking.checkedAt))}</div>}
        </div>
      )}
      {d.saleOrder && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line pt-3 text-[13px]">
          <span className="text-ink-600">{BULK_TEXT.SALE_ORDER}</span>
          <span className="font-mono font-semibold">{d.saleOrder.code}</span>
          <span className="text-[12px] text-ink-600">{BULK_TEXT.WAREHOUSE} <span className="font-mono text-ink-900">{d.saleOrder.facilityCode}</span></span>
          <span className="text-[12px] text-ink-600">{BULK_TEXT.UNIWARE_CHANNEL} <span className="font-mono text-ink-900">{d.saleOrder.uniwareChannel}</span></span>
          <span className="text-[12px] text-ink-600">{BULK_TEXT.CUSTOMER_CODE} <span className="font-mono text-ink-900">{d.saleOrder.customerCode}</span></span>
        </div>
      )}
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

/** A history value as words: dates as stored, empty as "(empty)". */
const show = (v: string | number | null): string => (v === null || v === '' ? BULK_TEXT.EMPTY_VALUE : String(v).slice(0, 80))

function Timeline({ events, noMoney = false }: { events: BulkOrderEvent[]; noMoney?: boolean }) {
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
                !noMoney && c.discountPct && BULK_TEXT.CHANGED('discount', `${c.discountPct[0]}%`, `${c.discountPct[1]}%`),
                !noMoney && c.mrp && BULK_TEXT.CHANGED('MRP', rupees(c.mrp[0]), rupees(c.mrp[1])),
              ].filter(Boolean).join(', ')}
            </div>
          ))}
          {e.action === 'edited' && e.changes?.status && <div className="text-[12px] text-ink-600">{BULK_TEXT.EVENT_STATUS(BULK_STATUS_LABEL[e.changes.status[0]] ?? e.changes.status[0], BULK_STATUS_LABEL[e.changes.status[1]] ?? e.changes.status[1])}</div>}
          {e.changes?.approval && (e.action === 'created' || (e.action === 'edited' && e.changes.status)) && <div className="text-[12px] text-ink-600">{e.changes.approval.length ? BULK_TEXT.EVENT_APPROVAL(e.changes.approval.join(', ')) : BULK_TEXT.EVENT_NO_APPROVAL}</div>}
          {e.changes?.fieldChanges
            ? e.changes.fieldChanges.map((f) => <div key={f.field} className="text-[12px] text-ink-600">{BULK_TEXT.CHANGE_FROM_TO(BULK_FIELD_LABEL[f.field] ?? f.field, show(f.from), show(f.to))}</div>)
            : e.changes?.fields && e.changes.fields.length > 0 && <div className="text-[12px] text-ink-600">{BULK_TEXT.EDITED_FIELDS(e.changes.fields.length)}</div>}
          {e.changes?.lineChanges?.map((c) => (
            <div key={`${c.pepCode}-${c.change}`} className="text-[12px] text-ink-600">
              {c.change === 'added' ? BULK_TEXT.LINE_ADDED(c.pepCode, c.qty?.[1] ?? 0) : c.change === 'removed' ? BULK_TEXT.LINE_REMOVED(c.pepCode) : [
                c.qty && BULK_TEXT.CHANGE_FROM_TO(`${c.pepCode} qty`, String(c.qty[0]), String(c.qty[1])),
                !noMoney && c.discountPct && BULK_TEXT.CHANGE_FROM_TO(`${c.pepCode} discount`, `${c.discountPct[0]}%`, `${c.discountPct[1]}%`),
              ].filter(Boolean).join(', ')}
            </div>
          ))}
          {e.changes?.fileName && <div className="text-[12px] text-ink-600">{BULK_DOC_KIND_LABEL[e.changes.kind ?? ''] ?? e.changes.kind}: {e.changes.fileName}{e.changes.replaced?.length ? ` (${BULK_TEXT.REPLACED} ${e.changes.replaced.join(', ')})` : ''}</div>}
          {e.changes?.saleOrderCode && <div className="text-[12px] text-ink-600"><span className="font-mono">{e.changes.saleOrderCode}</span>{e.changes.facilityCode ? ` · ${e.changes.facilityCode} · ${e.changes.uniwareChannel ?? ''} · ${e.changes.customerCode ?? ''}` : ''}</div>}
          {e.changes?.status && <div className="text-[12px] text-ink-600">{BULK_TEXT.CHANGED('', BULK_PAYMENT_LABEL[e.changes.status[0]] ?? e.changes.status[0], BULK_PAYMENT_LABEL[e.changes.status[1]] ?? e.changes.status[1]).trim()}</div>}
        </li>
      ))}
    </ol>
  )
}

export default function BulkOrderDrawer({ id, rights, load, teamCanUpload, teamCanVerifyPayment, onClose, onEdit, onToast }: {
  id: string | null
  /** Our team's view: may they verify payments (special permission "Bulk Orders: verify payments", 2026-11-13). */
  teamCanVerifyPayment?: boolean
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
  // the document shown in the in-app viewer (2026-11-13; was a new tab)
  const [viewDoc, setViewDoc] = useState<string | null>(null)

  const reset = () => { setEdits({}); setRemoved(new Set()); setNote(''); setAsk(''); setReason(''); setError('') }
  const close = () => { reset(); setViewDoc(null); onClose() }
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
  // v2 1c: the requester changes a pending OR submitted order (before its sale order)
  const canChange = !!d && BULK_EDITABLE.includes(d.status) && !!rights?.create.includes(d.type)
  // v2 piece 3: the requester's type may remind our team once the order waited long enough (server checks again)
  const canRemind = !team && !!d && !!d.remindAt && !!rights?.create.includes(d.type)
  const remindNow = !!d?.remindAt && new Date(d.remindAt).getTime() <= Date.now()
  const remind = useMutation({
    mutationFn: () => remindBulkOrder(id!),
    onSuccess: (o) => { qc.setQueryData(key, o); onToast?.(BULK_TEXT.REMINDED(o.poNumber)) },
    onError: (e) => setError(e.message),
  })
  // Marketing: the portal shows no money; prices at the type's fixed price
  const fixed = d ? BULK_FIXED_PRICE[d.type] : undefined
  const noMoney = !team && !!d && bulkHidesMoney(d.type)

  const rows = (d?.lines ?? []).map((l) => {
    const e = edits[l.lineNo]
    const qty = e ? Number(e.qty) : l.qty
    const disc = fixed !== undefined ? 0 : e ? (e.discount === '' ? 0 : Number(e.discount)) : l.discountPct
    const ok = Number.isInteger(qty) && qty >= 1 && validDiscount(disc) && !lineTooSmall(lineTotal(l.mrp, disc, qty, fixed), fixed)
    return { l, qty, disc, ok, gone: removed.has(l.lineNo) }
  })
  const keptRows = rows.filter((r) => !r.gone)
  const preview = keptRows.reduce((t, r) => (r.ok ? round2(t + lineTotal(r.l.mrp, r.disc, r.qty, fixed)) : t), 0)
  const valid = keptRows.length > 0 && keptRows.every((r) => r.ok)

  const approve = useMutation({
    mutationFn: () => approveBulkOrder(id!, {
      lines: keptRows.filter((r) => r.qty !== r.l.qty || r.disc !== r.l.discountPct).map((r) => (fixed !== undefined ? { lineNo: r.l.lineNo, qty: r.qty } : { lineNo: r.l.lineNo, qty: r.qty, discountPct: r.disc })),
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
  // who verifies payments (2026-11-13): the special permission, in the portal and in POST_FG (was the portal approver)
  const canPay = open && !!d?.payment && (team ? !!teamCanVerifyPayment : !!rights?.verifyPayment)
  const upload = useMutation({
    mutationFn: ({ kind, file }: { kind: string; file: File }) => uploadBulkDocument(id!, kind, file, team),
    onSuccess: (r) => done(BULK_TEXT.UPLOADED(r.documents[0]?.fileName ?? ''))(r),
    onError: fail,
  })
  const pick = (kind: string, f: File) => {
    if (f.size > BULK_DOC_MAX_BYTES) { setError(BULK_TEXT.TOO_BIG); return }
    setError('')
    upload.mutate({ kind, file: f })
  }
  const pay = useMutation({
    mutationFn: ({ action, note: n }: { action: BulkPaymentAction; note: string }) => setBulkPayment(id!, action, n.trim() || undefined, team),
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
        {canRemind && d && (
          <button disabled={busy || !remindNow} title={remindNow ? BULK_TEXT.REMIND_HINT : BULK_TEXT.REMIND_AT(when(d.remindAt!))} onClick={() => remind.mutate()} className={`${btn} border border-line`}>
            {BULK_TEXT.REMIND}{!remindNow ? ` · ${when(d.remindAt!)}` : ''}
          </button>
        )}
        {canChange && <button disabled={busy} onClick={() => setAsk('cancel')} className={`${btn} mr-auto text-crit hover:bg-crit-soft`}>{d?.status === BULK_STATUS.DRAFT ? BULK_TEXT.DISCARD_DRAFT : BULK_TEXT.CANCEL_ORDER}</button>}
        {canChange && <button disabled={busy} onClick={() => d && onEdit?.(d)} className={`${btn} border border-line`}>{d?.status === BULK_STATUS.DRAFT ? BULK_TEXT.CONTINUE_DRAFT : BULK_TEXT.EDIT}</button>}
        {canDecide && <button disabled={busy} onClick={() => setAsk('reject')} className={`${btn} border border-crit text-crit`}>{BULK_TEXT.REJECT}</button>}
        {canDecide && <button disabled={busy || !valid} onClick={() => approve.mutate()} className={`${btn} bg-ok text-white`}>{BULK_TEXT.APPROVE}{valid && !noMoney ? ` · ${rupees(preview)}` : ''}</button>}
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
          {d.editCount > 0 && <p className="rounded-md bg-warn-soft px-3 py-2 text-[12.5px] text-ink-900">{BULK_TEXT.EDITED_BANNER(d.editCount)}</p>}
          <section>
            <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.STATUS_TIMELINE}</h3>
            <StatusTimeline d={d} />
          </section>

          <div className="grid gap-5 md:grid-cols-2">
            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.DRAWER_ORDER}</h3>
              {row(BULK_TEXT.ORDERED_BY, d.orderedBy)}
              {d.brand && row(BULK_TEXT.BRAND_LABEL, d.brand)}
              {row(BULK_TEXT.CREATED_BY, `${d.createdBy.name ?? ''} · ${when(d.createdAt)}`)}
              {row(BULK_TEXT.PRIORITY, d.priority)}
              {d.mode && row(BULK_TEXT.MODE, d.mode)}
              {noMoney ? <>{row(BULK_TEXT.COL_QTY, `${d.totalUnits} ${BULK_TEXT.TOTAL_UNITS}`)}{row(BULK_TEXT.TOTAL_VALUE, BULK_TEXT.FREE_ORDER)}</> : <>
                {row(BULK_TEXT.TOTAL_MRP, rupees(d.totalMrp))}
                {row(BULK_TEXT.TOTAL_VALUE, <strong>{rupees(d.totalValue)}</strong>)}
              </>}
              {d.note && <p className="mt-2 rounded-md bg-alt px-3 py-2 text-[12px] text-ink-600">{d.note}</p>}
            </section>
            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.DRAWER_DELIVERY}</h3>
              {row(BULK_TEXT.NEEDED_BY, d.neededBy ? day(d.neededBy) : "–")}
              {d.fastTrackRemarks && row(BULK_TEXT.FAST_TRACK_REMARKS, d.fastTrackRemarks)}
              {d.purpose && row(BULK_TEXT.PURPOSE, d.purpose)}
              {row(BULK_TEXT.RECEIVER_NAME, d.receiverName)}
              {row(BULK_TEXT.RECEIVER_PHONE, d.receiverPhone)}
              {d.location.label && row(BULK_TEXT.LOCATION, d.location.label)}
              <p className="mt-1 text-right text-[13px] text-ink-900">{d.location.address.line}<br />{d.location.address.city}, {d.location.address.state} {d.location.address.pincode}</p>
            </section>
          </div>

          {d.institution && (
            <section>
              <h3 className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.INSTITUTION_TITLE}</h3>
              {row(BULK_TEXT.INSTITUTION_NAME, d.institution.name)}
              {d.institution.gstin && row('GSTIN', <span className="font-mono">{d.institution.gstin}</span>)}
              {d.institution.email && row('Email', d.institution.email)}
              {row(BULK_TEXT.BILLING_LINE, <>{d.institution.billingAddress.line}<br />{d.institution.billingAddress.city}, {d.institution.billingAddress.state} {d.institution.billingAddress.pincode}</>)}
            </section>
          )}

          {team && teamCanUpload && BULK_PROCESSABLE.includes(d.status) && BULK_PROCESS_TYPES.includes(d.type) && (
            <BulkProcessPanel d={d} onDone={(r) => done(BULK_TEXT.CREATED(r.saleOrder?.code ?? ''))(r)} />
          )}

          <section>
            <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.DRAWER_LINES} ({d.lines.length})</h3>
            {canDecide && <p className="mb-2 text-[12px] text-ink-600">{fixed !== undefined ? BULK_TEXT.APPROVE_HINT_QTY_ONLY : BULK_TEXT.APPROVE_HINT}</p>}
            <div className="overflow-x-auto rounded-md border border-line">
              <table className={`w-full ${noMoney ? 'min-w-[420px]' : 'min-w-[640px]'} text-left text-[13px]`}>
                <thead className="bg-alt/60 text-[11px] font-semibold uppercase text-ink-600">
                  <tr><th className="px-3 py-2">{BULK_TEXT.COL_SKU}</th>{!noMoney && <th className="px-3 py-2 text-right">{BULK_TEXT.COL_MRP}</th>}<th className="px-3 py-2 text-right">{BULK_TEXT.COL_QTY}</th>{!noMoney && <><th className="px-3 py-2 text-right">{BULK_TEXT.COL_DISCOUNT}</th><th className="px-3 py-2 text-right">{BULK_TEXT.COL_PRICE}</th><th className="px-3 py-2 text-right">{BULK_TEXT.COL_TOTAL}</th></>}{canDecide && <th className="w-8" />}</tr>
                </thead>
                <tbody>
                  {rows.map(({ l, qty, disc, ok, gone }) => (
                    <tr key={l.lineNo} className={`border-t border-line ${gone ? 'opacity-40 line-through' : ''}`}>
                      <td className="px-3 py-2"><div className="font-mono text-[12px] font-semibold">{l.pepCode}</div><div className="text-[11px] text-ink-600">{l.name}</div>
                        {fixed !== undefined
                          ? l.qty !== l.requestedQty && <div className="text-[11px] text-warn">{BULK_TEXT.ASKED_QTY(l.requestedQty)}</div>
                          : (l.qty !== l.requestedQty || l.discountPct !== l.requestedDiscountPct) && <div className="text-[11px] text-warn">{BULK_TEXT.CHANGED_BY_APPROVER(l.requestedQty, l.requestedDiscountPct)}</div>}</td>
                      {!noMoney && <td className="px-3 py-2 text-right tnum">{rupees(l.mrp)}</td>}
                      {canDecide && !gone ? (
                        <>
                          <td className="w-24 px-2 py-1.5"><input type="number" min={1} step={1} className={`${input} ${Number.isInteger(qty) && qty >= 1 ? '' : 'border-crit'}`} value={edits[l.lineNo]?.qty ?? String(l.qty)}
                            onChange={(e) => setEdits({ ...edits, [l.lineNo]: { qty: e.target.value, discount: edits[l.lineNo]?.discount ?? String(l.discountPct) } })} /></td>
                          {!noMoney && (fixed !== undefined
                            ? <td className="px-3 py-2 text-right tnum">0%</td>
                            : <td className="w-24 px-2 py-1.5"><input type="number" min={0} max={99.99} step={0.01} title={BULK_TEXT.DISCOUNT_RULE} className={`${input} ${validDiscount(disc) && !lineTooSmall(lineTotal(l.mrp, disc, qty, fixed), fixed) ? '' : 'border-crit'}`} value={edits[l.lineNo]?.discount ?? String(l.discountPct)}
                              onChange={(e) => setEdits({ ...edits, [l.lineNo]: { qty: edits[l.lineNo]?.qty ?? String(l.qty), discount: e.target.value } })} /></td>)}
                        </>
                      ) : (
                        <>
                          <td className="px-3 py-2 text-right tnum">{l.qty}</td>
                          {!noMoney && <td className="px-3 py-2 text-right tnum">{l.discountPct}%</td>}
                        </>
                      )}
                      {!noMoney && <>
                        <td className="px-3 py-2 text-right tnum">{ok ? rupees(unitPrice(l.mrp, disc, fixed)) : '–'}</td>
                        <td className="px-3 py-2 text-right font-semibold tnum">{ok ? rupees(lineTotal(l.mrp, disc, qty, fixed)) : '–'}</td>
                      </>}
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

          <BulkDocumentsSection d={d} canUpload={canUpload} canPay={canPay} busy={busy} uploading={upload.isPending}
            onUpload={pick} onOpen={setViewDoc} onPay={(action, n) => pay.mutate({ action, note: n })} />

          {d.events.length > 0 && (
            <section className="rounded-md border border-line">
              <button onClick={() => setHistory(!history)} className="flex w-full items-center justify-between px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-ink-600 hover:bg-alt/50">
                {BULK_TEXT.TIMELINE} ({d.events.length})
                <ChevronDown className={`size-4 transition-transform ${history ? 'rotate-180' : ''}`} />
              </button>
              {history && <div className="border-t border-line px-3 py-3"><Timeline events={d.events} noMoney={noMoney} /></div>}
            </section>
          )}
        </div>
      )}
      {d && viewDoc && d.documents.some((x) => x.id === viewDoc) && (
        <BulkDocumentViewer d={d} docId={viewDoc} team={team} canPay={canPay} busy={busy}
          onPay={(action, n) => pay.mutate({ action, note: n })} onClose={() => setViewDoc(null)} />
      )}
    </Drawer>
  )
}
