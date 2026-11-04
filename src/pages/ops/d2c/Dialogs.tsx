import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Modal } from '../../../components/ui'
import { DateInput, textareaCls } from '../../../components/kit'
import { cancelTransfer, changeExpiry, closeShort, type D2cCloseShortResult } from '../../../api/d2cTransfers'
import { D2C_ERROR, D2C_REASON_MAX, D2C_TEXT } from '../../../constants/d2cTransfers'
import { D2C_KEY } from '../../../lib/liveTransfers'
import { fmtDate } from '../../../lib/ops'
import { ErrorBox } from './bits'
import { errorOf } from './format'

/*
 * Cancel (POST /:id/cancel { reason }: a draft, or a transfer with an SO before any dispatch: its open SO lines are
 * cancelled in Uniware first), Close short (POST /:id/close-short { reason }: every SO line still open is cancelled in
 * Uniware; the answer lists what was and was not) and change the PO expiry (POST /:id/expiry { date, remark }).
 * Nothing happens by itself on expiry (user, 2026-11-03): the list flags "Expired" and Ops close short or extend here.
 */

export type DialogTarget = {
  uid: string; transferCode: string; poDate: string | null; expiryDate: string | null; expired: boolean
  /** The Uniware SO (cancel / close short then reach Uniware) and its dispatch warehouse. */
  soCode?: string | null; sender?: string | null
}

/** The message of a failed Uniware action: the gate's message when it is switched off. */
const uniwareMessage = (e: ReturnType<typeof errorOf>, testFacilities: string[]) => (e.code === D2C_ERROR.NOT_LIVE ? D2C_TEXT.NOT_LIVE(testFacilities.join(', ')) : e.message)

const useRefresh = () => {
  const qc = useQueryClient()
  return (uid: string) => {
    void qc.invalidateQueries({ queryKey: [D2C_KEY, 'list'] })
    void qc.invalidateQueries({ queryKey: [D2C_KEY, 'counts'] })
    void qc.invalidateQueries({ queryKey: [D2C_KEY, 'detail', uid] })
  }
}

export function CancelDialog({ t, onClose, testFacilities = [] }: { t: DialogTarget; onClose: () => void; testFacilities?: string[] }) {
  const refresh = useRefresh()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ReturnType<typeof errorOf> | null>(null)
  const ok = reason.trim().length > 0 && reason.length <= D2C_REASON_MAX
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await cancelTransfer(t.uid, reason.trim())
      refresh(t.uid)
      onClose()
    } catch (e) {
      setError(errorOf(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Cancel ${t.transferCode}`}
      sub={t.soCode ? `${D2C_TEXT.CANCEL_WITH_SO} SO ${t.soCode} at ${t.sender ?? '-'}. The reason is kept in its history.` : 'The draft is cancelled for good: nothing will be sent to Uniware. The reason is kept in its history.'}
      footer={<><Button onClick={onClose}>Keep it</Button><Button variant="primary" disabled={!ok || busy} onClick={() => void save()}>{busy ? 'Cancelling…' : 'Cancel transfer'}</Button></>}>
      <label className="block text-[12px] font-medium text-ink-600">Reason *</label>
      <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={D2C_REASON_MAX} placeholder="e.g. raised twice, stock moved by another transfer…" className={`${textareaCls} mt-1`} />
      <div className="mt-1 text-right text-[11px] text-ink-400">{reason.length}/{D2C_REASON_MAX}</div>
      {error && <div className="mt-2"><ErrorBox text={uniwareMessage(error, testFacilities)} problems={error.problems} /></div>}
    </Modal>
  )
}

/** Close short: cancel every SO line still open in Uniware; shows which lines Uniware cancelled and which it refused. */
export function CloseShortDialog({ t, onClose, testFacilities = [] }: { t: DialogTarget; onClose: () => void; testFacilities?: string[] }) {
  const refresh = useRefresh()
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ReturnType<typeof errorOf> | null>(null)
  const [done, setDone] = useState<D2cCloseShortResult | null>(null)
  const ok = reason.trim().length > 0 && reason.length <= D2C_REASON_MAX
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      setDone((await closeShort(t.uid, reason.trim())).closeShort)
      refresh(t.uid)
    } catch (e) {
      setError(errorOf(e))
      refresh(t.uid)
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Close short ${t.transferCode}`} sub={`${D2C_TEXT.CLOSE_SHORT_HELP}${t.soCode ? ` SO ${t.soCode} at ${t.sender ?? '-'}.` : ''}`}
      footer={done
        ? <Button variant="primary" onClick={onClose}>Done</Button>
        : <><Button onClick={onClose}>Keep it open</Button><Button variant="primary" disabled={!ok || busy} onClick={() => void save()}>{busy ? 'Closing in Uniware…' : 'Close short'}</Button></>}>
      {t.expired && !done && <div className="mb-3 rounded-[var(--radius)] border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">{D2C_TEXT.EXPIRED_PROMPT}</div>}
      {done ? (
        <div className="space-y-2 text-[12.5px]">
          <div className="text-ok">Cancelled in Uniware: {done.cancelled.map((c) => c.sku).join(', ') || '—'}</div>
          {done.updated.length > 0 && <div className="text-ink-600">Quantities now: {done.updated.join(', ')}</div>}
          {done.refused.length > 0 && <ErrorBox text="Uniware did not cancel these lines (they stay open):" problems={done.refused.map((r) => ({ field: r.sku, message: `${r.sku}: ${r.why}` }))} />}
          {done.skipped.length > 0 && <div className="text-ink-600">Already shipped or done: {done.skipped.map((s) => `${s.sku} (${s.why})`).join(', ')}</div>}
        </div>
      ) : (
        <>
          <label className="block text-[12px] font-medium text-ink-600">Reason *</label>
          <textarea autoFocus value={reason} onChange={(e) => setReason(e.target.value)} maxLength={D2C_REASON_MAX} placeholder="e.g. stock not available, PO expired…" className={`${textareaCls} mt-1`} />
          <div className="mt-1 text-right text-[11px] text-ink-400">{reason.length}/{D2C_REASON_MAX}</div>
          {error && <div className="mt-2"><ErrorBox text={uniwareMessage(error, testFacilities)} problems={error.problems} /></div>}
        </>
      )}
    </Modal>
  )
}

export function ExpiryDialog({ t, onClose }: { t: DialogTarget; onClose: () => void }) {
  const refresh = useRefresh()
  const [date, setDate] = useState(t.expiryDate ?? '')
  const [remark, setRemark] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ReturnType<typeof errorOf> | null>(null)
  const beforePo = !!date && !!t.poDate && date < t.poDate
  const ok = !!date && !beforePo && date !== t.expiryDate && remark.length <= D2C_REASON_MAX
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await changeExpiry(t.uid, date, remark.trim())
      refresh(t.uid)
      onClose()
    } catch (e) {
      setError(errorOf(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Change expiry of ${t.transferCode}`} sub={`PO date ${fmtDate(t.poDate)} · expiry now ${fmtDate(t.expiryDate)}`}
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" disabled={!ok || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save expiry'}</Button></>}>
      {t.expired && <div className="mb-3 rounded-[var(--radius)] border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">{D2C_TEXT.EXPIRED_PROMPT}</div>}
      <label className="block text-[12px] font-medium text-ink-600">New PO expiry date *</label>
      <div className="mt-1"><DateInput value={date} onChange={setDate} /></div>
      {beforePo && <div className="mt-1 text-[12px] text-crit">The expiry must not be before the PO date ({fmtDate(t.poDate)}).</div>}
      <label className="mt-3 block text-[12px] font-medium text-ink-600">Remark</label>
      <textarea value={remark} onChange={(e) => setRemark(e.target.value)} maxLength={D2C_REASON_MAX} placeholder="Why it is extended (optional)" className={`${textareaCls} mt-1`} />
      {error && <div className="mt-2"><ErrorBox text={error.message} problems={error.problems} /></div>}
    </Modal>
  )
}
