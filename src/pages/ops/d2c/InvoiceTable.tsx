import type { ReactNode } from 'react'
import { AlertTriangle, Eye, MessageSquarePlus } from 'lucide-react'
import { Badge } from '../../../components/ui'
import type { D2cInvoiceRow } from '../../../api/d2cTransfers'
import {
  D2C_INWARD_CANCELLED, D2C_INWARD_STATE_LABEL, D2C_PO_STATUS_TONE, D2C_SO_STATE, D2C_TAB, D2C_TEXT, D2C_VARIANCE_REASON_LABEL, type D2cTab,
} from '../../../constants/d2cTransfers'
import { PriorityBadge, StageBadge } from './bits'
import { fmtDateTime, num } from './format'

/*
 * The invoice rows of the two inward tabs (phase 7; plan 1.3 / 9.1; GET /d2c-transfers/invoices):
 *   Create inward PO  one row per dispatched invoice without an inward PO (or a refused one): transfer, invoice no,
 *                     dispatched units, receiving WH and the route's vendor code ("Vendor missing" blocks the row);
 *                     editors tick rows for one "Create inward PO" (confirm dialog + job progress).
 *   Inward POs        one row per inward PO in flight / created (transfer not closed): code + request state, Uniware PO
 *                     status, GRNs, received, variance (red when != 0; an orange marker while it has no reason) and
 *                     "Add variance reason" once the GRN is complete.
 */

export type InvoiceSelection = { selected: ReadonlySet<string>; onChange: (ids: string[], on: boolean) => void }

type Col = { label: string; render: (r: D2cInvoiceRow) => ReactNode; right?: boolean }

const mono = (v: string | null) => (v ? <span className="font-mono text-[12.5px]">{v}</span> : <span className="text-ink-400">—</span>)
const n = (v: number) => <span className="tnum">{num(v)}</span>

const vendor = (r: D2cInvoiceRow) => (r.vendorMissing
  ? <span title={D2C_TEXT.MISSING_VENDOR}><Badge tone="crit"><AlertTriangle className="size-3" />{D2C_TEXT.VENDOR_MISSING}</Badge></span>
  : mono(r.vendorCode))

/** Not asked / Refused: reason / Requested / Checking / Created + code. */
const inwardState = (r: D2cInvoiceRow) => {
  if (!r.inwardPoState) return <span className="text-ink-400">Not created</span>
  if (r.inwardPoState === D2C_SO_STATE.FAILED && r.inwardPoStatus === 'CANCELLED') return <span className="text-warn" title={r.inwardPoError ?? undefined}>{D2C_INWARD_CANCELLED}</span>
  const label = D2C_INWARD_STATE_LABEL[r.inwardPoState] ?? r.inwardPoState
  const tone = r.inwardPoState === D2C_SO_STATE.FAILED ? 'text-crit' : r.inwardPoState === D2C_SO_STATE.CREATED ? 'text-ok' : 'text-warn'
  return (
    <span className={`inline-block max-w-[280px] truncate align-bottom ${tone}`} title={r.inwardPoError ?? undefined}>
      {r.inwardPoState === D2C_SO_STATE.FAILED && r.inwardPoError ? `${label}: ${r.inwardPoError}` : label}
    </span>
  )
}

const poStatus = (r: D2cInvoiceRow) => (r.inwardPoStatus
  ? <span title={r.inwardPoStatus === 'CREATED' ? D2C_TEXT.PO_APPROVAL : undefined}><Badge tone={D2C_PO_STATUS_TONE[r.inwardPoStatus] ?? 'neutral'}>{r.inwardPoStatus}</Badge></span>
  : <span className="text-ink-400">—</span>)

const grns = (r: D2cInvoiceRow) => {
  const list = r.grnCodes ?? []
  if (!list.length) return <span className="text-ink-400">{r.inwardPoState === D2C_SO_STATE.CREATED ? 'None yet' : '—'}</span>
  return (
    <span className="text-[12.5px]" title={list.map((g) => `${g.code} ${g.status ?? ''} ${g.units} unit(s)${g.rejected ? `, ${g.rejected} rejected` : ''}`).join('\n')}>
      <span className="font-mono">{list.map((g) => g.code).join(', ')}</span>
      <span className="ml-1 text-ink-400">{r.grnCompletedAt ? `· done ${fmtDateTime(r.grnCompletedAt)}` : `· ${D2C_TEXT.GRN_PENDING.toLowerCase()}`}</span>
    </span>
  )
}

const variance = (r: D2cInvoiceRow) => {
  if (!r.grnCodes?.length && !r.grnCompletedAt) return <span className="text-ink-400">—</span>
  const v = r.variance
  return (
    <span className="inline-flex flex-col items-end">
      <span className={`tnum inline-flex items-center gap-1.5 ${v ? 'font-semibold text-crit' : ''}`}>
        {r.varianceOpen && <span title="Variance without a reason" className="size-2 rounded-full bg-warn" />}
        {v > 0 ? `+${num(v)}` : num(v)}
      </span>
      {r.varianceReason && <span className="text-[11px] text-ink-600" title={r.varianceNote ?? undefined}>{D2C_VARIANCE_REASON_LABEL[r.varianceReason] ?? r.varianceReason}</span>}
      {!r.grnCompletedAt && <span className="text-[11px] text-ink-400">so far</span>}
    </span>
  )
}

const C = {
  ref: { label: 'Reference ID', render: (r) => mono(r.reference) },
  invoice: { label: 'Invoice no', render: (r) => mono(r.invoiceNo) },
  dispatchedAt: { label: 'Dispatched at', render: (r) => <span className="tnum text-[12.5px]">{fmtDateTime(r.dispatchedAt)}</span> },
  sender: { label: 'Dispatch WH', render: (r) => mono(r.sender) },
  receiving: { label: 'Receiving WH', render: (r) => mono(r.receiving) },
  units: { label: 'Dispatched units', render: (r) => n(r.units), right: true },
  vendor: { label: 'Vendor code', render: vendor },
  state: { label: 'Inward PO', render: inwardState },
  inwardPo: { label: 'Inward PO', render: (r) => <span className="inline-flex flex-col">{mono(r.inwardPoCode)}{r.inwardPoState !== D2C_SO_STATE.CREATED && inwardState(r)}</span> },
  poStatus: { label: 'Uniware status', render: poStatus },
  grn: { label: 'GRN', render: grns },
  received: { label: 'Received', render: (r) => n(r.receivedUnits), right: true },
  variance: { label: 'Variance', render: variance, right: true },
  priority: { label: 'Priority', render: (r) => <PriorityBadge p={r.priority} /> },
  stage: { label: 'Status', render: (r) => <StageBadge stage={r.stage} /> },
} satisfies Record<string, Col>

const COLUMNS: Partial<Record<D2cTab, Col[]>> = {
  [D2C_TAB.CREATE_INWARD_PO]: [C.invoice, C.dispatchedAt, C.sender, C.receiving, C.units, C.vendor, C.state, C.ref, C.priority],
  [D2C_TAB.INWARD_POS]: [C.inwardPo, C.poStatus, C.invoice, C.receiving, C.sender, C.units, C.received, C.variance, C.grn, C.priority, C.stage],
}

export function InvoiceTable({ tab, rows, onOpen, onVariance, selection, editor, maxHeight }: {
  tab: D2cTab; rows: D2cInvoiceRow[]; onOpen: (uid: string) => void; onVariance: (r: D2cInvoiceRow) => void; selection?: InvoiceSelection; editor: boolean
  maxHeight: string
}) {
  const cols = COLUMNS[tab] ?? []
  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-line bg-alt px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600'
  const td = 'whitespace-nowrap border-b border-line px-3 py-2.5 transition-colors duration-200 group-hover:bg-canvas'
  const pickable = selection ? rows.filter((r) => r.canCreate).map((r) => r.id) : []
  const allPicked = pickable.length > 0 && pickable.every((id) => selection?.selected.has(id))
  const span = cols.length + 2 + (selection ? 1 : 0)
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="overflow-auto" style={{ maxHeight }}>
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            <tr>
              {selection && (
                <th className={`${th} left-0 z-20 w-8 px-2`}>
                  <input type="checkbox" aria-label="Select all" disabled={!pickable.length} checked={allPicked} onChange={(e) => selection.onChange(pickable, e.target.checked)} className="size-3.5 accent-[var(--color-primary)]" />
                </th>
              )}
              <th className={`${th} ${selection ? 'left-8' : 'left-0'} z-20`}>Transfer ID</th>
              {cols.map((c) => <th key={c.label} className={`${th} ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}
              <th className={`${th} right-0 z-20 border-l`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={span} className="px-4 py-14 text-center text-[13px] text-ink-400">{tab === D2C_TAB.CREATE_INWARD_PO ? D2C_TEXT.INWARD_EMPTY : D2C_TEXT.INWARD_POS_EMPTY}</td></tr>
            )}
            {rows.map((r) => (
              <tr key={r.id} onDoubleClick={() => onOpen(r.uid)} className="group">
                {selection && (
                  <td className={`${td} sticky left-0 z-[5] w-8 bg-surface px-2`}>
                    {r.canCreate
                      ? <input type="checkbox" aria-label={`Select invoice ${r.invoiceNo ?? r.id}`} checked={selection.selected.has(r.id)} onChange={(e) => selection.onChange([r.id], e.target.checked)} className="size-3.5 accent-[var(--color-primary)]" />
                      : <span title={r.createBlockedBecause ?? undefined}><AlertTriangle className="size-3.5 text-ink-400" /></span>}
                  </td>
                )}
                <td className={`${td} sticky ${selection ? 'left-8' : 'left-0'} z-[5] bg-surface ${r.varianceOpen ? 'border-l-4 border-l-warn' : ''}`}>
                  <button onClick={() => onOpen(r.uid)} className="font-mono text-[12.5px] font-semibold text-primary hover:underline">{r.transferCode}</button>
                  {tab === D2C_TAB.CREATE_INWARD_PO && !r.canCreate && r.createBlockedBecause && !r.vendorMissing && (
                    <div className="max-w-[240px] truncate text-[11px] text-ink-400" title={r.createBlockedBecause}>{r.createBlockedBecause}</div>
                  )}
                </td>
                {cols.map((c) => <td key={c.label} className={`${td} ${c.right ? 'text-right' : ''}`}>{c.render(r)}</td>)}
                <td className={`${td} sticky right-0 z-[5] border-l bg-surface px-2 py-1.5`}>
                  <div className="flex items-center gap-0.5">
                    <button title="View transfer" aria-label="View transfer" onClick={() => onOpen(r.uid)} className="pf-press rounded-md p-1.5 text-ink-600 hover:bg-alt hover:text-ink-900"><Eye className="size-3.5" /></button>
                    {editor && r.canVarianceReason && (
                      <button title={r.varianceReason ? 'Change variance reason' : 'Add variance reason'} aria-label={r.varianceReason ? 'Change variance reason' : 'Add variance reason'} onClick={() => onVariance(r)}
                        className={`pf-press inline-flex items-center gap-1 rounded-md px-1.5 py-1 text-[12px] font-semibold ${r.varianceReason ? 'text-ink-600 hover:bg-alt' : 'text-warn hover:bg-warn-soft'}`}>
                        <MessageSquarePlus className="size-3.5" /> {r.varianceReason ? 'Edit reason' : 'Reason'}
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
