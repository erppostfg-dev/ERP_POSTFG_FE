import type { ReactNode } from 'react'
import { ArrowRight, CalendarClock, Check, Circle, MessageSquarePlus, Pencil, Scissors, Send, XCircle } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Badge, Button, Drawer } from '../../../components/ui'
import { getTransfer, type D2cDetail, type D2cInvoice, type D2cTimelineItem } from '../../../api/d2cTransfers'
import {
  D2C_ACTION_LABEL, D2C_FIELD_LABEL, D2C_PROGRESS, D2C_PROGRESS_BY, D2C_SO_NOT_CREATED, D2C_SO_NOT_FOUND, D2C_SO_STATE, D2C_SO_STATE_LABEL, D2C_SOURCE_LABEL,
  D2C_INWARD_CANCELLED, D2C_INWARD_STATE_LABEL, D2C_PACKAGE_TONE, D2C_PO_STATUS_TONE, D2C_STAGE, D2C_STAGE_ACTION, D2C_STAGE_LABEL, D2C_TEXT, D2C_VARIANCE_REASON_LABEL,
} from '../../../constants/d2cTransfers'
import { D2C_KEY } from '../../../lib/liveTransfers'
import { fmtDate } from '../../../lib/ops'
import { ExpiredBadge, PartlyBadge, PriorityBadge, StageBadge } from './bits'
import { fmtDateTime, money, num } from './format'

/*
 * One transfer (GET /d2c-transfers/:id; PRD "Detail drawer", plan 9.2): header (ID, stage, route, priority, date,
 * reference, expiry + Change expiry), the 8-stage progress with time / user / source tag from the timeline, documents
 * (SO / invoice / inward PO / GRN: empty until the Uniware phases), SKU lines with Ordered / Dispatched / Received / Var.
 * and totals, and the full history. Actions: Edit + Cancel (a draft), Change expiry; phase 5: Create SO in Uniware (a
 * draft), Cancel (an SO before dispatch: its lines are cancelled in Uniware), Close short (an SO with units open). The
 * SO code and Uniware's last reported status (from the history) are under Documents. Phase 6 (Uniware sync): RTS and
 * dispatch dates, the invoices list (one row per Uniware package: invoice no, date, package status, dispatched at,
 * units), the last sync time and a sync error. Phase 7: per invoice its inward PO (code, request state, Uniware PO
 * status), GRNs, received, variance and reason, with "Add variance reason" once its GRN is complete with a variance.
 */

const reachedBy = (stage: string, timeline: D2cTimelineItem[]) =>
  timeline.find((e) => (e.action === 'stage_changed' && e.newValue === stage) || e.action === D2C_STAGE_ACTION[stage])

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between"><h3 className="text-[11px] font-semibold uppercase tracking-wide text-ink-400">{title}</h3>{right}</div>
      {children}
    </section>
  )
}
function Item({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] text-ink-400">{label}</div>
      <div className="truncate text-[13px] text-ink-900">{children}</div>
    </div>
  )
}
const muted = (t: string) => <span className="text-ink-400">{t}</span>

/** Uniware's last reported status of the SO (logged with each SO action / sync). */
const uniwareStatusOf = (timeline: D2cTimelineItem[]) => [...timeline].reverse().find((e) => e.uniwareStatus)?.uniwareStatus ?? null

/** Not created / Requested / Checking / Failed: reason / Not found in Uniware / Created. */
function SoState({ d }: { d: D2cDetail }) {
  if (!d.soState) return muted(D2C_SO_NOT_CREATED)
  if (d.soNotFound) return <span className="font-semibold text-crit" title={d.soError ?? undefined}>{D2C_SO_NOT_FOUND}</span>
  const label = D2C_SO_STATE_LABEL[d.soState] ?? d.soState
  if (d.soState === D2C_SO_STATE.FAILED) return <span className="whitespace-normal text-crit">{label}{d.soError ? `: ${d.soError}` : ''}</span>
  return <span className={d.soState === D2C_SO_STATE.CREATED ? 'text-ok' : 'text-warn'} title={d.soError ?? undefined}>{label}</span>
}

export function TransferDrawer({ uid, editor, onClose, onEdit, onCancel, onExpiry, onCreateSo, onCloseShort, onVariance }: {
  uid: string; editor: boolean; onClose: () => void; onEdit: (d: D2cDetail) => void; onCancel: (d: D2cDetail) => void; onExpiry: (d: D2cDetail) => void
  onCreateSo: (d: D2cDetail) => void; onCloseShort: (d: D2cDetail) => void; onVariance: (d: D2cDetail, i: D2cInvoice) => void
}) {
  const q = useQuery({ queryKey: [D2C_KEY, 'detail', uid], queryFn: ({ signal }) => getTransfer(uid, signal) })
  const d = q.data
  return (
    <Drawer open wide onClose={onClose} title={d ? <span className="font-mono">{d.transferCode}</span> : 'Transfer'}
      sub={d && <span className="inline-flex flex-wrap items-center gap-1.5"><StageBadge stage={d.stage} /><PartlyBadge t={d} /><PriorityBadge p={d.priority} />{d.expired && <ExpiredBadge />}<span>· {d.type}</span></span>}
      footer={(close) => <>
        <Button onClick={close}>Close</Button>
        {d && editor && d.can.cancel && <Button icon={<XCircle className="size-3.5" />} onClick={() => onCancel(d)}>Cancel transfer</Button>}
        {d && editor && d.can.closeShort && <Button icon={<Scissors className="size-3.5" />} onClick={() => onCloseShort(d)}>Close short</Button>}
        {d && editor && d.can.edit && <Button icon={<Pencil className="size-3.5" />} onClick={() => onEdit(d)}>Edit</Button>}
        {d && editor && d.can.createSo && <Button variant="primary" icon={<Send className="size-3.5" />} onClick={() => onCreateSo(d)}>Create SO in Uniware</Button>}
      </>}>
      {q.isPending && <div className="text-[13px] text-ink-400">Loading…</div>}
      {q.error && <div className="text-[13px] text-crit">Could not load the transfer: {q.error.message}</div>}
      {d && <Body d={d} editor={editor} onExpiry={() => onExpiry(d)} onVariance={(i) => onVariance(d, i)} />}
    </Drawer>
  )
}

/** Inward PO cell of an invoice: code + request state (+ refusal), Uniware PO status. */
function InwardPo({ i }: { i: D2cInvoice }) {
  if (!i.inwardPoState) return i.dispatchedAt ? muted('Not created') : muted('—')
  const state = i.inwardPoState === 'failed' && i.inwardPoStatus === 'CANCELLED' ? D2C_INWARD_CANCELLED : D2C_INWARD_STATE_LABEL[i.inwardPoState] ?? i.inwardPoState
  return (
    <div className="space-y-0.5">
      {i.inwardPoCode && <div className="font-mono">{i.inwardPoCode}</div>}
      {i.inwardPoState !== 'created' && <div className={`whitespace-normal ${i.inwardPoState === 'failed' ? 'text-crit' : 'text-warn'}`}>{state}{i.inwardPoError ? `: ${i.inwardPoError}` : ''}</div>}
      {i.inwardPoStatus && <span title={i.inwardPoStatus === 'CREATED' ? D2C_TEXT.PO_APPROVAL : undefined}><Badge tone={D2C_PO_STATUS_TONE[i.inwardPoStatus] ?? 'neutral'}>{i.inwardPoStatus}</Badge></span>}
    </div>
  )
}

function Body({ d, editor, onExpiry, onVariance }: { d: D2cDetail; editor: boolean; onExpiry: () => void; onVariance: (i: D2cInvoice) => void }) {
  const cancelled = d.stage === D2C_STAGE.CANCELLED
  const at = D2C_PROGRESS.indexOf(d.stage === D2C_STAGE.PARTLY_DISPATCHED ? D2C_STAGE.INVOICED : d.stage === D2C_STAGE.CLOSED ? D2C_STAGE.GRN : d.stage ?? '')
  const lines = d.lines
  const tot = lines.reduce((s, l) => ({ qty: s.qty + l.updatedQty, dispatched: s.dispatched + l.dispatched, received: s.received + l.received }), { qty: 0, dispatched: 0, received: 0 })
  const cancelEvent = d.timeline.find((e) => e.action === 'cancelled')
  const created = d.timeline.find((e) => e.action === 'created')
  const invoices = d.invoices
  return (
    <div className="space-y-6">
      {d.expired && (
        <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius)] border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
          <span className="flex-1">{D2C_TEXT.EXPIRED_PROMPT}</span>
          {editor && d.can.changeExpiry && <Button onClick={onExpiry} icon={<CalendarClock className="size-3.5" />}>Extend expiry</Button>}
        </div>
      )}
      {d.editBlockedBecause && d.stage === D2C_STAGE.DRAFT && <div className="text-[12px] text-ink-600">Not editable now: {d.editBlockedBecause}</div>}

      <div className="flex flex-wrap items-center gap-2 rounded-[var(--radius-card)] border border-line bg-canvas px-4 py-3 text-[14px]">
        <span className="font-mono font-semibold">{d.sender.code ?? '—'}</span>
        <ArrowRight className="size-4 text-ink-400" />
        <span className="font-mono font-semibold">{d.receiving.code ?? '—'}</span>
        <span className="text-[12px] text-ink-600">· {d.channel} / {d.location}</span>
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        <Item label="Reference ID"><span className="font-mono">{d.reference ?? '—'}</span></Item>
        <Item label="PO date">{fmtDate(d.poDate)}</Item>
        <Item label="PO expiry">
          <span className="inline-flex items-center gap-2">
            <span className={d.expired ? 'font-semibold text-warn' : ''}>{fmtDate(d.expiryDate)}</span>
            {editor && d.can.changeExpiry && <button onClick={onExpiry} className="text-[12px] font-semibold text-primary hover:underline">Change expiry</button>}
          </span>
        </Item>
        <Item label="Priority"><PriorityBadge p={d.priority} /></Item>
        <Item label="Type">{d.type ?? '—'}</Item>
        <Item label="Source">{d.source ? D2C_SOURCE_LABEL[d.source] ?? d.source : '—'}{d.group ? ` · group ${d.group}` : ''}</Item>
        <Item label="Sale order"><SoState d={d} /></Item>
        <Item label="GMV / PO value">{money(d.totals.updatedGmv)} / {money(d.totals.updatedPoValue)}</Item>
        <Item label="Remarks">{d.remarks || muted('—')}</Item>
      </div>

      <Section title="Progress">
        <ol className="relative space-y-0">
          {D2C_PROGRESS.map((stage, i) => {
            const ev = reachedBy(stage, d.timeline)
            const done = !cancelled ? i <= at : !!ev
            const current = !cancelled && i === at
            return (
              <li key={stage} className="relative flex gap-3 pb-3 last:pb-0">
                {i < D2C_PROGRESS.length - 1 && <span className={`absolute left-[9px] top-5 h-[calc(100%-12px)] w-px ${done && i < at ? 'bg-primary' : 'bg-line'}`} />}
                <span className={`relative z-[1] mt-0.5 grid size-[19px] shrink-0 place-items-center rounded-full ${done ? 'bg-primary text-white' : 'border border-line bg-surface text-ink-400'} ${current ? 'ring-4 ring-primary/15' : ''}`}>
                  {done ? <Check className="size-3" /> : <Circle className="size-2" />}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2 text-[13px]">
                    <span className={done ? 'font-semibold text-ink-900' : 'text-ink-600'}>{i + 1}. {D2C_STAGE_LABEL[stage]}</span>
                    <span className="rounded bg-alt px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-ink-600">{ev?.tag ?? D2C_PROGRESS_BY[stage]}</span>
                    {current && d.stage === D2C_STAGE.PARTLY_DISPATCHED && <PartlyBadge t={d} />}
                  </div>
                  <div className="text-[12px] text-ink-600">
                    {ev ? <>{fmtDateTime(ev.at)}{ev.by && ` · ${ev.by}`}</> : done && stage === D2C_STAGE.DRAFT ? fmtDateTime(d.createdAt) : muted(stage === D2C_STAGE.DRAFT ? '—' : 'Not yet')}
                  </div>
                </div>
              </li>
            )
          })}
          {cancelled && (
            <li className="flex gap-3">
              <span className="grid size-[19px] shrink-0 place-items-center rounded-full bg-crit text-white"><XCircle className="size-3" /></span>
              <div className="text-[13px]">
                <span className="font-semibold text-crit">Cancelled</span>
                <div className="text-[12px] text-ink-600">{cancelEvent ? <>{fmtDateTime(cancelEvent.at)}{cancelEvent.by && ` · ${cancelEvent.by}`}{cancelEvent.remark && ` · “${cancelEvent.remark}”`}</> : fmtDateTime(d.stageAt)}</div>
              </div>
            </li>
          )}
        </ol>
      </Section>

      <Section title="Documents">
        <div className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
          <Item label="Uniware channel">{(d.route?.uniwareChannelCode ?? d.uniwareChannel) ? <span className="font-mono">{d.route?.uniwareChannelCode ?? d.uniwareChannel}</span> : muted('Not set on the route')}</Item>
          <Item label="Uniware SO">{d.soCode ? <span className="font-mono">{d.soCode}</span> : muted('After the sale order is created')}</Item>
          <Item label="Uniware status">{uniwareStatusOf(d.timeline) ?? muted(d.soCode ? 'Not read yet' : '—')}</Item>
          <Item label="Invoice no.">{invoices.length ? invoices.map((i) => i.invoiceDisplayCode ?? i.invoiceCode).join(', ') : d.invoiceNo ?? muted('From Uniware')}</Item>
          <Item label="RTS date">{d.rtsDate ? fmtDate(d.rtsDate) : muted('From Uniware')}</Item>
          <Item label="Dispatch date">{d.dispatchDate ? fmtDate(d.dispatchDate) : muted('From Uniware')}</Item>
          <Item label="Inward PO">{invoices.some((i) => i.inwardPoCode) ? invoices.map((i) => i.inwardPoCode).filter(Boolean).join(', ') : d.inwardPo ?? muted('After dispatch')}</Item>
          <Item label="GRN no.">{invoices.some((i) => i.grnCodes?.length) ? invoices.flatMap((i) => (i.grnCodes ?? []).map((g) => g.code)).join(', ') : muted('From Uniware')}</Item>
          <Item label="GRN date">{d.grnDate ? fmtDate(d.grnDate) : muted('From Uniware')}</Item>
          <Item label="Created">{fmtDateTime(d.createdAt)}{created ? ` · ${created.tag}${created.by ? ` · ${created.by}` : ''}` : ''}</Item>
        </div>
      </Section>

      <Section title={`Invoices (${invoices.length})`} right={d.lastSyncedAt ? <span className="text-[11px] text-ink-400">Uniware read {fmtDateTime(d.lastSyncedAt)}</span> : undefined}>
        {d.syncError && <div className="rounded-[var(--radius)] border border-crit/30 bg-crit-soft px-3 py-2 text-[12px] text-crit">Last sync of this transfer failed: {d.syncError}</div>}
        {invoices.length ? (
          <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
            <table className="w-full text-[12.5px]">
              <thead className="bg-alt text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-600">
                <tr><th className="px-3 py-2">Invoice no.</th><th className="px-3 py-2">Invoice date</th><th className="px-3 py-2">Package</th><th className="px-3 py-2">Dispatched at</th><th className="px-3 py-2 text-right">Units</th>
                  <th className="px-3 py-2">Inward PO</th><th className="px-3 py-2">GRN</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Var.</th></tr>
              </thead>
              <tbody>
                {invoices.map((i) => (
                  <tr key={i.id} className="border-t border-line">
                    <td className="px-3 py-2 font-mono">{i.invoiceDisplayCode ?? i.invoiceCode ?? muted('Not invoiced yet')}</td>
                    <td className="px-3 py-2">{i.invoiceDate ? fmtDateTime(i.invoiceDate) : '—'}</td>
                    <td className="px-3 py-2"><div className="font-mono text-[11.5px] text-ink-600">{i.shippingPackageCode}</div>{i.packageStatus && <Badge tone={D2C_PACKAGE_TONE[i.packageStatus] ?? 'neutral'}>{i.packageStatus}</Badge>}</td>
                    <td className="px-3 py-2">{i.dispatchedAt ? fmtDateTime(i.dispatchedAt) : muted('Not yet')}</td>
                    <td className="tnum px-3 py-2 text-right">{num(i.units)}</td>
                    <td className="px-3 py-2"><InwardPo i={i} /></td>
                    <td className="px-3 py-2">
                      {i.grnCodes?.length
                        ? <><div className="font-mono">{i.grnCodes.map((g) => g.code).join(', ')}</div><div className="text-[11px] text-ink-600">{i.grnCompletedAt ? `Done ${fmtDateTime(i.grnCompletedAt)}` : D2C_TEXT.GRN_PENDING}</div></>
                        : muted(i.inwardPoState === 'created' ? 'None yet' : '—')}
                    </td>
                    <td className="tnum px-3 py-2 text-right">{i.grnCodes?.length ? num(i.receivedUnits) : '—'}</td>
                    <td className="px-3 py-2 text-right">
                      {i.grnCodes?.length ? <span className={`tnum ${i.variance ? 'font-semibold text-crit' : ''}`}>{i.variance > 0 ? `+${num(i.variance)}` : num(i.variance)}</span> : '—'}
                      {i.varianceReason && <div className="text-[11px] text-ink-600" title={i.varianceNote ?? undefined}>{D2C_VARIANCE_REASON_LABEL[i.varianceReason] ?? i.varianceReason}{i.varianceNote ? ` · ${i.varianceNote}` : ''}</div>}
                      {editor && i.canVarianceReason && (
                        <button onClick={() => onVariance(i)} className="mt-0.5 inline-flex items-center gap-1 text-[12px] font-semibold text-warn hover:underline"><MessageSquarePlus className="size-3" />{i.varianceReason ? 'Change variance reason' : 'Add variance reason'}</button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <div className="text-[12.5px] text-ink-400">{d.soCode ? D2C_TEXT.NO_INVOICES : 'After the sale order is created'}</div>}
      </Section>

      <Section title={`SKU lines (${lines.filter((l) => !l.removed).length})`}>
        <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
          <table className="w-full text-[12.5px]">
            <thead className="bg-alt text-left text-[10.5px] font-semibold uppercase tracking-wide text-ink-600">
              <tr><th className="px-3 py-2">SKU</th><th className="px-3 py-2 text-right">Ordered</th><th className="px-3 py-2 text-right">Dispatched</th><th className="px-3 py-2 text-right">Received</th><th className="px-3 py-2 text-right">Var.</th></tr>
            </thead>
            <tbody>
              {lines.map((l) => {
                const v = l.received - l.dispatched
                const shown = l.received > 0 || invoices.some((i) => i.grnCompletedAt)
                return (
                  <tr key={l.id} className={`border-t border-line ${l.removed ? 'text-ink-400 line-through' : ''}`}>
                    <td className="max-w-[360px] px-3 py-2"><div className="font-mono">{l.skuCode}</div><div className="truncate text-[11.5px] text-ink-600">{l.skuName}</div></td>
                    <td className="tnum px-3 py-2 text-right">{num(l.updatedQty)}{l.cancelled > 0 && !l.removed && <div className="text-[11px] text-ink-400">of {num(l.qty)}</div>}</td>
                    <td className="tnum px-3 py-2 text-right">{num(l.dispatched)}</td>
                    <td className="tnum px-3 py-2 text-right">{num(l.received)}</td>
                    <td className={`tnum px-3 py-2 text-right ${shown && v ? 'font-semibold text-crit' : ''}`}>{shown ? num(v) : '—'}</td>
                  </tr>
                )
              })}
            </tbody>
            <tfoot className="border-t border-line bg-canvas font-semibold">
              <tr>
                <td className="px-3 py-2">Total</td>
                <td className="tnum px-3 py-2 text-right">{num(tot.qty)}</td>
                <td className="tnum px-3 py-2 text-right">{num(tot.dispatched)}</td>
                <td className="tnum px-3 py-2 text-right">{num(tot.received)}</td>
                <td className={`tnum px-3 py-2 text-right ${tot.received && tot.received !== tot.dispatched ? 'text-crit' : ''}`}>{tot.received ? num(tot.received - tot.dispatched) : '—'}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Section>

      <Section title={`History (${d.timeline.length})`}>
        <ol className="space-y-2">
          {[...d.timeline].reverse().map((e) => (
            <li key={e.id} className="rounded-[var(--radius)] border border-line px-3 py-2 text-[12.5px]">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-semibold text-ink-900">{D2C_ACTION_LABEL[e.action] ?? e.action}</span>
                <Badge>{e.tag}</Badge>
                <span className="ml-auto text-[11.5px] text-ink-400">{fmtDateTime(e.at)}{e.by && ` · ${e.by}`}</span>
              </div>
              {(e.field || e.oldValue || e.newValue) && (
                <div className="mt-1 text-ink-600">
                  {e.field && <span className="mr-1">{D2C_FIELD_LABEL[e.field] ?? e.field}{e.action !== 'created' && e.remark && e.lineId ? ` (${e.remark})` : ''}:</span>}
                  {e.oldValue !== null && <><span className="line-through">{e.oldValue}</span> → </>}<span className="font-medium text-ink-900">{e.newValue ?? '—'}</span>
                </div>
              )}
              {e.remark && !e.lineId && e.action !== 'created' && <div className="mt-1 italic text-ink-600">“{e.remark}”</div>}
              {e.uniwareStatus && <div className="mt-1 text-[11.5px] text-ink-400">Uniware: {e.uniwareStatus}</div>}
            </li>
          ))}
        </ol>
      </Section>
    </div>
  )
}
