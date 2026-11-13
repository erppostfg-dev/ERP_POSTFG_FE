import { useCallback, useEffect, useState } from 'react'
import { createPortal } from 'react-dom'
import { ExternalLink, FileText, X } from 'lucide-react'
import { bulkDocumentUrl, getBulkDocumentBytes, type BulkOrderFull } from '../../api/bulkOrders'
import { FileViewer } from '../../components/FileViewer'
import { Badge } from '../../components/ui'
import {
  BULK_DOC_EXT, BULK_DOC_KIND_LABEL, BULK_PAYMENT, BULK_PAYMENT_ACTION, BULK_PAYMENT_LABEL, BULK_PAYMENT_TONE, BULK_TEXT, BULK_TYPE_LABEL,
  bulkHidesMoney, type BulkPaymentAction,
} from '../../constants/bulkOrders'
import { DIALOG_OUT_MS, DOCUMENT_PDF_ZOOM, FILE_VIEWER_TEXT } from '../../constants/poReview'
import { rupees } from '../../lib/bulkPrice'

/*
 * A bulk order's documents IN the app (2026-11-13, user: "keep the verify payment in the application with a good format,
 * why is it going to a new tab"): over the whole page, the file on the left (PDF pages / image: zoom, search) and on the
 * (2026-11-13: a centred window that grows in / out, not the whole screen; images fit inside it, a click zooms) right the payment facts (PO, for whom, order value, status, who uploaded) + every document of the order to switch
 * between; people with "Bulk Orders: verify payments" (`canPay`) decide here: note + Verify / Refuse / Not needed.
 * Esc / ✕ / a click outside closes it (the order drawer under it stays open). The ↗ button still opens a new tab.
 */

const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
const size = (b: number) => (b >= 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`)

export function BulkDocumentViewer({ d, docId, team, canPay, busy, onPay, onClose }: {
  d: BulkOrderFull
  docId: string
  /** Our team's routes (POST_FG) or the portal's. */
  team: boolean
  /** The person may verify payments (special permission). */
  canPay: boolean
  busy: boolean
  onPay: (action: BulkPaymentAction, note: string) => void
  onClose: () => void
}) {
  const [current, setCurrent] = useState(docId)
  const [note, setNote] = useState('')
  // leaving: the window plays its closing animation, then the drawer drops it
  const [leaving, setLeaving] = useState(false)
  const close = useCallback(() => {
    setLeaving(true)
    setTimeout(onClose, DIALOG_OUT_MS)
  }, [onClose])
  const doc = d.documents.find((x) => x.id === current) ?? d.documents[0]
  const load = useCallback((signal: AbortSignal) => getBulkDocumentBytes(d.id, doc.id, team, signal), [d.id, doc.id, team])

  // Esc closes this view only (captured before the drawer's own Esc)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      e.stopPropagation()
      close()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [close])

  const p = d.payment
  const waiting = p?.status === BULK_PAYMENT.UPLOADED
  const fact = (k: string, v: React.ReactNode) => (
    <div className="flex justify-between gap-3 py-1 text-[12px]"><span className="text-ink-600">{k}</span><span className="text-right font-medium text-ink-900">{v}</span></div>
  )
  const btn = 'rounded-md px-3 py-1.5 text-[12px] font-semibold disabled:opacity-50'

  return createPortal(
    <div className={`${leaving ? 'pf-backdrop-out' : 'pf-backdrop-in'} fixed inset-0 z-[60] flex items-center justify-center bg-ink-900/50 p-3 backdrop-blur-[1px] sm:p-6`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`${leaving ? 'pf-dialog-out' : 'pf-dialog-in'} flex h-[min(82vh,760px)] w-full max-w-[1080px] overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-2xl max-lg:h-[90vh] max-lg:flex-col`}>
        {/* a newly picked document fades in (key = its id) */}
        <div key={doc.id} className="pf-fade-in flex min-h-0 min-w-0 flex-1 flex-col">
          <FileViewer load={load} fileName={doc.fileName} type={BULK_DOC_EXT[doc.contentType]} pdfZoom={DOCUMENT_PDF_ZOOM} actions={(
            <>
              <a href={bulkDocumentUrl(d.id, doc.id, team)} target="_blank" rel="noreferrer" title={FILE_VIEWER_TEXT.OPEN_TAB} className="hover:opacity-100"><ExternalLink className="size-4" /></a>
              <button type="button" onClick={close} title={FILE_VIEWER_TEXT.CLOSE} className="hover:opacity-100"><X className="size-4" /></button>
            </>
          )} />
        </div>

        <aside className="flex w-full shrink-0 flex-col gap-3 overflow-y-auto border-line p-4 max-lg:max-h-[45%] max-lg:border-t lg:w-[320px] lg:border-l">
          <div className="flex items-start justify-between gap-2">
            <div>
              <div className="font-mono text-[14px] font-semibold text-ink-900">{d.poNumber}</div>
              <div className="text-[12px] text-ink-600">{BULK_TYPE_LABEL[d.type]} · {d.institution?.name ?? d.receiverName}</div>
            </div>
            <button type="button" onClick={close} title={FILE_VIEWER_TEXT.CLOSE} className="rounded p-1 text-ink-400 hover:bg-alt hover:text-ink-900"><X className="size-4" /></button>
          </div>

          <section className="rounded-md border border-line px-3 py-2">
            {p && fact(BULK_TEXT.COL_PAYMENT, <Badge tone={BULK_PAYMENT_TONE[p.status] ?? 'neutral'}>{BULK_PAYMENT_LABEL[p.status] ?? p.status}</Badge>)}
            {!bulkHidesMoney(d.type) || team ? fact(BULK_TEXT.TOTAL_VALUE, rupees(d.totalValue)) : null}
            {d.institution?.gstin && fact('GSTIN', <span className="font-mono">{d.institution.gstin}</span>)}
            {p?.by && fact(BULK_TEXT.CHECKED_BY, `${p.by.name ?? ''}${p.at ? ` · ${when(p.at)}` : ''}`)}
            {p?.note && <p className="mt-1 rounded bg-alt px-2 py-1 text-[12px] text-ink-600">“{p.note}”</p>}
          </section>

          <section>
            <h3 className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{BULK_TEXT.DOCUMENTS} ({d.documents.length})</h3>
            <div className="flex flex-col gap-1">
              {d.documents.map((x) => (
                <button key={x.id} type="button" onClick={() => setCurrent(x.id)}
                  className={`flex items-start gap-2 rounded-md border px-2.5 py-2 text-left text-[12px] transition-colors duration-200 ${x.id === doc.id ? 'border-primary bg-primary-soft/60' : 'border-line hover:bg-alt'} ${x.replacedAt ? 'opacity-60' : ''}`}>
                  <FileText className="mt-0.5 size-4 shrink-0 text-ink-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink-900">{x.fileName}</span>
                    <span className="block text-ink-600">{BULK_DOC_KIND_LABEL[x.kind] ?? x.kind}{x.replacedAt ? ` · ${BULK_TEXT.REPLACED}` : ''}</span>
                    <span className="block text-ink-400">{x.by.name} · {when(x.at)} · {size(x.sizeBytes)}</span>
                  </span>
                </button>
              ))}
            </div>
          </section>

          {canPay && p && (
            <section className="mt-auto rounded-md bg-alt/60 p-3">
              <p className="mb-2 text-[12px] text-ink-600">{waiting ? BULK_TEXT.VERIFY_HERE : BULK_TEXT.PAYMENT_HINT}</p>
              <textarea rows={2} className="mb-2 w-full resize-none rounded-md border border-line bg-surface px-2.5 py-1.5 text-[13px] outline-none focus:border-primary"
                placeholder={BULK_TEXT.PAYMENT_NOTE} value={note} onChange={(e) => setNote(e.target.value)} />
              <div className="flex flex-wrap gap-2">
                {waiting && <button disabled={busy} onClick={() => onPay(BULK_PAYMENT_ACTION.VERIFY, note)} className={`${btn} bg-ok text-white`}>{BULK_TEXT.VERIFY_PAYMENT}</button>}
                {waiting && <button disabled={busy || !note.trim()} onClick={() => onPay(BULK_PAYMENT_ACTION.REFUSE, note)} className={`${btn} border border-crit text-crit`}>{BULK_TEXT.REFUSE_PROOF}</button>}
                {p.status !== BULK_PAYMENT.NOT_NEEDED && <button disabled={busy} onClick={() => onPay(BULK_PAYMENT_ACTION.NOT_NEEDED, note)} className={`${btn} border border-line`}>{BULK_TEXT.PAYMENT_NOT_NEEDED}</button>}
              </div>
            </section>
          )}
        </aside>
      </div>
    </div>,
    document.body,
  )
}
