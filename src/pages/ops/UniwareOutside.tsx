import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Ban, Check, CheckCircle2, Link2, RefreshCw, XCircle, type LucideIcon } from 'lucide-react'
import { Badge, Button, Modal } from '../../components/ui'
import { inputCls, type FilterValues } from '../../components/kit'
import { ApiError } from '../../api/client'
import { bulkResolveOutside, checkOutsideNow, getOutsideLive, getOutsideStatus, resolveOutside, type OutsideFinding } from '../../api/uniwareOutside'
import { OUTSIDE_FILTER_KEY, OUTSIDE_REMARK_MAX, OUTSIDE_TEXT as T, OUTSIDE_YES, type OutsideAction, type OutsideKind } from '../../constants/uniwareOutside'
import { istDateTime } from '../../lib/time'

/*
 * POs punched in Uniware outside POST_FG (2026-11-25): the strip above a tab (how many, Show only these, Check now, last
 * check), the red badge on a row, and the dialog where the person decides. Shared by In Review, Processed and Rejected.
 */

const STATUS_KEY = ['uniware-outside']

/** The icon of each choice tile. */
const CHOICE_ICON: Record<OutsideAction, LucideIcon> = { use_code: Link2, reject: XCircle, acknowledge: Check, dismiss: Ban }

const ago = (iso: string | null) => {
  if (!iso) return null
  const min = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 60_000))
  return min < 1 ? 'just now' : min < 60 ? `${min} min ago` : min < 1440 ? `${Math.round(min / 60)} h ago` : istDateTime(iso)
}

/** Above a tab: "n POs ... already in Uniware", Show only these / Show all, Check Uniware now, when it was checked. */
export function OutsideStrip({ kind, filters, setFilters, canEdit, liveTick = 0 }: {
  kind: OutsideKind; filters: FilterValues; setFilters: (f: FilterValues) => void; canEdit: boolean; liveTick?: number
}) {
  const qc = useQueryClient()
  const st = useQuery({ queryKey: [...STATUS_KEY, liveTick], queryFn: ({ signal }) => getOutsideStatus(signal), staleTime: 30_000 })
  const [note, setNote] = useState('')
  const check = useMutation({
    mutationFn: checkOutsideNow,
    onSuccess: () => { setNote(T.STARTED); void qc.invalidateQueries({ queryKey: STATUS_KEY }) },
    onError: (e) => setNote(e instanceof ApiError ? e.message : String(e)),
  })
  const n = st.data?.counts[kind] ?? 0
  const cur = filters[OUTSIDE_FILTER_KEY]
  const only = Array.isArray(cur) && cur.join() === OUTSIDE_YES
  const last = ago(st.data?.lastRun.at ?? null)
  const blocked = !!st.data?.button.nextAt
  return (
    <div className={`flex flex-wrap items-center gap-2 rounded-[var(--radius)] border px-3 py-2 text-[12.5px] ${n ? 'border-crit/30 bg-crit-soft text-ink-900' : 'border-line bg-surface text-ink-600'}`}>
      {n > 0 && <AlertTriangle className="size-4 shrink-0 text-crit" />}
      {n > 0 && <span className="font-medium">{T.STRIP(n, T.WHERE[kind])}</span>}
      {n > 0 && (
        <button onClick={() => { const next: FilterValues = { ...filters }; if (only) delete next[OUTSIDE_FILTER_KEY]; else next[OUTSIDE_FILTER_KEY] = [OUTSIDE_YES]; setFilters(next) }} className="font-semibold text-primary underline-offset-2 hover:underline">
          {only ? T.SHOW_ALL : T.SHOW_ONLY}
        </button>
      )}
      <span className="ml-auto text-ink-400">
        {last ? T.LAST(last) : T.NEVER}{st.data?.lastRun.error ? ` · ${st.data.lastRun.error}` : ''}
        {blocked && st.data?.button.nextAt ? ` · ${T.NEXT_AT(istDateTime(st.data.button.nextAt))}` : ''}
      </span>
      {canEdit && (
        <span title={T.CHECK_HINT}>
          <Button disabled={check.isPending || blocked || !!st.data?.running} onClick={() => check.mutate()} icon={<RefreshCw className={`size-3.5 ${check.isPending || st.data?.running ? 'animate-spin' : ''}`} />}>
            {check.isPending || st.data?.running ? T.CHECKING : T.CHECK_NOW}
          </Button>
        </span>
      )}
      {note && <span className="basis-full text-ink-600">{note}</span>}
    </div>
  )
}

/** The red badge on a row; a click opens the dialog (the row itself is not opened). */
export function OutsideBadge({ f, poNumber, canEdit, onDone }: { f: OutsideFinding; poNumber: string; canEdit: boolean; onDone: (msg: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" title={T.BADGE_HINT} onClick={(e) => { e.stopPropagation(); setOpen(true) }}
        className="inline-flex items-center gap-1 rounded-full bg-crit-soft px-2 py-0.5 text-[11.5px] font-semibold text-crit ring-1 ring-crit/30 hover:bg-crit/15">
        <AlertTriangle className="size-3" />{T.BADGE(f.code)}{f.more > 0 ? ` +${f.more}` : ''}
      </button>
      {/* 2026-11-25: drawn on the page, not inside the table cell (the cell's one-line text rule cut the notes and pushed the text box out) */}
      {open && createPortal(<OutsideDialog f={f} poNumber={poNumber} canEdit={canEdit} onClose={() => setOpen(false)} onDone={(m) => { setOpen(false); onDone(m) }} />, document.body)}
    </>
  )
}

function OutsideDialog({ f, poNumber, canEdit, onClose, onDone }: { f: OutsideFinding; poNumber: string; canEdit: boolean; onClose: () => void; onDone: (msg: string) => void }) {
  const qc = useQueryClient()
  const [remark, setRemark] = useState('')
  const [error, setError] = useState('')
  // 2026-11-25: this one order read in Uniware when the dialog opens (one call; cancelled / gone closes the warning)
  const live = useQuery({ queryKey: ['uniware-outside-live', f.id], queryFn: ({ signal }) => getOutsideLive(f.id, signal), retry: false, staleTime: 60_000 })
  const closed = live.data?.closed === true
  const go = useMutation({
    mutationFn: (action: OutsideAction) => resolveOutside(f.id, action, remark.trim()),
    onSuccess: (_r, action) => {
      void qc.invalidateQueries({ queryKey: STATUS_KEY })
      void qc.invalidateQueries({ queryKey: ['po-ended'] })
      onDone(action === 'reject' || action === 'use_code' ? T.DONE[action](poNumber, f.code) : T.DONE[action](poNumber))
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
  })
  const status = live.data?.status ?? f.status
  const [pick, setPick] = useState<OutsideAction>(f.actions[0])
  const needsWhy = pick === 'dismiss' && !remark.trim()
  // one label / value row of the "In Uniware" card; long values wrap inside the card, never out of it
  const fact = (label: string, value: ReactNode) => (
    <>
      <dt className="py-1.5 text-[12px] text-ink-600">{label}</dt>
      <dd className="min-w-0 break-words py-1.5 text-[13px] text-ink-900">{value}</dd>
    </>
  )
  const liveNote = live.isPending ? T.LIVE_SHORT : live.isError ? T.CHECK_FAILED : live.data?.checked ? T.CHECKED_NOW : null
  return (
    <Modal open onClose={onClose} title={T.TITLE} sub={T.SUB(poNumber)}
      footer={closed ? (
        <div className="flex justify-end"><Button variant="primary" onClick={() => onDone(T.LIVE_CLOSED(live.data?.status ?? null))}>{T.CLOSE}</Button></div>
      ) : canEdit ? (
        <div className="flex items-center justify-end gap-2">
          <Button onClick={onClose} disabled={go.isPending}>{T.CANCEL}</Button>
          <button type="button" disabled={go.isPending || needsWhy} onClick={() => { setError(''); go.mutate(pick) }}
            className={`pf-press inline-flex h-9 items-center whitespace-nowrap rounded-[var(--radius)] px-4 text-[13px] font-semibold text-white disabled:opacity-50 ${pick === 'reject' ? 'bg-crit hover:bg-crit/90' : 'bg-primary hover:bg-primary/90'}`}>
            {T.CONFIRM[pick]}
          </button>
        </div>
      ) : undefined}>
      <div className="space-y-4">
        {/* the Uniware order: a small label / value card (2026-11-25, user: text went out of the box) */}
        <section className="rounded-[var(--radius)] border border-line">
          <div className="flex items-center gap-2 border-b border-line bg-alt/50 px-3 py-2">
            <AlertTriangle className="size-4 shrink-0 text-crit" />
            <span className="text-[12px] font-semibold uppercase tracking-wide text-ink-600">{T.IN_UNIWARE}</span>
          </div>
          <dl className="grid grid-cols-[110px_minmax(0,1fr)] gap-x-3 px-3 py-1">
            {fact(T.FIELDS.code, <span className="break-all font-mono font-semibold">{f.code}</span>)}
            {fact(T.FIELDS.channel, f.channel)}
            {fact(T.FIELDS.status, (
              <span className="flex flex-wrap items-center gap-2">
                <Badge tone={status && /COMPLETE|DISPATCH|DELIVER/i.test(status) ? 'ok' : 'info'}>{status ?? '—'}</Badge>
                {liveNote && <span className={`text-[11.5px] ${live.isError ? 'text-warn' : 'text-ink-400'}`}>{liveNote}</span>}
              </span>
            ))}
            {fact(T.FIELDS.created, f.createdAt ? istDateTime(f.createdAt) : '—')}
            {fact(T.FIELDS.seen, istDateTime(f.firstSeenAt))}
          </dl>
        </section>
        {closed && <p className="rounded-[var(--radius)] bg-ok-soft px-3 py-2 text-[12.5px] text-ok">{T.LIVE_CLOSED(live.data?.status ?? null)}</p>}
        {!!live.data?.otherCodes.length && <p className="break-words text-[12.5px] text-ink-600">{T.LIVE_OTHERS(live.data.otherCodes)}</p>}
        {f.more > 0 && <p className="text-[12.5px] text-ink-600">{T.MORE(f.more)}</p>}
        {canEdit && !closed && (
          <section className="space-y-2.5">
            <h4 className="text-[13px] font-semibold text-ink-900">{T.QUESTION}</h4>
            {/* tiles side by side: icon, short title, a 1-2 line note; the picked one gets a coloured ring + a tick */}
            <div role="radiogroup" aria-label={T.QUESTION} className="grid gap-2 sm:grid-cols-2">
              {f.actions.map((a) => {
                const on = pick === a
                const Icon = CHOICE_ICON[a]
                const red = a === 'reject'
                return (
                  <button key={a} type="button" role="radio" aria-checked={on} onClick={() => setPick(a)}
                    className={`relative flex h-full flex-col gap-2 rounded-[var(--radius)] border bg-surface p-3 text-left transition-all duration-150 ${on
                      ? (red ? 'border-crit ring-2 ring-crit/20' : 'border-primary ring-2 ring-primary/20')
                      : 'border-line hover:border-ink-400/50 hover:bg-alt/40'}`}>
                    {on && <CheckCircle2 className={`absolute right-2.5 top-2.5 size-4 ${red ? 'text-crit' : 'text-primary'}`} />}
                    <span className={`grid size-8 place-items-center rounded-full ${red ? 'bg-crit-soft text-crit' : a === 'dismiss' ? 'bg-alt text-ink-600' : 'bg-primary-soft text-primary'}`}>
                      <Icon className="size-4" />
                    </span>
                    <span className="pr-5 text-[13px] font-semibold text-ink-900">{T.CHOICE[a]}</span>
                    <span className="text-[12px] leading-snug text-ink-600 [overflow-wrap:anywhere]">{T.CHOICE_HINT[a](f.code)}</span>
                  </button>
                )
              })}
            </div>
            {pick === 'dismiss' && (
              <div className="pf-tab-in space-y-1">
                <label htmlFor={`outside-why-${f.id}`} className="block text-[12px] font-medium text-ink-600">{T.WHY}</label>
                <textarea id={`outside-why-${f.id}`} autoFocus value={remark} onChange={(e) => setRemark(e.target.value.slice(0, OUTSIDE_REMARK_MAX))} rows={3}
                  className={`${inputCls} h-auto min-h-[76px] resize-y py-2 leading-snug`} />
              </div>
            )}
          </section>
        )}
        {error && <p className="text-[12.5px] text-crit">{error}</p>}
      </div>
    </Modal>
  )
}

/**
 * Many at once (2026-11-25): shown when ticked rows carry a warning; the actions every ticked one allows (Use Uniware's
 * code / Reject here / Noted / Not the same order + remark), one call, the result said on the tab.
 */
export function OutsideBulkBar({ findings, canEdit, onDone }: { findings: OutsideFinding[]; canEdit: boolean; onDone: (msg: string) => void }) {
  const qc = useQueryClient()
  const [remark, setRemark] = useState('')
  const [error, setError] = useState('')
  const actions = (['use_code', 'reject', 'acknowledge', 'dismiss'] as OutsideAction[]).filter((a) => findings.length > 0 && findings.every((f) => f.actions.includes(a)))
  const go = useMutation({
    mutationFn: (action: OutsideAction) => bulkResolveOutside(findings.slice(0, T.BULK_MAX).map((f) => f.id), action, remark.trim()),
    onSuccess: (r) => {
      setRemark('')
      setError('')
      void qc.invalidateQueries({ queryKey: STATUS_KEY })
      void qc.invalidateQueries({ queryKey: ['po-ended'] })
      const skipped = r.filter((x) => x.result === 'skipped')
      onDone(T.BULK_RESULT(r.length - skipped.length, skipped.length) + (skipped.length ? ` ${skipped.slice(0, 3).map((x) => x.reason).join('; ')}` : ''))
    },
    onError: (e) => setError(e instanceof ApiError ? e.message : String(e)),
  })
  if (!canEdit || !findings.length) return null
  return (
    <div className="pf-tab-in flex flex-wrap items-center gap-2 rounded-[var(--radius)] border border-crit/25 bg-crit-soft/40 px-3 py-2 text-[12.5px]">
      <AlertTriangle className="size-4 text-crit" /><span className="font-medium">{T.BULK_INFO(findings.length)}</span>
      {actions.map((a) => (
        <span key={a} title={T.CHOICE_HINT[a](T.BULK_CODES)}>
          <Button variant={a === 'dismiss' ? 'default' : 'primary'} disabled={go.isPending || (a === 'dismiss' && !remark.trim())} onClick={() => go.mutate(a)}>
            <span className="inline-flex items-center gap-1.5 whitespace-nowrap">{T.BULK_LABEL[a]}<span className="rounded-full bg-black/10 px-1.5 text-[11px] font-semibold">{Math.min(findings.length, T.BULK_MAX)}</span></span>
          </Button>
        </span>
      ))}
      {actions.includes('dismiss') && (
        <input value={remark} onChange={(e) => setRemark(e.target.value.slice(0, OUTSIDE_REMARK_MAX))} placeholder={T.BULK_REMARK} className={`${inputCls} max-w-xs`} />
      )}
      {error && <span className="basis-full text-crit">{error}</span>}
    </div>
  )
}

