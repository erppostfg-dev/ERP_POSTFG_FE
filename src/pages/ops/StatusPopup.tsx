import { useState } from 'react'
import { createPortal } from 'react-dom'
import { AlertTriangle, Info } from 'lucide-react'
import { Badge, Button, Modal } from '../../components/ui'
import { statusTone } from '../../lib/ops'
import { STATUS_POPUP as T } from '../../constants/poOverview'

/*
 * PEPIMS's status popup (2026-11-06): the Status column at the end of PO Format Data and Shipment Status shows the final
 * status; its ⓘ opens "Final Status - PO: …" with Planning, Warehouse, Logistics and the Final Status. An empty stage
 * counts as Confirmed; no row in the final status master = "No mapping available!" (PEPIMS's words).
 */

/** What a row needs: the PO number, the three stages and the final status the backend worked out (null = no mapping). */
export type StatusRow = { poNumber?: unknown; statusPlanning?: unknown; statusWarehouse?: unknown; statusLogistics?: unknown; statusFinal?: unknown }

const text = (v: unknown): string => (typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : '')

/** The Status cell: the final status (or "No mapping available!") and the ⓘ that opens the popup. */
export function StatusCell({ row }: { row: StatusRow }) {
  const [open, setOpen] = useState(false)
  const final = text(row.statusFinal)
  return (
    <>
      {/* stopPropagation: the click opens the popup, not the row's drawer or the cell copy */}
      <button type="button" title={T.OPEN} aria-label={`${T.OPEN}: ${final || T.NO_MAPPING}`} onClick={(e) => { e.stopPropagation(); setOpen(true) }} onDoubleClick={(e) => e.stopPropagation()}
        className="pf-press inline-flex items-center gap-1.5 rounded-md text-left hover:opacity-80">
        {final ? <Badge tone={statusTone(final)}>{final}</Badge> : <span className="text-[12px] text-crit">{T.NO_MAPPING}</span>}
        <Info className="size-3.5 shrink-0 text-ink-400" />
      </button>
      {open && <StatusPopup row={row} onClose={() => setOpen(false)} />}
    </>
  )
}

function StatusPopup({ row, onClose }: { row: StatusRow; onClose: () => void }) {
  const final = text(row.statusFinal)
  // On <body> (a fixed modal inside the grid's animated cell would be placed against the cell); React events still bubble
  // to the row, so its clicks stop here (no row drawer, no cell copy).
  return createPortal(
    <div onClick={(e) => e.stopPropagation()} onDoubleClick={(e) => e.stopPropagation()}>
      <Modal open onClose={onClose} title={<span className="flex items-center gap-2"><AlertTriangle className="size-4" />{T.TITLE(text(row.poNumber) || '—')}</span>}
        footer={<Button onClick={onClose}>{T.CLOSE}</Button>}>
        <dl className="divide-y divide-line text-[13px]">
          {T.STAGES.map((s) => {
            const v = text(row[s.key])
            return (
              <div key={s.key} className="flex items-center justify-between gap-4 py-2.5">
                <dt className="text-ink-600">{s.label}</dt>
                <dd className="flex items-center gap-2">
                  <Badge tone={statusTone(v || T.WHEN_EMPTY)}>{v || T.WHEN_EMPTY}</Badge>
                  {!v && <span className="text-[11px] text-ink-400">{T.EMPTY_NOTE}</span>}
                </dd>
              </div>
            )
          })}
          <div className="flex items-center justify-between gap-4 py-2.5">
            <dt className="font-semibold text-ink-900">{T.FINAL}</dt>
            <dd>{final ? <Badge tone={statusTone(final)}>{final}</Badge> : <span className="font-semibold text-crit">{T.NO_MAPPING}</span>}</dd>
          </div>
        </dl>
      </Modal>
    </div>,
    document.body,
  )
}
