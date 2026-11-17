import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Button, Modal } from '../../../components/ui'
import { textareaCls } from '../../../components/kit'
import { setVarianceReason } from '../../../api/d2cTransfers'
import { D2C_TEXT, D2C_VARIANCE_NOTE_MAX, D2C_VARIANCE_REASON, D2C_VARIANCE_REASON_LABEL } from '../../../constants/d2cTransfers'
import { D2C_KEY } from '../../../lib/liveTransfers'
import { ErrorBox } from './bits'
import { errorOf, num } from './format'

/*
 * "Add variance reason" of one invoice (POST /d2c-transfers/invoices/:invoiceId/variance-reason { reason, note }; plan
 * 5.6): allowed once its GRN is complete with received != dispatched; a note is required for "Other". The transfer
 * closes when it was its last open variance.
 */

export type VarianceTarget = {
  invoiceId: string; uid: string; transferCode: string; invoiceNo: string | null; inwardPoCode: string | null; units: number; received: number; variance: number
  /** The saved reason / note (editors may change them; every change is logged). */
  reason?: string | null; note?: string | null
}

export function VarianceDialog({ t, onClose }: { t: VarianceTarget; onClose: () => void }) {
  const qc = useQueryClient()
  const [reason, setReason] = useState<string>(t.reason ?? (t.variance < 0 ? D2C_VARIANCE_REASON.SHORT_RECEIVED : D2C_VARIANCE_REASON.EXCESS))
  const [note, setNote] = useState(t.note ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<ReturnType<typeof errorOf> | null>(null)
  const needsNote = reason === D2C_VARIANCE_REASON.OTHER
  const unchanged = !!t.reason && reason === t.reason && note.trim() === (t.note ?? '')
  const ok = (!needsNote || note.trim().length > 0) && note.length <= D2C_VARIANCE_NOTE_MAX && !unchanged
  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      await setVarianceReason(t.invoiceId, reason, note.trim())
      void qc.invalidateQueries({ queryKey: [D2C_KEY] })
      onClose()
    } catch (e) {
      setError(errorOf(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <Modal open onClose={onClose} title={`Variance reason · ${t.invoiceNo ?? t.transferCode}`}
      sub={`${t.transferCode}${t.inwardPoCode ? ` · inward PO ${t.inwardPoCode}` : ''}. ${D2C_TEXT.VARIANCE_HELP}`}
      footer={<><Button onClick={onClose}>Close</Button><Button variant="primary" disabled={!ok || busy} onClick={() => void save()}>{busy ? 'Saving…' : 'Save reason'}</Button></>}>
      <div className="mb-3 grid grid-cols-3 gap-2 rounded-[var(--radius)] border border-line bg-canvas px-3 py-2 text-[12.5px]">
        <div><div className="text-[11px] text-ink-400">Dispatched</div><div className="tnum font-semibold">{num(t.units)}</div></div>
        <div><div className="text-[11px] text-ink-400">Received</div><div className="tnum font-semibold">{num(t.received)}</div></div>
        <div><div className="text-[11px] text-ink-400">Variance</div><div className="tnum font-semibold text-crit">{t.variance > 0 ? `+${num(t.variance)}` : num(t.variance)}</div></div>
      </div>
      <fieldset>
        <legend className="block text-[12px] font-medium text-ink-600">Reason *</legend>
        <div className="mt-1 grid grid-cols-2 gap-2">
          {Object.values(D2C_VARIANCE_REASON).map((r) => (
            <label key={r} className={`flex cursor-pointer items-center gap-2 rounded-[var(--radius)] border px-3 py-2 text-[13px] ${reason === r ? 'border-primary bg-primary-soft text-primary' : 'border-line'}`}>
              <input type="radio" name="variance-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="accent-[var(--color-primary)]" />
              {D2C_VARIANCE_REASON_LABEL[r]}
            </label>
          ))}
        </div>
      </fieldset>
      <label className="mt-3 block text-[12px] font-medium text-ink-600">Note{needsNote ? ' *' : ''}</label>
      <textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={D2C_VARIANCE_NOTE_MAX} placeholder="e.g. 2 cartons torn at the receiving dock" className={`${textareaCls} mt-1`} />
      <div className="mt-1 text-right text-[11px] text-ink-400">{note.length}/{D2C_VARIANCE_NOTE_MAX}</div>
      {error && <div className="mt-2"><ErrorBox text={error.message} problems={error.problems} /></div>}
    </Modal>
  )
}
