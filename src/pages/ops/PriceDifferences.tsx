import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Check, ChevronRight, Copy, Download, Loader2, Mail } from 'lucide-react'
import { Button, Drawer } from '../../components/ui'
import { exportRows, exportRowsExcel } from '../../components/kit'
import type { ColKind } from '../../lib/ops'
import { ApiError } from '../../api/client'
import {
  listPriceDiffs, markPriceDiffsSent, priceDiffDraft, priceDiffsKey,
  type PriceDiffChannelGroup, type PriceDiffLine, type PriceDiffPoGroup, type PriceDiffScope,
} from '../../api/priceDifferences'
import { PRICE_CHECK_TEXT, PRICE_DIFF_STATUSES, PRICE_DIFF_TEXT as T, PRICE_DIFF_VIEWS, type PriceDiffStatus, type PriceDiffView } from '../../constants/priceDifferences'
import { istDateTime } from '../../lib/time'

/*
 * PO Processing & Review -> Price differences (user, 2026-10-30): approved PO lines where we kept our price / MRP although
 * the channel's PO said otherwise. By PO or by channel; a row opens its lines and the email to send the channel (subject,
 * body, attachment: copy / download), then Mark as sent. Sending from the app and the "To" address: later.
 */

const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
const signed = (n: number) => `${n > 0 ? '+' : ''}${rupees(n)}`
const th = 'sticky top-0 z-10 border-b border-primary/20 bg-primary-soft px-3 py-2 text-left text-[11.5px] font-semibold text-primary whitespace-nowrap'
const td = 'border-b border-line/70 px-3 py-2 text-[12.5px]'

/** The attachment's columns (same for Excel and CSV). */
type FileRow = PriceDiffLine & { what: string }
const FILE_COLS: [string, keyof FileRow, ColKind][] = [
  ['Channel', 'channel', 'text'], ['PO Number', 'poNumber', 'mono'], ['PO Date', 'poDate', 'text'], ['Line', 'lineNo', 'text'],
  ['Channel SKU', 'channelSkuCode', 'mono'], ['Our SKU', 'pepCode', 'mono'], ['Product', 'productName', 'text'], ['What', 'what', 'text'],
  ['Qty', 'qty', 'num'], ['PO value', 'poValue', 'money'], ['Agreed value', 'ourValue', 'money'], ['Difference', 'difference', 'money'],
]

export function PriceDifferences({ canEdit }: { canEdit: boolean }) {
  const [view, setView] = useState<PriceDiffView>('po')
  const [status, setStatus] = useState<PriceDiffStatus>('open')
  const [open, setOpen] = useState<{ scope: PriceDiffScope; title: string } | null>(null)
  const q = useQuery({ queryKey: priceDiffsKey(view, status), queryFn: ({ signal }) => listPriceDiffs(view, status, signal) })
  const rows = q.data ?? []
  const toggle = <V extends string>(values: readonly V[], value: V, set: (v: V) => void, labels: Record<string, string>) => (
    <div className="flex items-center gap-1 rounded-[var(--radius)] bg-alt/70 p-1">
      {values.map((v) => (
        <button key={v} type="button" onClick={() => set(v)}
          className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-150 ${value === v ? 'bg-surface text-primary shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}>
          {labels[v]}
        </button>
      ))}
    </div>
  )

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <div>
          <div className="text-[14px] font-semibold text-ink-900">{T.TITLE}</div>
          <p className="mt-1 max-w-3xl text-[12.5px] text-ink-600">{T.SUB}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {toggle(PRICE_DIFF_VIEWS, view, setView, T.VIEW)}
          {toggle(PRICE_DIFF_STATUSES, status, setStatus, T.STATUS)}
        </div>
      </div>

      {q.error ? (
        <div className="flex items-center gap-2 rounded-[var(--radius)] bg-crit-soft px-4 py-3 text-[13px] text-crit"><AlertTriangle className="size-4" />{q.error instanceof ApiError ? q.error.message : String(q.error)}</div>
      ) : !q.data ? (
        <div className="flex items-center justify-center gap-2 rounded-[var(--radius)] border border-line bg-surface px-4 py-10 text-[13px] text-ink-600"><Loader2 className="size-4 animate-spin" />{T.LOADING}</div>
      ) : !rows.length ? (
        <div className="rounded-[var(--radius)] border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-600">{T.EMPTY}</div>
      ) : (
        <div className={`overflow-x-auto rounded-[var(--radius-card)] border border-line bg-surface transition-opacity duration-200 ${q.isFetching ? 'opacity-60' : ''}`}>
          <table className="w-full">
            {view === 'po' ? (
              <>
                <thead><tr>{['PO Number', 'Channel', 'PO Date', 'Lines', 'Difference', 'Approved', 'Status', ''].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {(rows as PriceDiffPoGroup[]).map((g) => (
                    <tr key={g.uploadId} onClick={() => setOpen({ scope: { uploadId: g.uploadId }, title: `${g.channel} · PO ${g.poNumber}` })} className="cursor-pointer hover:bg-alt/60">
                      <td className={`${td} font-mono text-primary`}>{g.poNumber}</td>
                      <td className={td}>{g.channel}</td>
                      <td className={`${td} tnum`}>{g.poDate ?? '—'}</td>
                      <td className={`${td} tnum`}>{g.lines}</td>
                      <td className={`${td} tnum`}>{signed(g.valueDifference)}</td>
                      <td className={`${td} tnum text-ink-600`}>{istDateTime(g.approvedAt)}</td>
                      <td className={td}>{g.openLines ? <span className="text-warn">{T.STATUS.open} ({g.openLines})</span> : <span className="text-ok">{T.STATUS.sent}</span>}</td>
                      <td className={`${td} text-ink-400`}><ChevronRight className="size-4" /></td>
                    </tr>
                  ))}
                </tbody>
              </>
            ) : (
              <>
                <thead><tr>{['Channel', 'POs', 'Lines', 'Difference', 'Not sent', ''].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {(rows as PriceDiffChannelGroup[]).map((g) => (
                    <tr key={g.channel} onClick={() => setOpen({ scope: { channel: g.channel }, title: g.channel })} className="cursor-pointer hover:bg-alt/60">
                      <td className={`${td} font-semibold text-ink-900`}>{g.channel}</td>
                      <td className={`${td} tnum`}>{g.pos}</td>
                      <td className={`${td} tnum`}>{g.lines}</td>
                      <td className={`${td} tnum`}>{signed(g.valueDifference)}</td>
                      <td className={td}>{g.openLines ? <span className="text-warn">{g.openLines}{g.oldestOpen && <span className="ml-1 text-ink-400">· {T.OPEN_SINCE(istDateTime(g.oldestOpen))}</span>}</span> : <span className="text-ok">0</span>}</td>
                      <td className={`${td} text-ink-400`}><ChevronRight className="size-4" /></td>
                    </tr>
                  ))}
                </tbody>
              </>
            )}
          </table>
        </div>
      )}

      {open && <EmailDrawer scope={open.scope} title={open.title} status={status} canEdit={canEdit} onClose={() => setOpen(null)} />}
    </div>
  )
}

/** One PO / one channel: its lines and the email to send (copy / download), then Mark as sent. */
function EmailDrawer({ scope, title, status, canEdit, onClose }: { scope: PriceDiffScope; title: string; status: PriceDiffStatus; canEdit: boolean; onClose: () => void }) {
  const queryClient = useQueryClient()
  const key = ['price-differences', 'draft', JSON.stringify(scope), status]
  const q = useQuery({ queryKey: key, queryFn: ({ signal }) => priceDiffDraft(scope, status, signal) })
  const [copied, setCopied] = useState<string | null>(null)
  const [note, setNote] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const d = q.data
  const openIds = d?.lines.filter((l) => !l.sentAt).map((l) => l.id) ?? []
  const fileRows: FileRow[] = (d?.lines ?? []).map((l) => ({ ...l, what: PRICE_CHECK_TEXT.FIELD[l.field] ?? l.field }))

  const copy = (what: string, text: string) => {
    void navigator.clipboard.writeText(text).then(() => { setCopied(what); setTimeout(() => setCopied(null), 1500) })
  }
  const markSent = () => {
    setBusy(true)
    markPriceDiffsSent(openIds)
      .then((r) => {
        setNote({ ok: true, text: T.MARKED(r.marked) })
        void queryClient.invalidateQueries({ queryKey: ['price-differences'] })
      })
      .catch((e: unknown) => setNote({ ok: false, text: e instanceof ApiError ? e.message : String(e) }))
      .finally(() => setBusy(false))
  }
  const CopyBtn = ({ what, text }: { what: string; text: string }) => (
    <button type="button" onClick={() => copy(what, text)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[12px] font-semibold text-primary hover:bg-primary-soft">
      {copied === what ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}{copied === what ? T.COPIED : T.COPY}
    </button>
  )
  const lab = 'w-24 shrink-0 pt-1.5 text-[12px] font-medium text-ink-600'

  return (
    <Drawer open wide onClose={onClose} title={<span className="inline-flex items-center gap-2"><Mail className="size-4 text-primary" />{title}</span>}
      sub={d ? `${d.lines.length} ${T.LINES.toLowerCase()}` : T.LOADING}
      footer={canEdit ? (
        <div className="flex items-center gap-2">
          {note && <span className={`text-[12.5px] ${note.ok ? 'text-ok' : 'text-crit'}`}>{note.text}</span>}
          <div className="ml-auto flex gap-2">
            <Button onClick={() => d && copy('all', `${d.subject}\n\n${d.body}`)} disabled={!d}>{copied === 'all' ? T.COPIED : T.COPY_ALL}</Button>
            <Button variant="primary" onClick={markSent} disabled={busy || !openIds.length}>{openIds.length ? T.MARK_SENT(openIds.length) : T.NOTHING_OPEN}</Button>
          </div>
        </div>
      ) : <span className="text-[12.5px] text-ink-400">{T.VIEW_ONLY}</span>}>
      {q.error ? (
        <div className="flex items-center gap-2 rounded-[var(--radius)] bg-crit-soft px-4 py-3 text-[13px] text-crit"><AlertTriangle className="size-4" />{q.error instanceof ApiError ? q.error.message : String(q.error)}</div>
      ) : !d ? (
        <div className="flex items-center gap-2 text-[13px] text-ink-600"><Loader2 className="size-4 animate-spin" />{T.LOADING}</div>
      ) : (
        <div className="space-y-4">
          <div className="space-y-2 rounded-[var(--radius-card)] border border-line p-3">
            <div className="text-[13px] font-semibold text-ink-900">{T.EMAIL}</div>
            <div className="flex items-start gap-2"><span className={lab}>{T.TO}</span><span className="pt-1.5 text-[12.5px] italic text-ink-400">{d.to || T.TO_LATER}</span></div>
            <div className="flex items-start gap-2">
              <span className={lab}>{T.SUBJECT}</span>
              <div className="min-w-0 flex-1 rounded-md bg-alt px-2.5 py-1.5 text-[12.5px] text-ink-900">{d.subject}</div>
              <CopyBtn what="subject" text={d.subject} />
            </div>
            <div className="flex items-start gap-2">
              <span className={lab}>{T.BODY}</span>
              <pre className="min-w-0 flex-1 whitespace-pre-wrap rounded-md bg-alt px-2.5 py-1.5 font-sans text-[12.5px] text-ink-900">{d.body}</pre>
              <CopyBtn what="body" text={d.body} />
            </div>
            <div className="flex items-center gap-2">
              <span className={lab}>{T.ATTACHMENT}</span>
              <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-ink-600">{d.fileName}.xlsx</span>
              <Button onClick={() => void exportRowsExcel(d.fileName, FILE_COLS, fileRows)}><Download className="size-3.5" />{T.EXCEL}</Button>
              <Button onClick={() => exportRows(d.fileName, 'csv', FILE_COLS, fileRows)}><Download className="size-3.5" />{T.CSV}</Button>
            </div>
          </div>

          <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
            <table className="w-full">
              <thead><tr>{['PO', 'Line', 'Product', 'What', 'Qty', 'PO', 'Agreed', 'Diff', 'Sent'].map((h, i) => <th key={`${h}${i}`} className={th}>{h}</th>)}</tr></thead>
              <tbody>
                {d.lines.map((l) => (
                  <tr key={l.id}>
                    <td className={`${td} font-mono`}>{l.poNumber}</td>
                    <td className={`${td} tnum text-ink-400`}>{l.lineNo}</td>
                    <td className={td}><div className="max-w-[220px] truncate" title={l.productName}>{l.productName || l.pepCode}</div><div className="font-mono text-[11px] text-ink-400">{l.channelSkuCode}</div></td>
                    <td className={td}>{PRICE_CHECK_TEXT.FIELD[l.field] ?? l.field}</td>
                    <td className={`${td} tnum`}>{l.qty ?? '—'}</td>
                    <td className={`${td} tnum`}>{rupees(l.poValue)}</td>
                    <td className={`${td} tnum`}>{rupees(l.ourValue)}</td>
                    <td className={`${td} tnum text-warn`}>{signed(l.difference)}</td>
                    <td className={`${td} text-[11.5px] text-ink-600`}>{l.sentAt ? `${istDateTime(l.sentAt)}${l.sentBy ? ` · ${l.sentBy}` : ''}` : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Drawer>
  )
}
