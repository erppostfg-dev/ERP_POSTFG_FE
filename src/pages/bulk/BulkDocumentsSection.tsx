import { useState } from 'react'
import { CheckCircle2, Clock, FileCheck2, FileText, MinusCircle, Receipt, Upload, XCircle } from 'lucide-react'
import type { BulkOrderFull } from '../../api/bulkOrders'
import { BULK_DOC_ACCEPT, BULK_DOC_KIND, BULK_DOC_KIND_LABEL, BULK_PAYMENT, BULK_PAYMENT_ACTION, BULK_TEXT, type BulkPaymentAction } from '../../constants/bulkOrders'

/*
 * Payments & documents of a bulk order (2026-11-13, user: "add smoothness for the proof of payment, it looks odd"; was a
 * plain list + select + inline buttons in BulkOrderDrawer):
 *   - Payment card (only orders with a payment check): one coloured card per state with what happens next; who checked it
 *     and the note. With "Bulk Orders: verify payments": "Review & verify" opens the latest proof in the document viewer
 *     (Verify / Refuse live there, next to the file), "Not needed" here. A new state fades in.
 *   - Documents as cards (kind icon, who, when, replaced ones dimmed): a click opens the in-app viewer.
 *   - Upload: kind chips + a drop zone (drag a file or browse); a running upload shows a moving bar.
 *     NO "Proof of payment" on an order without a payment check (Marketing, user: "don't show the payment upload to
 *     marketing"; the server refuses it too).
 */

const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

/** Per payment state: icon + colours + the two lines of the card. */
const CARD: Record<string, { icon: typeof Clock; box: string; iconCls: string; title: string; sub: string }> = {
  [BULK_PAYMENT.AWAITING]: { icon: Clock, box: 'border-line bg-alt/50', iconCls: 'text-ink-400', title: BULK_TEXT.PAY_AWAITING, sub: BULK_TEXT.PAY_AWAITING_SUB },
  [BULK_PAYMENT.UPLOADED]: { icon: FileCheck2, box: 'border-warn/40 bg-warn-soft/60', iconCls: 'text-warn', title: BULK_TEXT.PAY_UPLOADED, sub: BULK_TEXT.PAY_UPLOADED_SUB },
  [BULK_PAYMENT.VERIFIED]: { icon: CheckCircle2, box: 'border-ok/40 bg-ok-soft/60', iconCls: 'text-ok', title: BULK_TEXT.PAY_VERIFIED, sub: '' },
  [BULK_PAYMENT.REFUSED]: { icon: XCircle, box: 'border-crit/40 bg-crit-soft/60', iconCls: 'text-crit', title: BULK_TEXT.PAY_REFUSED, sub: BULK_TEXT.PAY_REFUSED_SUB },
  [BULK_PAYMENT.NOT_NEEDED]: { icon: MinusCircle, box: 'border-line bg-alt/50', iconCls: 'text-ink-400', title: BULK_TEXT.PAY_NOT_NEEDED, sub: '' },
}
const KIND_ICON: Record<string, string> = { [BULK_DOC_KIND.PAYMENT_PROOF]: 'bg-ok-soft text-ok', [BULK_DOC_KIND.INVOICE]: 'bg-primary-soft text-primary', [BULK_DOC_KIND.PROFORMA]: 'bg-alt text-ink-600' }

export function BulkDocumentsSection({ d, canUpload, canPay, busy, uploading, onUpload, onOpen, onPay }: {
  d: BulkOrderFull
  canUpload: boolean
  /** "Bulk Orders: verify payments". */
  canPay: boolean
  busy: boolean
  uploading: boolean
  onUpload: (kind: string, file: File) => void
  /** Opens a document in the in-app viewer. */
  onOpen: (docId: string) => void
  onPay: (action: BulkPaymentAction, note: string) => void
}) {
  const p = d.payment
  // a proof only where the order has a payment check (not Marketing)
  const kinds = Object.values(BULK_DOC_KIND).filter((k) => k !== BULK_DOC_KIND.PAYMENT_PROOF || !!p)
  const [kindPicked, setKind] = useState('')
  const kind = kinds.includes(kindPicked as (typeof kinds)[number]) ? kindPicked : p && p.status !== BULK_PAYMENT.VERIFIED ? BULK_DOC_KIND.PAYMENT_PROOF : BULK_DOC_KIND.PROFORMA
  const [over, setOver] = useState(false)
  const latestProof = d.documents.find((x) => x.kind === BULK_DOC_KIND.PAYMENT_PROOF && !x.replacedAt)
  const card = p ? CARD[p.status] : null
  const btn = 'rounded-md px-3 py-1.5 text-[12px] font-semibold transition-colors duration-200 disabled:opacity-50'

  if (!p && !d.documents.length && !canUpload) return null
  return (
    <section className="flex flex-col gap-3">
      <h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{p ? BULK_TEXT.DOCUMENTS : BULK_TEXT.DOCUMENTS_ONLY}</h3>

      {p && card && (
        // key = state: a new state fades in
        <div key={p.status} className={`pf-fade-in flex items-start gap-3 rounded-lg border px-3.5 py-3 transition-colors duration-300 ${card.box}`}>
          <card.icon className={`mt-0.5 size-5 shrink-0 ${card.iconCls}`} />
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-semibold text-ink-900">{card.title}</div>
            {p.by && p.at && p.status !== BULK_PAYMENT.UPLOADED
              ? <div className="text-[12px] text-ink-600">{BULK_TEXT.PAY_BY(p.by.name ?? '', when(p.at))}</div>
              : card.sub && <div className="text-[12px] text-ink-600">{card.sub}</div>}
            {p.status === BULK_PAYMENT.UPLOADED && latestProof && <div className="text-[12px] text-ink-600">{latestProof.fileName} · {latestProof.by.name} · {when(latestProof.at)}</div>}
            {p.note && <div className="mt-1.5 rounded-md bg-surface/70 px-2.5 py-1.5 text-[12px] text-ink-600">“{p.note}”</div>}
            {canPay && (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {latestProof && p.status === BULK_PAYMENT.UPLOADED && (
                  <button type="button" disabled={busy} onClick={() => onOpen(latestProof.id)} className={`${btn} bg-primary text-white hover:opacity-90`}>{BULK_TEXT.REVIEW_VERIFY}</button>
                )}
                {p.status !== BULK_PAYMENT.NOT_NEEDED && p.status !== BULK_PAYMENT.VERIFIED && (
                  <button type="button" disabled={busy} onClick={() => onPay(BULK_PAYMENT_ACTION.NOT_NEEDED, '')} className={`${btn} border border-line bg-surface hover:bg-alt`}>{BULK_TEXT.PAYMENT_NOT_NEEDED}</button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {d.documents.length > 0 && (
        <div className="grid gap-2 sm:grid-cols-2">
          {d.documents.map((doc) => (
            <button key={doc.id} type="button" onClick={() => onOpen(doc.id)}
              className={`pf-fade-in group flex items-center gap-3 rounded-lg border border-line bg-surface px-3 py-2.5 text-left transition-all duration-200 hover:-translate-y-px hover:border-primary/40 hover:shadow-md ${doc.replacedAt ? 'opacity-55' : ''}`}>
              <span className={`grid size-9 shrink-0 place-items-center rounded-md ${KIND_ICON[doc.kind] ?? 'bg-alt text-ink-600'}`}>
                {doc.kind === BULK_DOC_KIND.PAYMENT_PROOF ? <Receipt className="size-4" /> : <FileText className="size-4" />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[13px] font-medium text-ink-900">{doc.fileName}</span>
                <span className="block truncate text-[11px] text-ink-600">{BULK_DOC_KIND_LABEL[doc.kind] ?? doc.kind}{doc.replacedAt ? ` · ${BULK_TEXT.REPLACED}` : ''}</span>
                <span className="block truncate text-[11px] text-ink-400">{doc.by.name} · {when(doc.at)}</span>
              </span>
              <span className="text-[12px] font-semibold text-primary opacity-70 transition-opacity duration-200 group-hover:opacity-100">{BULK_TEXT.VIEW}</span>
            </button>
          ))}
        </div>
      )}

      {canUpload && (
        <div className="rounded-lg border border-line p-3">
          <div className="mb-2 flex flex-wrap gap-1.5">
            {kinds.map((k) => (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`rounded-full border px-2.5 py-1 text-[12px] transition-colors duration-200 ${kind === k ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-line text-ink-600 hover:bg-alt'}`}>
                {BULK_DOC_KIND_LABEL[k]}
              </button>
            ))}
          </div>
          <label
            onDragOver={(e) => { e.preventDefault(); setOver(true) }} onDragLeave={() => setOver(false)}
            onDrop={(e) => { e.preventDefault(); setOver(false); const f = e.dataTransfer.files?.[0]; if (f && !busy) onUpload(kind, f) }}
            className={`relative flex cursor-pointer flex-col items-center justify-center gap-1 overflow-hidden rounded-md border-2 border-dashed px-3 py-4 text-center transition-colors duration-200 ${over ? 'border-primary bg-primary-soft/50' : 'border-line hover:border-primary/50 hover:bg-alt/50'} ${busy ? 'pointer-events-none opacity-70' : ''}`}>
            <Upload className={`size-5 transition-transform duration-200 ${over ? '-translate-y-0.5 text-primary' : 'text-ink-400'}`} />
            <span className="text-[13px] text-ink-900">{uploading ? BULK_TEXT.UPLOADING : BULK_TEXT.DROP_FILE(BULK_DOC_KIND_LABEL[kind])}</span>
            <span className="text-[11px] text-ink-400">{BULK_TEXT.DROP_TYPES}</span>
            {uploading && <span className="absolute inset-x-0 bottom-0 h-0.5 overflow-hidden bg-primary-soft"><span className="pf-indeterminate block h-full w-1/3 bg-primary" /></span>}
            <input type="file" accept={BULK_DOC_ACCEPT} className="hidden" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) onUpload(kind, f); e.target.value = '' }} />
          </label>
        </div>
      )}
      {!d.documents.length && !canUpload && <p className="text-[12px] text-ink-400">{BULK_TEXT.NO_DOCUMENTS}</p>}
    </section>
  )
}
