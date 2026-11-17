import { AlertTriangle } from 'lucide-react'
import { Badge } from '../../../components/ui'
import type { D2cListItem, D2cProblem } from '../../../api/d2cTransfers'
import { D2C_PRIORITY_TONE, D2C_STAGE, D2C_STAGE_LABEL, D2C_STAGE_TONE, D2C_TEXT } from '../../../constants/d2cTransfers'

/* Small pieces shared by the D2C Internal Transfers screens (2026-11-03). */

export function PriorityBadge({ p }: { p: string | null }) {
  if (!p) return <span className="text-ink-400">—</span>
  return <Badge tone={D2C_PRIORITY_TONE[p] ?? 'neutral'}>{p}</Badge>
}

export function StageBadge({ stage }: { stage: string | null }) {
  if (!stage) return <span className="text-ink-400">—</span>
  return <Badge tone={D2C_STAGE_TONE[stage] ?? 'neutral'}>{D2C_STAGE_LABEL[stage] ?? stage}</Badge>
}

/** Amber "Expired" (expiry passed, units still open: only a flag, Ops decide). */
export function ExpiredBadge() {
  return <span title={D2C_TEXT.EXPIRED_HINT}><Badge tone="warn"><AlertTriangle className="size-3" />{D2C_TEXT.EXPIRED}</Badge></span>
}

/** "Partly 70/100": dispatched of the open requested qty (plan 1.2). */
export function PartlyBadge({ t }: { t: Pick<D2cListItem, 'partly' | 'stage' | 'totals'> }) {
  if (!t.partly && t.stage !== D2C_STAGE.PARTLY_DISPATCHED) return null
  return <span title="Partly dispatched: dispatched / requested units"><Badge tone="info">Partly {t.totals.dispatched.toLocaleString('en-IN')}/{t.totals.updatedQty.toLocaleString('en-IN')}</Badge></span>
}

export function ErrorBox({ text, problems }: { text: string; problems?: D2cProblem[] }) {
  return (
    <div className="rounded-[var(--radius)] border border-crit/30 bg-crit-soft px-3 py-2 text-[12.5px] text-crit">
      <div className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>{text}</span></div>
      {!!problems?.length && (
        <ul className="mt-1.5 list-disc space-y-0.5 pl-8">
          {problems.slice(0, 20).map((p, i) => <li key={i}>{p.row ? `Line ${p.row}: ` : ''}{p.message}</li>)}
          {problems.length > 20 && <li>… and {problems.length - 20} more</li>}
        </ul>
      )}
    </div>
  )
}

export function WarnBox({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <div className="rounded-[var(--radius)] border border-warn/30 bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
      {items.map((w) => <div key={w} className="flex items-start gap-2"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" /><span>{w}</span></div>)}
    </div>
  )
}
