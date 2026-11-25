import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button, Modal } from '../../components/ui'
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
      {open && <OutsideDialog f={f} poNumber={poNumber} canEdit={canEdit} onClose={() => setOpen(false)} onDone={(m) => { setOpen(false); onDone(m) }} />}
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
  const row = (label: string, value: string | null) => (
    <div className="flex gap-3 py-1 text-[13px]"><span className="w-40 shrink-0 text-ink-600">{label}</span><span className="font-medium text-ink-900">{value ?? '—'}</span></div>
  )
  return (
    <Modal open onClose={onClose} title={T.TITLE} sub={T.SUB(poNumber)}
      footer={closed ? (
        <div className="flex justify-end"><Button variant="primary" onClick={() => onDone(T.LIVE_CLOSED(live.data?.status ?? null))}>{T.CLOSE}</Button></div>
      ) : canEdit ? (
        <div className="flex flex-wrap justify-end gap-2">
          <Button onClick={onClose} disabled={go.isPending}>{T.CANCEL}</Button>
          {f.actions.map((a) => (
            <span key={a} title={T.ACTION_HINT[a]}>
              <Button variant={a === 'dismiss' ? 'default' : 'primary'} disabled={go.isPending || (a === 'dismiss' && !remark.trim())} onClick={() => { setError(''); go.mutate(a) }}>
                {T.ACTION[a]}
              </Button>
            </span>
          ))}
        </div>
      ) : undefined}>
      <div className="space-y-3">
        <div className="divide-y divide-line rounded-[var(--radius)] border border-line px-3 py-1">
          {row(T.FIELDS.code, f.code)}
          {row(T.FIELDS.channel, f.channel)}
          {row(T.FIELDS.status, live.data?.status ?? f.status)}
          {row(T.FIELDS.created, f.createdAt ? istDateTime(f.createdAt) : null)}
          {row(T.FIELDS.seen, istDateTime(f.firstSeenAt))}
        </div>
        {live.isPending && <p className="text-[12.5px] text-ink-400">{T.LIVE_CHECKING}</p>}
        {live.isError && <p className="text-[12.5px] text-warn">{T.LIVE_FAILED(live.error instanceof ApiError ? live.error.message : String(live.error))}</p>}
        {closed && <p className="rounded-[var(--radius)] bg-ok-soft px-3 py-2 text-[12.5px] text-ok">{T.LIVE_CLOSED(live.data?.status ?? null)}</p>}
        {!!live.data?.otherCodes.length && <p className="text-[12.5px] text-ink-600">{T.LIVE_OTHERS(live.data.otherCodes)}</p>}
        {f.more > 0 && <p className="text-[12.5px] text-ink-600">{T.MORE(f.more)}</p>}
        {canEdit && !closed && (
          <>
            <ul className="space-y-1 text-[12.5px] text-ink-600">
              {f.actions.map((a) => <li key={a}><span className="font-semibold text-ink-900">{T.ACTION[a]}:</span> {T.ACTION_HINT[a]}</li>)}
            </ul>
            <textarea value={remark} onChange={(e) => setRemark(e.target.value.slice(0, OUTSIDE_REMARK_MAX))} placeholder={T.REMARK} rows={2} className={`${inputCls} w-full`} />
          </>
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
        <span key={a} title={T.ACTION_HINT[a]}>
          <Button variant={a === 'dismiss' ? 'default' : 'primary'} disabled={go.isPending || (a === 'dismiss' && !remark.trim())} onClick={() => go.mutate(a)}>
            {T.BULK_ACTION(T.ACTION[a], Math.min(findings.length, T.BULK_MAX))}
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

