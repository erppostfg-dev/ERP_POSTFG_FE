import { useState } from 'react'
import { createPortal } from 'react-dom'
import { CalendarClock, Mail, PencilLine } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Modal } from '../../components/ui'
import { fmtDate } from '../../lib/ops'
import { getAppointmentHistory, type AppointmentHistoryItem } from '../../api/appointments'
import { APPOINTMENT_TEXT as T, type AppointmentSource } from '../../constants/appointments'

/*
 * PO Overview's Current Appointment Date cell (2026-11-16, user: "show in that column which came from the email; click it =
 * that row's history, how it was updated"): the date + where it came from (✉ email / ✎ typed / Cancelled by email);
 * a click opens the appointment history (emails applied or not, people's changes), newest first.
 */

export type AppointmentRow = { uid?: unknown; poNumber?: unknown; currentAppointmentDate?: unknown; appointmentSource?: unknown }

const SOURCES: readonly AppointmentSource[] = ['email', 'typed', 'cancelled', 'none']
const sourceOf = (v: unknown): AppointmentSource => (SOURCES.includes(v as AppointmentSource) ? (v as AppointmentSource) : 'none')
const time = (iso: string) => new Date(iso).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function AppointmentCell({ row }: { row: AppointmentRow }) {
  const [open, setOpen] = useState(false)
  const source = sourceOf(row.appointmentSource)
  const date = typeof row.currentAppointmentDate === 'string' ? row.currentAppointmentDate : null
  return (
    <>
      {/* stopPropagation: the click opens the history, not the row's drawer or the cell copy */}
      <button type="button" title={`${T.MARK_TITLE[source]} · ${T.OPEN}`} onClick={(e) => { e.stopPropagation(); setOpen(true) }} onDoubleClick={(e) => e.stopPropagation()}
        className="pf-press inline-flex items-center gap-1.5 rounded-md text-left hover:opacity-80">
        {source === 'cancelled'
          ? <Badge tone="crit">{T.CANCELLED}</Badge>
          : <span className="tnum text-[12.5px]">{fmtDate(date)}</span>}
        {source === 'email' && <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary"><Mail className="size-3" />email</span>}
        {source === 'cancelled' && <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-400"><Mail className="size-3" />{T.MARK.cancelled}</span>}
        {source === 'typed' && <span className="inline-flex items-center gap-0.5 text-[11px] text-ink-400"><PencilLine className="size-3" />typed</span>}
        {source === 'none' && <CalendarClock className="size-3.5 text-ink-400" />}
      </button>
      {open && <AppointmentHistory uid={String(row.uid)} poNumber={String(row.poNumber ?? row.uid)} onClose={() => setOpen(false)} />}
    </>
  )
}

function Entry({ e }: { e: AppointmentHistoryItem }) {
  const email = e.kind === 'email'
  const cancelled = e.action === 'cancelled' || e.action === 'cleared'
  const facts = [
    e.slot && [T.SLOT, e.slot], e.appointmentRef && [T.ID, e.appointmentRef], e.hub && [T.HUB, e.hub], e.quantity !== null && [T.QTY, String(e.quantity)],
  ].filter(Boolean) as [string, string][]
  const outcome = e.outcome ? T.OUTCOME[e.outcome] ?? e.outcome : ''
  return (
    <li className={`relative border-l-2 py-2.5 pl-4 ${e.current ? 'border-primary' : 'border-line'} ${e.outcome === 'older' ? 'opacity-60' : ''}`}>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="tnum text-ink-400">{time(e.at)}</span>
        <Badge tone={cancelled ? 'crit' : email ? 'info' : 'neutral'}>{T.ACTION[e.action] ?? e.action}</Badge>
        <span className={`tnum font-semibold ${cancelled ? 'text-ink-400 line-through' : 'text-ink-900'}`}>{fmtDate(e.date)}</span>
        {e.previousDate && <span className="tnum text-[11.5px] text-ink-400">{T.WAS(fmtDate(e.previousDate))}</span>}
        {e.current && <Badge tone="primary">{T.CURRENT}</Badge>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-ink-600">
        <span className="inline-flex items-center gap-1">
          {email ? <Mail className="size-3" /> : <PencilLine className="size-3" />}
          {email ? T.EMAIL_BY(e.by ?? '') : e.by ?? T.BY_APP}
        </span>
        {facts.map(([k, v]) => <span key={k}><span className="text-ink-400">{k}</span> {v}</span>)}
        {outcome && <span className="font-semibold text-warn">{outcome}</span>}
      </div>
      {e.remark && <div className="mt-0.5 text-[11.5px] text-ink-400">{e.remark}</div>}
    </li>
  )
}

function AppointmentHistory({ uid, poNumber, onClose }: { uid: string; poNumber: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['po-appointments', uid], queryFn: ({ signal }) => getAppointmentHistory(uid, signal), staleTime: 0 })
  // On <body> (a fixed modal inside the grid's cell would be placed against the cell); its clicks stop here.
  return createPortal(
    <div onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><CalendarClock className="size-4" />{T.TITLE(poNumber)}</span>} sub={T.SUB}
        footer={<Button onClick={onClose}>{T.CLOSE}</Button>}>
        {q.isLoading && <p className="py-6 text-center text-[13px] text-ink-400">{T.LOADING}</p>}
        {q.isError && <p className="py-6 text-center text-[13px] text-crit">{T.FAILED}</p>}
        {q.data && q.data.length === 0 && <p className="py-6 text-center text-[13px] text-ink-400">{T.EMPTY}</p>}
        {q.data && q.data.length > 0 && (
          <ol className="max-h-[60vh] space-y-1 overflow-y-auto pr-1">
            {q.data.map((e, i) => <Entry key={`${e.at}-${i}`} e={e} />)}
          </ol>
        )}
      </Modal>
    </div>,
    document.body,
  )
}
