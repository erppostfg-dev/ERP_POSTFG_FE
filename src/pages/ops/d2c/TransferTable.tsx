import { Fragment, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { ChevronRight, Eye, MoreHorizontal } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { getTransfer, type D2cListItem } from '../../../api/d2cTransfers'
import { D2C_SO_NOT_CREATED, D2C_SO_NOT_FOUND, D2C_SO_STATE, D2C_SO_STATE_LABEL, D2C_SOURCE_LABEL, D2C_TAB, type D2cTab } from '../../../constants/d2cTransfers'
import { fmtDate } from '../../../lib/ops'
import { D2C_KEY } from '../../../lib/liveTransfers'
import { ExpiredBadge, PartlyBadge, PriorityBadge, StageBadge } from './bits'
import { fmtDateTime, num } from './format'

/*
 * The transfers list of one sub-tab (PRD "UI: sub-tabs and screens", plan 9.1): the tab's columns, a chevron that
 * shows / hides the transfer's SKU lines under the row (read from GET /d2c-transfers/:id), the eye opens the detail,
 * ⋯ lists the row actions. Its own table (the shared DataGrid has no expandable rows); the same look.
 */

type Col = { label: string; render: (t: D2cListItem) => ReactNode; right?: boolean }

const mono = (v: string | null) => (v ? <span className="font-mono text-[12.5px]">{v}</span> : <span className="text-ink-400">—</span>)
const day = (v: string | null) => (v ? <span className="tnum text-[12.5px]">{fmtDate(v)}</span> : <span className="text-ink-400">—</span>)
const n = (v: number) => <span className="tnum">{num(v)}</span>
const variance = (t: D2cListItem) => {
  if (!t.totals.received && !t.invoices.inwardPos) return <span className="text-ink-400">—</span>
  const v = t.totals.received - t.totals.dispatched
  return (
    <span className={`tnum inline-flex items-center gap-1.5 ${v ? 'font-semibold text-crit' : ''}`}>
      {t.invoices.varianceOpen > 0 && <span title="Variance without a reason" className="size-2 rounded-full bg-warn" />}
      {v > 0 ? `+${num(v)}` : num(v)}
    </span>
  )
}
/** Not created / Requested / Checking in Uniware / Failed: reason / Not found in Uniware (after 24 h) / Created. */
const soStatus = (t: D2cListItem) => {
  if (!t.soState) return <span className="text-ink-400">{D2C_SO_NOT_CREATED}</span>
  if (t.soNotFound) return <span className="font-semibold text-crit" title={t.soError ?? undefined}>{D2C_SO_NOT_FOUND}</span>
  const label = D2C_SO_STATE_LABEL[t.soState] ?? t.soState
  const failed = t.soState === D2C_SO_STATE.FAILED
  const tone = failed ? 'text-crit' : t.soState === D2C_SO_STATE.CREATED ? 'text-ok' : 'text-warn'
  return (
    <span className={`inline-block max-w-[280px] truncate align-bottom ${tone}`} title={t.soError ?? undefined}>
      {failed && t.soError ? `${label}: ${t.soError}` : label}{t.soCode && !failed ? <span className="font-mono text-ink-600"> · {t.soCode}</span> : null}
    </span>
  )
}

const C = {
  ref: { label: 'Reference ID', render: (t) => mono(t.reference) },
  date: { label: 'Date', render: (t) => day(t.poDate) },
  dispatchDate: { label: 'Dispatch date', render: (t) => day(t.dispatchDate) },
  sender: { label: 'Dispatch WH', render: (t) => mono(t.sender.code) },
  receiving: { label: 'Receiving WH', render: (t) => mono(t.receiving.code) },
  skus: { label: 'SKUs', render: (t) => n(t.totals.skus), right: true },
  totalQty: { label: 'Total qty', render: (t) => n(t.totals.updatedQty), right: true },
  dispatched: { label: 'Dispatched qty', render: (t) => n(t.totals.dispatched), right: true },
  received: { label: 'Received', render: (t) => n(t.totals.received), right: true },
  variance: { label: 'Variance', render: variance, right: true },
  so: { label: 'Uniware SO', render: (t) => mono(t.soCode) },
  invoice: { label: 'Invoice no', render: (t) => mono(t.invoiceNo) },
  inwardPo: { label: 'Inward PO', render: (t) => mono(t.inwardPo) },
  priority: { label: 'Priority', render: (t) => <PriorityBadge p={t.priority} /> },
  soStatus: { label: 'SO status', render: soStatus },
  status: { label: 'Status', render: (t) => <span className="inline-flex items-center gap-1"><StageBadge stage={t.stage} /><PartlyBadge t={t} /></span> },
  source: { label: 'Source', render: (t) => (t.source ? D2C_SOURCE_LABEL[t.source] ?? t.source : '—') },
  updated: { label: 'Updated', render: (t) => <span className="tnum text-[12.5px] text-ink-600">{fmtDateTime(t.updatedAt)}</span> },
} satisfies Record<string, Col>

/** Columns per sub-tab (PRD table; Draft's "SO CSV" is "SO status" now: plan 9.1). Transfer ID comes first always. */
const COLUMNS: Record<D2cTab, Col[]> = {
  [D2C_TAB.DRAFT]: [C.ref, C.date, C.sender, C.receiving, C.skus, C.totalQty, C.priority, C.soStatus, C.source, C.updated],
  [D2C_TAB.SALE_ORDERS]: [C.ref, C.date, C.sender, C.receiving, C.skus, C.totalQty, C.so, C.invoice, C.priority, C.status, C.updated],
  [D2C_TAB.CREATE_INWARD_PO]: [C.ref, C.dispatchDate, C.sender, C.receiving, C.skus, C.dispatched, C.so, C.invoice, C.priority, C.updated],
  [D2C_TAB.INWARD_POS]: [C.inwardPo, C.receiving, C.sender, C.invoice, C.skus, C.dispatched, C.received, C.priority, C.variance, C.status, C.updated],
  [D2C_TAB.OVERVIEW]: [C.ref, C.date, C.sender, C.receiving, C.skus, C.totalQty, C.so, C.invoice, C.inwardPo, C.received, C.priority, C.variance, C.status, C.updated],
}

export type RowAction = { label: string; onClick: () => void; danger?: boolean }

/** Row selection (Draft tab, editors): which rows can be picked, which are, and the change. */
export type Selection = { can: (t: D2cListItem) => boolean; selected: ReadonlySet<string>; onChange: (uids: string[], on: boolean) => void }

export function TransferTable({ tab, rows, onOpen, actions, flash, maxHeight, selection }: {
  tab: D2cTab; rows: D2cListItem[]; onOpen: (t: D2cListItem) => void; actions: (t: D2cListItem, toggle: () => void, open: boolean) => RowAction[]
  flash: Record<string, number>; maxHeight: string; selection?: Selection
}) {
  const [open, setOpen] = useState<Set<string>>(new Set())
  const toggle = (uid: string) => setOpen((s) => { const x = new Set(s); if (x.has(uid)) x.delete(uid); else x.add(uid); return x })
  const cols = COLUMNS[tab]
  const th = 'sticky top-0 z-10 whitespace-nowrap border-b border-line bg-alt px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600'
  const td = 'whitespace-nowrap border-b border-line px-3 py-2.5 transition-colors duration-200 group-hover:bg-canvas'
  const pickable = selection ? rows.filter((t) => selection.can(t)).map((t) => t.uid) : []
  const allPicked = pickable.length > 0 && pickable.every((u) => selection?.selected.has(u))
  const extra = selection ? 1 : 0
  // sticky columns: [checkbox 32px] + chevron 36px + Transfer ID
  const [chevLeft, idLeft] = selection ? ['left-8', 'left-[68px]'] : ['left-0', 'left-9']
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
              <th className={`${th} ${chevLeft} z-20 w-9`} aria-label="Show SKUs" />
              <th className={`${th} ${idLeft} z-20`}>Transfer ID</th>
              {cols.map((c) => <th key={c.label} className={`${th} ${c.right ? 'text-right' : ''}`}>{c.label}</th>)}
              <th className={`${th} right-0 z-20 border-l`}>Action</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr><td colSpan={cols.length + 3 + extra} className="px-4 py-14 text-center text-[13px] text-ink-400">No transfers match the current tab, search & filters.</td></tr>
            )}
            {rows.map((t) => {
              const isOpen = open.has(t.uid)
              return (
                <Fragment key={t.uid}>
                  <tr onDoubleClick={() => onOpen(t)} className={`group ${flash[t.uid] ? 'pf-row-flash' : ''}`}>
                    {selection && (
                      <td className={`${td} sticky left-0 z-[5] w-8 bg-surface px-2`}>
                        {selection.can(t) && <input type="checkbox" aria-label={`Select ${t.transferCode}`} checked={selection.selected.has(t.uid)} onChange={(e) => selection.onChange([t.uid], e.target.checked)} className="size-3.5 accent-[var(--color-primary)]" />}
                      </td>
                    )}
                    <td className={`${td} sticky ${chevLeft} z-[5] w-9 bg-surface px-2`}>
                      <button onClick={() => toggle(t.uid)} aria-label={isOpen ? 'Hide SKUs' : 'Show SKUs'} title={isOpen ? 'Hide SKUs' : 'Show SKUs'}
                        className="rounded p-1 text-ink-400 hover:bg-alt hover:text-ink-900">
                        <ChevronRight className={`size-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`} />
                      </button>
                    </td>
                    <td className={`${td} sticky ${idLeft} z-[5] bg-surface`}>
                      <div className="flex items-center gap-1.5">
                        <button onClick={() => onOpen(t)} className="font-mono text-[12.5px] font-semibold text-primary hover:underline">{t.transferCode}</button>
                        {t.expired && <ExpiredBadge />}
                        {tab !== D2C_TAB.SALE_ORDERS && tab !== D2C_TAB.INWARD_POS && tab !== D2C_TAB.OVERVIEW && <PartlyBadge t={t} />}
                      </div>
                    </td>
                    {cols.map((c) => <td key={c.label} className={`${td} ${c.right ? 'text-right' : ''}`}>{c.render(t)}</td>)}
                    <td className={`${td} sticky right-0 z-[5] border-l bg-surface px-2 py-1.5`}>
                      <div className="flex items-center gap-0.5">
                        <button title="View details" aria-label="View details" onClick={() => onOpen(t)} className="pf-press rounded-md p-1.5 text-ink-600 hover:bg-alt hover:text-ink-900"><Eye className="size-3.5" /></button>
                        <Menu items={() => actions(t, () => toggle(t.uid), isOpen)} />
                      </div>
                    </td>
                  </tr>
                  {isOpen && (
                    <tr>
                      <td colSpan={cols.length + 3 + extra} className="border-b border-line bg-canvas/60 px-4 py-3"><SkuLines uid={t.uid} /></td>
                    </tr>
                  )}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

/** The SKU lines of a transfer under its row. */
function SkuLines({ uid }: { uid: string }) {
  const q = useQuery({ queryKey: [D2C_KEY, 'detail', uid], queryFn: ({ signal }) => getTransfer(uid, signal) })
  if (q.isPending) return <div className="text-[12.5px] text-ink-400">Loading SKU lines…</div>
  if (q.error) return <div className="text-[12.5px] text-crit">Could not load the SKU lines: {q.error.message}</div>
  const lines = q.data.lines.filter((l) => !l.removed)
  const c = 'px-3 py-1.5'
  return (
    <table className="text-[12.5px]">
      <thead>
        <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">
          <th className={c}>#</th><th className={c}>SKU code</th><th className={c}>SKU name</th><th className={`${c} text-right`}>Qty</th>
          <th className={`${c} text-right`}>Dispatched</th><th className={`${c} text-right`}>Received</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={l.id} className="border-t border-line">
            <td className={`${c} text-ink-400`}>{l.srNo ?? i + 1}</td>
            <td className={`${c} font-mono`}>{l.skuCode}</td>
            <td className={`${c} max-w-[360px] truncate`}>{l.skuName}</td>
            <td className={`${c} tnum text-right`}>{num(l.updatedQty)}</td>
            <td className={`${c} tnum text-right`}>{num(l.dispatched)}</td>
            <td className={`${c} tnum text-right`}>{num(l.received)}</td>
          </tr>
        ))}
        {!lines.length && <tr><td colSpan={6} className={`${c} text-ink-400`}>No open SKU lines</td></tr>}
      </tbody>
    </table>
  )
}

const MENU_W = 184
const MENU_ITEM_PX = 32
const MENU_MS = 150

/** The ⋯ menu: drawn above the page (portal), so the table's scroll area never cuts it; upward when no room below. */
function Menu({ items }: { items: () => RowAction[] }) {
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null)
  const [leaving, setLeaving] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const list = pos ? items() : []
  const close = (now = false) => {
    if (!pos) return
    if (now) { setPos(null); setLeaving(false); return }
    setLeaving(true)
    setTimeout(() => { setPos(null); setLeaving(false) }, MENU_MS)
  }
  const show = () => {
    const r = btn.current!.getBoundingClientRect()
    const h = items().length * MENU_ITEM_PX + 10
    const up = r.bottom + h + 8 > window.innerHeight && r.top - h - 8 > 0
    setPos({ top: up ? r.top - h - 4 : r.bottom + 4, left: Math.max(8, r.right - MENU_W) })
  }
  useEffect(() => {
    if (!pos) return
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !btn.current?.contains(t)) close() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close() }
    const onMove = () => close(true)
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('scroll', onMove, true)
    window.addEventListener('resize', onMove)
    return () => {
      document.removeEventListener('mousedown', onDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('scroll', onMove, true)
      window.removeEventListener('resize', onMove)
    }
  })
  return (
    <>
      <button ref={btn} aria-label="Row actions" aria-expanded={!!pos} onClick={() => (pos ? close() : show())}
        className={`pf-press rounded-md p-1.5 transition-colors hover:bg-alt hover:text-ink-900 ${pos && !leaving ? 'bg-alt text-ink-900' : 'text-ink-600'}`}>
        <MoreHorizontal className="size-4" />
      </button>
      {pos && createPortal(
        <div ref={box} role="menu" style={{ top: pos.top, left: pos.left, width: MENU_W }}
          className={`fixed z-[100] rounded-[var(--radius)] border border-line bg-surface p-1 shadow-lg ${leaving ? 'pf-pop-out' : 'pf-pop-in'}`}>
          {list.map((m) => (
            <button key={m.label} role="menuitem" onClick={() => { close(); m.onClick() }}
              className={`pf-press block h-8 w-full rounded px-2.5 text-left text-[13px] hover:bg-alt ${m.danger ? 'text-crit' : 'text-ink-900'}`}>{m.label}</button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}
