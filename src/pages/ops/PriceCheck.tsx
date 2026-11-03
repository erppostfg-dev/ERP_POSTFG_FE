import { Check } from 'lucide-react'
import { PRICE_CHECK_TEXT as T, PRICE_CHOICE, type PriceChoice } from '../../constants/priceDifferences'

/*
 * Price check in the review panel (user, 2026-10-30): one row per SKU line whose price and / or MRP differs (an MRP
 * difference nearly always brings the price with it: same margin), one click for both. Not a table (user: cramped,
 * scrolling sideways): each line is a roomy row, the SKU on the left and two option cards on the right (Ours / Channel,
 * radio circle + MRP over price), the difference under the SKU, "Update master" under the channel card when chosen.
 * Wraps under the SKU when the panel is narrow.
 */

type Pair = { ours: number | ''; channel: number | '' }

export type PriceRow = {
  lineNo: string
  sku: string
  code: string
  /** Only the values that differ on this line. */
  mrp?: Pair
  price?: Pair
}

const fmt = (v: number | '') => (v === '' ? '—' : v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }))
const signed = (v: number) => `${v > 0 ? '+' : ''}${fmt(Math.round(v * 100) / 100)}`
const diffOf = (p: Pair) => (p.ours !== '' && p.channel !== '' ? p.channel - p.ours : null)

export function PriceCheck({ rows, choices, onChoose, master, onMaster, canEdit, totals }: {
  rows: PriceRow[]
  /** lineNo -> ours / channel */
  choices: Record<string, PriceChoice>
  onChoose: (lineNos: string[], choice: PriceChoice) => void
  /** line numbers with Update master ticked */
  master: Set<string>
  onMaster: (lineNo: string, on: boolean) => void
  canEdit: boolean
  totals: { po: string; chosen: string; explained: string | null; left: string | null }
}) {
  if (!rows.length) return null

  const option = (r: PriceRow, side: PriceChoice) => {
    const picked = choices[r.lineNo] === side
    return (
      <button type="button" disabled={!canEdit} onClick={() => onChoose([r.lineNo], side)} aria-pressed={picked}
        className={`flex min-w-[150px] flex-1 items-start gap-2.5 rounded-[var(--radius)] border px-3 py-2 text-left transition-colors duration-150 disabled:cursor-not-allowed ${picked ? 'border-ok bg-ok-soft shadow-[inset_0_0_0_1px_var(--color-ok)]' : 'border-line bg-surface hover:border-primary/60 hover:bg-alt/50'}`}>
        <span className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border ${picked ? 'border-ok bg-ok text-white' : 'border-ink-400'}`}>
          {picked && <Check className="size-3" strokeWidth={3} />}
        </span>
        <span className="min-w-0">
          <span className={`block text-[11px] font-semibold uppercase tracking-wide ${picked ? 'text-ok' : 'text-ink-600'}`}>{side === PRICE_CHOICE.OURS ? T.OURS : T.CHANNEL}</span>
          {r.mrp && <span className={`tnum block text-[13px] ${picked ? 'font-semibold text-ink-900' : 'text-ink-600'}`}>{T.FIELD.mrp} {fmt(r.mrp[side])}</span>}
          {r.price && <span className={`tnum block text-[13px] ${picked ? 'font-semibold text-ink-900' : 'text-ink-600'}`}>{T.FIELD.price} ₹{fmt(r.price[side])}</span>}
        </span>
      </button>
    )
  }
  const diff = (r: PriceRow) => {
    const m = r.mrp ? diffOf(r.mrp) : null
    const p = r.price ? diffOf(r.price) : null
    return [m !== null && `${T.FIELD.mrp} ${signed(m)}`, p !== null && `${T.FIELD.price} ${signed(p)}`].filter(Boolean).join(' · ')
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-[220px] flex-1 text-[12.5px] text-ink-600">{T.HINT}</p>
        {canEdit && (
          <div className="flex shrink-0 gap-2">
            <button type="button" onClick={() => onChoose(rows.map((r) => r.lineNo), PRICE_CHOICE.OURS)} className="rounded-md border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink-900 hover:bg-alt">{T.ALL_OURS}</button>
            <button type="button" onClick={() => onChoose(rows.map((r) => r.lineNo), PRICE_CHOICE.CHANNEL)} className="rounded-md border border-line px-3 py-1.5 text-[12.5px] font-semibold text-ink-900 hover:bg-alt">{T.ALL_CHANNEL}</button>
          </div>
        )}
      </div>

      <div className="divide-y divide-line rounded-[var(--radius-card)] border border-line">
        {rows.map((r) => {
          const channel = choices[r.lineNo] === PRICE_CHOICE.CHANNEL
          return (
            <div key={r.lineNo} className="flex flex-wrap items-start gap-x-4 gap-y-2 px-4 py-3">
              <div className="min-w-[200px] flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="tnum shrink-0 text-[12px] text-ink-400">{T.LINE(r.lineNo)}</span>
                  <span className="truncate text-[13.5px] font-medium text-ink-900" title={r.sku}>{r.sku || '—'}</span>
                </div>
                <div className="truncate font-mono text-[11.5px] text-ink-400" title={r.code}>{r.code}</div>
                <div className="tnum mt-1 text-[12px] font-medium text-warn">{T.DIFFERS(diff(r))}</div>
              </div>
              <div className="flex min-w-[320px] flex-[1.2] flex-col gap-1.5">
                <div className="flex gap-2">
                  {option(r, PRICE_CHOICE.OURS)}
                  {option(r, PRICE_CHOICE.CHANNEL)}
                </div>
                {channel && (
                  <label className={`pf-tab-in flex items-center justify-end gap-2 text-[12.5px] ${canEdit ? 'cursor-pointer' : ''} text-ink-900`} title={T.UPDATE_TIP}>
                    <input type="checkbox" disabled={!canEdit} checked={master.has(r.lineNo)} onChange={(e) => onMaster(r.lineNo, e.target.checked)} className="size-4 accent-[var(--color-primary)]" />
                    {T.UPDATE_MASTER}
                  </label>
                )}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex flex-col items-end gap-0.5 text-[12.5px] text-ink-600">
        <div>{T.TOTALS(totals.po, totals.chosen)}</div>
        {totals.explained && <div className="text-ink-400">{T.TOTAL_EXPLAINED(totals.explained)}</div>}
        {totals.left && <div className="font-medium text-crit">{T.TOTAL_LEFT(totals.left)}</div>}
      </div>
    </div>
  )
}
