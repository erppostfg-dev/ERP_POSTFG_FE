import { useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Download, History } from 'lucide-react'
import { getMasterChanges, getMasterHistory, type MasterHistoryItem } from '../../api/masters'
import { HISTORY_TEXT, MASTER_HISTORY_DAYS, MASTER_LOG_ACTION_LABEL, MASTER_LOG_SOURCE_LABEL, MASTER_LOG_TYPE_LABEL, masterFieldLabel } from '../../constants/masters'
import { Timeline, type TimelineOptions } from '../ops/ShipmentHistory'
import { Button, Drawer } from '../../components/ui'
import { exportRowsExcel, inputCls } from '../../components/kit'
import type { ColKind } from '../../lib/ops'

/* Masters history drawers and the row action button, shared by the Masters tabs (pages/Masters.tsx) and Transfer Routes. */

export const IconBtn = ({ children, title, onClick, disabled }: { children: ReactNode; title: string; onClick?: () => void; disabled?: boolean }) => (
  <button title={title} onClick={onClick} disabled={disabled} className="rounded-md p-1.5 hover:bg-alt hover:text-ink-900 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent">{children}</button>
)

// ---- History (2026-10-28) -----------------------------------------------------------------------------------------
const HISTORY_OPTIONS: TimelineOptions = { actionLabel: MASTER_LOG_ACTION_LABEL, sourceLabel: MASTER_LOG_SOURCE_LABEL, notes: true }

/** One row's history: who added / changed it, when, old -> new, remark (Masters pages + In-transit uploads). */
export function RowHistoryDrawer({ type, row, title, sub, onClose }: { type: string; row: { rid?: string | number }; title: string; sub: string; onClose: () => void }) {
  const rid = String(row.rid)
  const q = useQuery({ queryKey: ['masters', 'history', type, rid], queryFn: ({ signal }) => getMasterHistory(type, rid, signal) })
  return (
    <Drawer open onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><History className="size-4 text-ink-600" />History · <span className="font-mono">{title}</span></span>}
      sub={sub} footer={(close) => <Button onClick={close}>Close</Button>}>
      <Timeline items={q.data} pending={q.isPending} error={q.isError} onRetry={() => void q.refetch()} labelOf={masterFieldLabel} empty={HISTORY_TEXT.EMPTY_ROW} options={HISTORY_OPTIONS} />
    </Drawer>
  )
}

type ChangeRow = Record<'at' | 'by' | 'master' | 'rowKey' | 'action' | 'field' | 'oldValue' | 'newValue' | 'remark' | 'source', string>
const CHANGE_COLS: [string, keyof ChangeRow, ColKind][] = [['When', 'at', 'text'], ['Who', 'by', 'text'], ['Master', 'master', 'text'], ['Row', 'rowKey', 'mono'],
  ['Action', 'action', 'text'], ['Field', 'field', 'text'], ['Old value', 'oldValue', 'text'], ['New value', 'newValue', 'text'], ['Remark', 'remark', 'text'], ['Source', 'source', 'text']]
const changeRow = (h: MasterHistoryItem): ChangeRow => ({
  at: new Date(h.at).toLocaleString(), by: h.byEmail ?? h.by ?? 'System', master: MASTER_LOG_TYPE_LABEL[h.type] ?? h.type, rowKey: h.rowKey,
  action: MASTER_LOG_ACTION_LABEL[h.action] ?? h.action, field: h.field ? masterFieldLabel(h.field) : '', oldValue: h.oldValue ?? '', newValue: h.newValue ?? '',
  remark: h.remark ?? '', source: MASTER_LOG_SOURCE_LABEL[h.source] ?? h.source,
})

/** Every master's changes of the last n days (filter by master), with an Excel download. */
export function RecentChangesDrawer({ initialType, onClose }: { initialType?: string; onClose: () => void }) {
  const [type, setType] = useState(initialType ?? '')
  const [days, setDays] = useState<number>(MASTER_HISTORY_DAYS[0])
  const q = useQuery({ queryKey: ['masters', 'changes', type, days], queryFn: ({ signal }) => getMasterChanges({ type: type || undefined, days }, signal) })
  const options = useMemo<TimelineOptions>(() => ({
    ...HISTORY_OPTIONS,
    tagOf: (h) => { const m = h as MasterHistoryItem; return `${MASTER_LOG_TYPE_LABEL[m.type] ?? m.type} · ${m.rowKey}` },
  }), [])
  return (
    <Drawer open wide onClose={onClose}
      title={<span className="inline-flex items-center gap-2"><History className="size-4 text-ink-600" />Recent changes · Masters</span>}
      sub="Who added or changed what on the Masters pages and the In-transit master uploads"
      footer={(close) => <>
        <Button icon={<Download className="size-3.5" />} disabled={!q.data?.length}
          onClick={() => exportRowsExcel(`masters-changes-${type || 'all'}-${days}d`, CHANGE_COLS, (q.data ?? []).map(changeRow))}>Excel</Button>
        <Button onClick={close}>Close</Button>
      </>}>
      <div className="mb-3 flex flex-wrap gap-2">
        <select value={type} onChange={(e) => setType(e.target.value)} className={`${inputCls} w-auto`}>
          <option value="">All masters</option>
          {Object.entries(MASTER_LOG_TYPE_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className={`${inputCls} w-auto`}>
          {MASTER_HISTORY_DAYS.map((d) => <option key={d} value={d}>Last {d} days</option>)}
        </select>
        {q.data && <span className="self-center text-[12px] text-ink-400">{q.data.length} change{q.data.length === 1 ? '' : 's'}</span>}
      </div>
      <Timeline items={q.data} pending={q.isPending} error={q.isError} onRetry={() => void q.refetch()} labelOf={masterFieldLabel} empty={HISTORY_TEXT.EMPTY_ALL} options={options} />
    </Drawer>
  )
}
