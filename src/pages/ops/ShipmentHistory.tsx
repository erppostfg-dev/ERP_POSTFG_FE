import { useMemo } from 'react'
import { ArrowRight, Bot, History, Lock, MessageSquareText } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { Button, Drawer } from '../../components/ui'
import { getHistory, type HistoryItem } from '../../api/poOverview'
import { LOG_ACTION_LABEL, LOG_SOURCE_LABEL } from '../../constants/poOverview'
import { TEAM_LABEL } from '../../constants/auth'
import { fmtDate } from '../../lib/ops'

/*
 * A shipment's history (2026-10-14, user: "who did what and when in a proper format"): GET /shipments/:uid/history,
 * every team's changes (planning, warehouse, logistics, accounts, pipeline...), whatever tab it is opened from;
 * one entry per save (the rows of a save share a batch id), grouped by day, newest first. Each entry: who, when (time +
 * "x min ago"), what kind (created / updated / ...), where from (screen, pipeline, review...), every field old -> new,
 * and the remark. Shared by the row's History button and the bottom of the row drawer; it refreshes after every save
 * and live change (same query key that liveShipments invalidates).
 */

type Entry = { key: string; at: string; by: string | null; byEmail: string | null; byTeam: string | null; action: string; source: string; remark: string | null; changes: HistoryItem[]
  /** The value of an action row (no field), e.g. what a master row was added with. */
  note: string | null; first: HistoryItem }

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

/** One entry per save: consecutive rows with the same batch id are merged (rows without one stay alone). */
const toEntries = (items: HistoryItem[]): Entry[] => {
  const out: Entry[] = []
  for (const h of items) {
    const last = out[out.length - 1]
    if (last && h.batchId && last.key === h.batchId) {
      if (h.field) last.changes.push(h)
      if (!last.remark && h.remark) last.remark = h.remark
      if (!h.field && !last.note && h.newValue) last.note = h.newValue
      continue
    }
    out.push({ key: h.batchId ?? h.id, at: h.at, by: h.by, byEmail: h.byEmail, byTeam: h.byTeam, action: h.action, source: h.source, remark: h.remark, changes: h.field ? [h] : [],
      note: h.field ? null : h.newValue, first: h })
  }
  return out
}

const localDay = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const dayLabel = (iso: string) => {
  const day = localDay(new Date(iso))
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (day === localDay(today)) return 'Today'
  if (day === localDay(yesterday)) return 'Yesterday'
  return fmtDate(day)
}
const timeOf = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
const ago = (iso: string) => {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min} min ago`
  const h = Math.round(min / 60)
  if (h < 24) return `${h} h ago`
  const d = Math.round(h / 24)
  return `${d} day${d === 1 ? '' : 's'} ago`
}
const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('')

/** A logged value as people read it: dates DD-MM-YYYY, empty shown as "empty". */
function Value({ v, old }: { v: string | null; old?: boolean }) {
  if (v === null || v === '') return <span className="italic text-ink-400">empty</span>
  const shown = ISO_DATE.test(v) ? fmtDate(v) : v
  return <span className={old ? 'text-ink-600 line-through decoration-ink-400' : 'font-medium text-ink-900'}>{shown}</span>
}

/** Labels and extras of a timeline (2026-10-28: shared with the Masters history; PO Overview keeps its defaults). */
export type TimelineOptions = {
  actionLabel?: Record<string, string>
  sourceLabel?: Record<string, string>
  /** Show the value of action rows (no field) under the entry. */
  notes?: boolean
  /** A chip naming what the entry is about (e.g. the master row in a list of every master's changes). */
  tagOf?: (h: HistoryItem) => string | null
}

function EntryCard({ e, labelOf, o }: { e: Entry; labelOf: (field: string) => string; o: TimelineOptions }) {
  const person = e.by
  const actionLabel = o.actionLabel ?? LOG_ACTION_LABEL
  const sourceLabel = o.sourceLabel ?? LOG_SOURCE_LABEL
  const tag = o.tagOf?.(e.first)
  const what = e.action === 'field_changed' && e.changes.length
    ? `Updated ${e.changes.length} field${e.changes.length === 1 ? '' : 's'}`
    : (actionLabel[e.action] ?? e.action.replace(/_/g, ' '))
  return (
    <li className="relative pb-4 pl-10 last:pb-1">
      {/* the line of the timeline + the avatar on it */}
      <span className="absolute bottom-0 left-[15px] top-8 w-px bg-line" aria-hidden />
      <span className={`absolute left-0 top-0 flex size-8 items-center justify-center rounded-full text-[11px] font-semibold ${person ? 'bg-primary-soft text-primary' : 'bg-alt text-ink-600'}`}>
        {person ? initials(person) : <Bot className="size-4" />}
      </span>
      <div className="rounded-[var(--radius)] border border-line bg-surface">
        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5 px-3 pt-2">
          <span className="text-[13px] font-semibold text-ink-900" title={e.byEmail ?? undefined}>{person ?? 'System'}</span>
          {e.byTeam && <span className="rounded-full bg-primary-soft px-2 py-0.5 text-[10.5px] font-semibold text-primary">{TEAM_LABEL[e.byTeam] ?? e.byTeam}</span>}
          <span className="text-[12.5px] text-ink-600">{what}</span>
          <span className="ml-auto whitespace-nowrap text-[11.5px] text-ink-400" title={new Date(e.at).toLocaleString()}>{timeOf(e.at)} · {ago(e.at)}</span>
        </div>
        <div className="px-3 pb-2 pt-0.5">
          <span className="inline-block rounded-full bg-alt px-2 py-0.5 text-[10.5px] font-medium uppercase tracking-wide text-ink-600">{sourceLabel[e.source] ?? e.source}</span>
          {tag && <span className="ml-1.5 inline-block rounded-full bg-primary-soft px-2 py-0.5 font-mono text-[10.5px] font-medium text-primary">{tag}</span>}
        </div>
        {o.notes && e.note && <div className="border-t border-line px-3 py-1.5 text-[12.5px] text-ink-600 [overflow-wrap:anywhere]">{e.note}</div>}
        {e.changes.length > 0 && (
          <table className="w-full border-t border-line text-[12.5px]">
            <tbody>
              {e.changes.map((c) => (
                <tr key={c.id} className="border-b border-line last:border-b-0">
                  <td className="w-[38%] px-3 py-1.5 align-top text-ink-600">{labelOf(c.field!)}</td>
                  <td className="px-3 py-1.5">
                    {c.valueHidden
                      ? <span className="inline-flex items-center gap-1 text-ink-400"><Lock className="size-3" />Values hidden for your team</span>
                      : <span className="inline-flex flex-wrap items-center gap-1.5"><Value v={c.oldValue} old /><ArrowRight className="size-3 shrink-0 text-ink-400" /><Value v={c.newValue} /></span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {e.remark && (
          <div className="flex items-start gap-1.5 border-t border-line bg-canvas px-3 py-1.5 text-[12.5px] text-ink-600">
            <MessageSquareText className="mt-0.5 size-3.5 shrink-0" /><span>{e.remark}</span>
          </div>
        )}
      </div>
    </li>
  )
}

/** The history of one shipment as a timeline (newest first, grouped by day). */
export function HistoryTimeline({ uid, labelOf }: { uid: string; labelOf: (field: string) => string }) {
  const q = useQuery({ queryKey: ['po-overview', 'history', uid], queryFn: ({ signal }) => getHistory(uid, signal) })
  return <Timeline items={q.data} pending={q.isPending} error={q.isError} onRetry={() => void q.refetch()} labelOf={labelOf} empty="Nothing recorded for this shipment yet." />
}

/** Any history list as the timeline (newest first, one entry per save, grouped by day). */
export function Timeline({ items, pending, error, onRetry, labelOf, empty, options = {} }: {
  items: HistoryItem[] | undefined; pending: boolean; error: boolean; onRetry: () => void; labelOf: (field: string) => string; empty: string; options?: TimelineOptions
}) {
  const days = useMemo(() => {
    const out: { day: string; entries: Entry[] }[] = []
    for (const e of toEntries(items ?? [])) {
      const day = dayLabel(e.at)
      if (out[out.length - 1]?.day === day) out[out.length - 1]!.entries.push(e)
      else out.push({ day, entries: [e] })
    }
    return out
  }, [items])

  if (pending) return <p className="px-2 py-3 text-[12.5px] text-ink-400">Loading history…</p>
  if (error) return (
    <div className="px-2 py-3 text-[12.5px] text-crit">Could not load the history. <button onClick={onRetry} className="font-semibold underline">Try again</button></div>
  )
  if (!days.length) return <p className="px-2 py-3 text-[12.5px] text-ink-400">{empty}</p>
  return (
    <div className="space-y-3">
      {days.map((d) => (
        <section key={d.day}>
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{d.day}</div>
          <ol>{d.entries.map((e) => <EntryCard key={e.key} e={e} labelOf={labelOf} o={options} />)}</ol>
        </section>
      ))}
    </div>
  )
}

/** The History button's drawer: the timeline only, with a way on to the row's details. */
export function HistoryDrawer({ row, labelOf, onClose, onOpenRow }: {
  row: Record<string, unknown>; labelOf: (field: string) => string; onClose: () => void; onOpenRow: () => void
}) {
  const uid = String(row.uid)
  return (
    <Drawer open onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><History className="size-4 text-ink-600" />History · <span className="font-mono">{String(row.poNumber ?? '')}</span></span>}
      sub={`UID ${uid} · ${String(row.channel ?? '')} · ${String(row.location ?? '')}`}
      footer={(close) => <><Button onClick={close}>Close</Button><Button variant="primary" onClick={onOpenRow}>Open row</Button></>}>
      <HistoryTimeline uid={uid} labelOf={labelOf} />
    </Drawer>
  )
}
