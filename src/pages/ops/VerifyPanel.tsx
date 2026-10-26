import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Check, CornerUpLeft, Loader2, Search, ShieldCheck, X } from 'lucide-react'
import { Badge } from '../../components/ui'
import { FileViewer } from '../../components/FileViewer'
import type { ExternalFind } from '../../components/FindBox'
import { ApiError } from '../../api/client'
import { getPoFile } from '../../api/poReview'
import { getVerifyDetail, sendBackPo, verifyPo, type VerifyDetail } from '../../api/poVerify'
import {
  VERIFY_HEADER_FIELDS, VERIFY_LINE_FIELDS, VERIFY_OUR_LINE_FIELDS, VERIFY_REMARK_MAX, VERIFY_STATE, VERIFY_TEXT, type FieldKind,
} from '../../constants/poVerify'
import { termsFor } from '../../lib/valueTerms'
import { istDateTime } from '../../lib/time'

/*
 * Verify a processed PO against its original (user, 2026-10-22): full screen, the original PO on the left (the in-app
 * viewer) and processed.json on the right. A click on any value finds it on the PO and highlights it (every spelling:
 * lib/valueTerms; "found 2×" with ↑ / ↓ in the viewer's box, or red "not found on the PO"). A second tab shows what was
 * saved for Uniware (the sale order CSV lines next to the PO's). Tick each line, then Verify & approve (unlocks the
 * Uniware CSV) or Send back (remark required: cancels the saved PO, back to In Review). Editors only act.
 */

const money = (v: number | null | undefined) => (v === null || v === undefined ? '—' : `₹${v.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`)
const num = (v: number | null | undefined) => (v === null || v === undefined ? '—' : v.toLocaleString('en-IN'))

/** What a value's search found: a count, null = the file cannot be searched, 'pending' = still looking. */
type Found = number | null | 'pending'

export function VerifyPanel({ uploadId, canEdit, onClose, onDone }: {
  uploadId: string
  canEdit: boolean
  onClose: () => void
  /** After verify / send back: the message to show, and the list reloads. */
  onDone: (message: string) => void
}) {
  const [data, setData] = useState<VerifyDetail | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [tab, setTab] = useState<'json' | 'saved'>('json')
  const [ticked, setTicked] = useState<Set<number>>(new Set())
  const [note, setNote] = useState('')
  const [sendBack, setSendBack] = useState<string | null>(null)
  const [busy, setBusy] = useState<'verify' | 'back' | null>(null)
  const load = useCallback((signal: AbortSignal) => getPoFile(uploadId, signal), [uploadId])

  // Click-to-find: the value asked for, which cell asked, and what each search found (kept, so red stays red).
  const [find, setFind] = useState<ExternalFind | undefined>()
  const [active, setActive] = useState<string | null>(null)
  const [found, setFound] = useState<Map<string, Found>>(new Map())
  const activeRef = useRef<string | null>(null)
  const seq = useRef(0)
  const ask = (key: string, value: unknown, kind: FieldKind) => {
    const terms = termsFor(value, kind)
    if (!terms.length) return
    activeRef.current = key
    setActive(key)
    setFound((m) => new Map(m).set(key, 'pending'))
    setFind({ terms, seq: ++seq.current })
  }
  const onFindResult = useCallback((n: number | null) => {
    const key = activeRef.current
    if (key) setFound((m) => new Map(m).set(key, n))
  }, [])

  useEffect(() => {
    const ctrl = new AbortController()
    getVerifyDetail(uploadId, ctrl.signal)
      .then(setData)
      .catch((e: unknown) => { if (!ctrl.signal.aborted) setError(e instanceof ApiError ? e.message : String(e)) })
    return () => ctrl.abort()
  }, [uploadId])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && !busy && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose, busy])

  const poLines = data?.processed.line_items ?? []
  const allTicked = poLines.length > 0 && ticked.size === poLines.length
  const can = canEdit && !!data?.canAct
  const toggle = (n: number) => setTicked((s) => { const x = new Set(s); if (x.has(n)) x.delete(n); else x.add(n); return x })
  const po = data?.poNumber ?? uploadId

  const run = async (what: 'verify' | 'back') => {
    setBusy(what)
    setError(null)
    try {
      if (what === 'verify') {
        await verifyPo(uploadId, { remark: note.trim() || undefined, linesChecked: ticked.size, lineCount: poLines.length })
        onDone(VERIFY_TEXT.DONE_VERIFIED(po))
      } else {
        await sendBackPo(uploadId, (sendBack ?? '').trim())
        onDone(VERIFY_TEXT.DONE_SENT_BACK(po))
      }
      onClose()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }

  /** One clickable processed.json value: blue while asked, green dot when found, red when not on the PO. */
  const Val = ({ id, value, kind, mono = false }: { id: string; value: unknown; kind: FieldKind; mono?: boolean }) => {
    const text = value === null || value === undefined ? '' : String(value)
    if (!text) return <span className="text-ink-400">—</span>
    const f = found.get(id)
    const isActive = active === id
    const tone = f === 0 ? 'bg-crit-soft text-crit ring-1 ring-crit/40' : isActive ? 'bg-primary text-white' : typeof f === 'number' ? 'bg-ok-soft text-ink-900' : 'hover:bg-primary-soft hover:text-primary'
    const tip = f === 'pending' ? VERIFY_TEXT.SEARCHING : f === 0 ? VERIFY_TEXT.NOT_FOUND : f === null ? VERIFY_TEXT.CANNOT_SEARCH : typeof f === 'number' ? VERIFY_TEXT.FOUND(f) : VERIFY_TEXT.CLICK_HINT
    return (
      <button type="button" onClick={() => ask(id, value, kind)} title={`${text}\n${tip}`}
        className={`max-w-full truncate rounded px-1 py-0.5 text-left transition-colors duration-150 ${mono ? 'font-mono' : ''} ${tone}`}>
        {text}
        {f === 0 && <span className="ml-1 text-[10px] font-semibold">✕</span>}
      </button>
    )
  }

  const th = 'sticky top-0 z-10 border-b border-primary/20 bg-primary-soft px-2 py-1.5 text-left text-[11px] font-semibold text-primary whitespace-nowrap'
  const td = 'border-b border-line/70 px-1.5 py-1 align-top'
  const diff = (bad: boolean) => (bad ? 'bg-crit-soft font-semibold text-crit' : '')
  const tabBtn = (key: 'json' | 'saved', label: ReactNode) => (
    <button type="button" onClick={() => setTab(key)}
      className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors ${tab === key ? 'bg-primary text-white' : 'text-ink-600 hover:bg-alt hover:text-ink-900'}`}>{label}</button>
  )
  const activeFound = active ? found.get(active) : undefined

  return createPortal(
    <div className="pf-backdrop-in fixed inset-0 z-[60] flex bg-ink-900/50 p-3 backdrop-blur-[1px] sm:p-5" onMouseDown={(e) => e.target === e.currentTarget && !busy && onClose()}>
      <div className="flex min-h-0 w-full flex-col overflow-hidden rounded-[var(--radius-card)] bg-surface shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4 py-3">
          <ShieldCheck className="size-5 text-primary" />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold text-ink-900">{VERIFY_TEXT.TITLE}</div>
            <div className="truncate text-[12px] text-ink-600">{po} · {data?.channel ?? ''} {data?.header.saleOrderCode ? `· ${data.header.saleOrderCode}` : ''}</div>
          </div>
          {data && (data.state === VERIFY_STATE.VERIFIED ? <Badge tone="ok"><Check className="size-3" />{VERIFY_TEXT.VERIFIED}</Badge> : data.state === VERIFY_STATE.TO_VERIFY ? <Badge tone="warn">{VERIFY_TEXT.TO_VERIFY}</Badge> : <Badge tone="neutral">{data.state === VERIFY_STATE.NOT_REQUIRED ? VERIFY_TEXT.OPTIONAL : VERIFY_TEXT.NOT_NEEDED}</Badge>)}
          <button onClick={onClose} disabled={!!busy} className="rounded-md p-1 text-ink-400 hover:bg-alt hover:text-ink-900"><X className="size-5" /></button>
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 p-3 lg:grid-cols-2">
          {/* Left: the original PO; a click on the right highlights the value here */}
          <div className="flex min-h-[320px] flex-col">
            {data ? <FileViewer load={load} fileName={data.fileName} type={data.fileType} externalFind={find} onFindResult={onFindResult} /> : <div className="flex-1 rounded-[var(--radius-card)] bg-[#323639]" />}
          </div>

          {/* Right: processed.json (click to find) / what was saved for Uniware */}
          <div className="flex min-h-0 flex-col overflow-hidden rounded-[var(--radius-card)] border border-line">
            <div className="flex items-center gap-1 border-b border-line px-2 py-1.5">
              {tabBtn('json', VERIFY_TEXT.TAB_JSON)}
              {tabBtn('saved', VERIFY_TEXT.TAB_SAVED)}
              {active && tab === 'json' && (
                <span className={`ml-auto inline-flex items-center gap-1 text-[12px] font-semibold ${activeFound === 0 ? 'text-crit' : typeof activeFound === 'number' ? 'text-ok' : 'text-ink-600'}`}>
                  <Search className="size-3.5" />
                  {activeFound === 'pending' ? VERIFY_TEXT.SEARCHING : activeFound === 0 ? VERIFY_TEXT.NOT_FOUND : activeFound === null ? VERIFY_TEXT.CANNOT_SEARCH : typeof activeFound === 'number' ? VERIFY_TEXT.FOUND(activeFound) : ''}
                </span>
              )}
            </div>
            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3">
              {error && (
                <div className="flex items-start gap-2 rounded-[var(--radius)] bg-crit-soft px-3 py-2 text-[12.5px] text-crit"><AlertTriangle className="mt-0.5 size-4 shrink-0" />{error}</div>
              )}
              {!data ? (!error && <div className="p-6 text-center text-[13px] text-ink-600">{VERIFY_TEXT.LOADING}</div>) : (
                <>
                  {data.last?.action === 'sent_back' && (
                    <div className="rounded-[var(--radius)] bg-warn-soft px-3 py-2 text-[12px] text-warn">{VERIFY_TEXT.LAST_SENT_BACK(data.last.by, istDateTime(data.last.at), data.last.remark)}</div>
                  )}
                  {data.state === VERIFY_STATE.VERIFIED && data.last?.action === 'verified' && (
                    <div className="rounded-[var(--radius)] bg-ok-soft px-3 py-2 text-[12px] text-ok">{VERIFY_TEXT.BY(data.last.by, istDateTime(data.last.at))}{data.last.remark ? ` · ${data.last.remark}` : ''}</div>
                  )}

                  {tab === 'json' ? (
                    <>
                      <p className="text-[12px] text-ink-600">{VERIFY_TEXT.CLICK_HINT}</p>
                      <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">{VERIFY_TEXT.HEADER}</div>
                      <div className="grid grid-cols-1 gap-x-4 gap-y-1 rounded-[var(--radius)] bg-alt/60 p-3 sm:grid-cols-2">
                        {VERIFY_HEADER_FIELDS.map(([key, label, kind]) => (
                          <div key={key} className="flex min-w-0 items-center gap-2 text-[12.5px]">
                            <span className="w-32 shrink-0 text-ink-400">{label}</span>
                            <span className="min-w-0"><Val id={`h:${key}`} value={data.processed[key]} kind={kind} mono={kind !== 'text' || key.includes('number') || key.includes('gstin')} /></span>
                          </div>
                        ))}
                      </div>

                      <div className="flex items-center justify-between">
                        <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-400">{VERIFY_TEXT.LINE_ITEMS}</span>
                        <span className="flex items-center gap-3 text-[12px]">
                          <span className="font-semibold text-ink-900">{VERIFY_TEXT.CHECKED(ticked.size, poLines.length)}</span>
                          {can && <button onClick={() => setTicked(allTicked ? new Set() : new Set(poLines.map((_, i) => i)))} className="font-semibold text-primary hover:underline">{VERIFY_TEXT.TICK_ALL}</button>}
                        </span>
                      </div>
                      <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
                        <table className="min-w-full border-separate border-spacing-0 text-[12px]">
                          <thead>
                            <tr>
                              <th className={`${th} w-8`}>✓</th>
                              <th className={th}>#</th>
                              {VERIFY_LINE_FIELDS.map(([k, label]) => <th key={k} className={th}>{label}</th>)}
                              {VERIFY_OUR_LINE_FIELDS.map(([k, label]) => <th key={k} className={`${th} !bg-alt !text-ink-400`} title={VERIFY_TEXT.OURS}>{label}</th>)}
                            </tr>
                          </thead>
                          <tbody>
                            {poLines.map((line, i) => (
                              <tr key={i} className={ticked.has(i) ? 'bg-ok-soft/50' : ''}>
                                <td className={td}><input type="checkbox" checked={ticked.has(i)} disabled={!can} onChange={() => toggle(i)} className="mt-1 size-4 accent-[var(--color-primary)]" /></td>
                                <td className={`${td} tnum pt-1.5 text-ink-400`}>{String(line.line_no ?? i + 1)}</td>
                                {VERIFY_LINE_FIELDS.map(([k, , kind]) => (
                                  <td key={k} className={`${td} ${k === 'description' ? 'max-w-[220px]' : 'whitespace-nowrap'} ${kind === 'number' ? 'tnum' : ''}`}>
                                    <Val id={`l:${i}:${k}`} value={line[k]} kind={kind} mono={k !== 'description'} />
                                  </td>
                                ))}
                                {VERIFY_OUR_LINE_FIELDS.map(([k]) => (
                                  <td key={k} className={`${td} whitespace-nowrap pt-1.5 font-mono text-ink-400`} title={VERIFY_TEXT.OURS}>{String(line[k] ?? '') || '—'}</td>
                                ))}
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="grid grid-cols-2 gap-3 rounded-[var(--radius)] bg-alt/60 p-3 sm:grid-cols-4">
                        {([['Sale order', data.header.saleOrderCode], ['Customer code', data.header.customerCode], ['Facility', data.header.facilityCode], ['Uniware channel', data.header.uniwareChannel]] as const).map(([label, value]) => (
                          <div key={label} className="min-w-0">
                            <div className="text-[11px] font-medium uppercase tracking-wide text-ink-400">{label}</div>
                            <div className="truncate font-mono text-[12.5px] text-ink-900" title={value ?? ''}>{value || '—'}</div>
                          </div>
                        ))}
                      </div>
                      <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
                        <table className="min-w-full border-separate border-spacing-0 text-[12px]">
                          <thead>
                            <tr>
                              <th className={th}>#</th><th className={th}>SKU · channel SKU</th>
                              <th className={`${th} text-right`}>Qty PO → saved</th><th className={`${th} text-right`}>Rate PO → saved</th>
                              <th className={`${th} text-right`}>Line value</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.lines.map((l) => (
                              <tr key={l.lineNo}>
                                <td className={`${td} tnum text-ink-400`}>{l.lineNo}</td>
                                <td className={td}>
                                  <div className="font-mono text-ink-900">{l.skuCode}</div>
                                  <div className="font-mono text-[11px] text-ink-400">{l.channelSkuCode}</div>
                                  {l.name && <div className="max-w-[220px] truncate text-[11px] text-ink-600" title={l.name}>{l.name}</div>}
                                </td>
                                <td className={`${td} tnum text-right ${diff(l.qtyDiffers)}`} title={l.qtyDiffers ? VERIFY_TEXT.QTY_DIFF : undefined}>{num(l.po?.qty)} → {num(l.qty)}</td>
                                <td className={`${td} tnum text-right ${diff(l.rateDiffers)}`} title={l.rateDiffers ? VERIFY_TEXT.RATE_DIFF : undefined}>{money(l.po?.rate)} → {money(l.rate)}</td>
                                <td className={`${td} tnum text-right`}>{money(l.value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <div className="overflow-hidden rounded-[var(--radius)] border border-line">
                        <table className="min-w-full border-separate border-spacing-0 text-[12px]">
                          <thead>
                            <tr><th className={th}>{VERIFY_TEXT.TOTALS}</th><th className={`${th} text-right`}>{VERIFY_TEXT.LINES}</th><th className={`${th} text-right`}>{VERIFY_TEXT.UNITS}</th><th className={`${th} text-right`}>{VERIFY_TEXT.VALUE}</th></tr>
                          </thead>
                          <tbody>
                            {([[VERIFY_TEXT.PO_SAYS, data.totals.po], [VERIFY_TEXT.SAVED, data.totals.saved]] as const).map(([label, t]) => (
                              <tr key={label}>
                                <td className={`${td} font-semibold text-ink-900`}>{label}</td>
                                <td className={`${td} tnum text-right ${diff(data.totals.po.lines !== data.totals.saved.lines)}`}>{num(t.lines)}</td>
                                <td className={`${td} tnum text-right ${diff(data.totals.po.units !== data.totals.saved.units)}`}>{num(t.units)}</td>
                                <td className={`${td} tnum text-right`}>{money(t.value)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}
                </>
              )}
            </div>

            {data && can && (
              <div className="space-y-2 border-t border-line bg-alt/40 p-3">
                {sendBack === null ? (
                  <div className="flex flex-wrap items-center gap-2">
                    <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={VERIFY_REMARK_MAX} placeholder={VERIFY_TEXT.NOTE}
                      className="h-9 min-w-[160px] flex-1 rounded-[var(--radius)] border border-line bg-surface px-3 text-[13px] outline-none focus:border-primary" />
                    <button onClick={() => setSendBack('')} disabled={!!busy}
                      className="pf-press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border border-crit/40 bg-surface px-3 text-[13px] font-semibold text-crit hover:bg-crit-soft">
                      <CornerUpLeft className="size-4" />{VERIFY_TEXT.SEND_BACK}
                    </button>
                    <button onClick={() => void run('verify')} disabled={!allTicked || !!busy} title={allTicked ? undefined : VERIFY_TEXT.ALL_LINES_FIRST}
                      className="pf-press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-ok px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50">
                      {busy === 'verify' ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />}{VERIFY_TEXT.APPROVE}
                    </button>
                  </div>
                ) : (
                  <div className="pf-tab-in space-y-2">
                    <textarea value={sendBack} onChange={(e) => setSendBack(e.target.value)} maxLength={VERIFY_REMARK_MAX} rows={2} autoFocus placeholder={VERIFY_TEXT.SEND_BACK_PROMPT}
                      className="w-full rounded-[var(--radius)] border border-crit/40 bg-surface px-3 py-2 text-[13px] outline-none focus:border-crit" />
                    <p className="text-[11.5px] text-ink-600">{VERIFY_TEXT.SEND_BACK_HINT}</p>
                    <div className="flex justify-end gap-2">
                      <button onClick={() => setSendBack(null)} disabled={!!busy} className="h-9 rounded-[var(--radius)] px-3 text-[13px] font-semibold text-ink-600 hover:bg-alt">Cancel</button>
                      <button onClick={() => void run('back')} disabled={!sendBack.trim() || !!busy}
                        className="pf-press inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-crit px-3 text-[13px] font-semibold text-white hover:opacity-90 disabled:opacity-50">
                        {busy === 'back' ? <Loader2 className="size-4 animate-spin" /> : <CornerUpLeft className="size-4" />}{VERIFY_TEXT.SEND_BACK_CONFIRM}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
