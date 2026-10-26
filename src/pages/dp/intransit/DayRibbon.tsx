import { useEffect, useRef } from 'react'
import type { DaySummary } from '../../../api/intransit'
import { DatePicker } from '../../../components/pickers'

/*
 * The last two weeks at a glance, and the way to pick the day to work on (user, 2026-10-19): one column per day with
 * its weekday and date, a bar of its daily files (one notch per file that day has its own copy of), and a mark when a
 * report was built for it (green) or failed (red). An older day: the calendar at the end.
 */

const weekday = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'UTC' })
const dayNo = (d: string) => Number(d.slice(8, 10))
const month = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-GB', { month: 'short', timeZone: 'UTC' })

export default function DayRibbon({ days, date, today, onPick }: { days: DaySummary[]; date: string; today: string; onPick: (d: string) => void }) {
  const strip = useRef<HTMLDivElement>(null)
  const inStrip = days.some((d) => d.date === date)
  // keep the picked day in view on narrow screens
  useEffect(() => {
    strip.current?.querySelector<HTMLElement>('[aria-current="date"]')?.scrollIntoView({ block: 'nearest', inline: 'center' })
  }, [date])

  return (
    <div className="flex items-stretch gap-3">
      <div ref={strip} className="flex min-w-0 flex-1 gap-1 overflow-x-auto pb-1" role="listbox" aria-label="Day to work on">
        {days.map((d, i) => {
          const picked = d.date === date
          const full = d.ofDate >= d.total
          const newMonth = i === 0 || month(days[i - 1].date) !== month(d.date)
          return (
            <button key={d.date} role="option" aria-selected={picked} aria-current={picked ? 'date' : undefined} onClick={() => onPick(d.date)}
              title={`${d.ofDate} of ${d.total} daily files${d.report ? `, report ${d.report.status}` : ', no report'}`}
              className={`group relative flex w-[52px] shrink-0 flex-col items-center gap-1 rounded-[var(--radius)] border px-1 pb-1.5 pt-1 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-primary/40 ${
                picked ? 'border-primary bg-surface shadow-[0_1px_0_var(--color-primary)]' : 'border-transparent hover:border-line hover:bg-surface'}`}>
              <span className={`text-[10.5px] ${picked ? 'text-primary' : 'text-ink-400'}`}>{d.date === today ? 'Today' : newMonth ? month(d.date) : weekday(d.date)}</span>
              <span className={`tnum text-[17px] leading-none ${picked ? 'font-semibold text-ink-900' : d.ofDate ? 'text-ink-900' : 'text-ink-400'}`}>{dayNo(d.date)}</span>
              {/* one notch per daily file the day has */}
              <span className="flex h-1 w-full gap-px" aria-hidden>
                {Array.from({ length: d.total }, (_, k) => (
                  <span key={k} className={`flex-1 rounded-[1px] ${k < d.ofDate ? (full ? 'bg-ok' : 'bg-warn') : 'bg-line'}`} />
                ))}
              </span>
              <span className={`size-1.5 rounded-full ${d.report?.status === 'succeeded' ? 'bg-ok' : d.report?.status === 'failed' ? 'bg-crit' : d.report ? 'animate-pulse bg-info' : 'bg-transparent'}`} aria-hidden />
            </button>
          )
        })}
      </div>
      <div className="flex shrink-0 flex-col justify-center">
        <DatePicker value={inStrip ? '' : date} onChange={(v) => v && v <= today && onPick(v)} placeholder="Older day" className="w-36" />
      </div>
    </div>
  )
}
