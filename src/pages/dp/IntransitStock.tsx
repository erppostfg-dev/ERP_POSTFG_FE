import { useEffect, useRef, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { Button, PageTitle, SubTabs } from '../../components/ui'
import { useAuth } from '../../auth/AuthContext'
import { ACCESS } from '../../constants/auth'
import { PATHS } from '../../constants/pages'
import { getDay, type CsvTarget } from '../../api/intransit'
import { INTRANSIT_POLL_MS, INTRANSIT_TABS, INTRANSIT_TEXT, type IntransitTab } from '../../constants/intransit'
import { istDay } from '../../lib/time'
import CsvViewer from './CsvViewer'
import DayRibbon from './intransit/DayRibbon'
import DailyRun from './intransit/DailyRun'
import HistoryTab from './intransit/HistoryTab'
import MastersTab from './intransit/MastersTab'
import { NoticeBar, type Notice, type OpenCsv } from './intransit/shared'

/*
 * In-transit Stock (Demand Planning, user 2026-10-15 / 19): one day at a time.
 *   Daily run  the day's to-do list: masters, the day's files (uploaded or fetched), build; then the day's report.
 *   History    every build and fetch.
 *   Masters    the 11 masters, their versions.
 * The day ribbon on top picks the day (today by default) and shows the last two weeks: files in, report built.
 * Everything for the day comes from one call (GET /intransit/day), re-read every few seconds while something runs.
 */

export default function IntransitStock() {
  const qc = useQueryClient()
  const { accessFor } = useAuth()
  const canEdit = accessFor(PATHS.INTRANSIT_STOCK) === ACCESS.EDITOR
  const [date, setDate] = useState(() => istDay(new Date()))
  const [tab, setTab] = useState<IntransitTab>('run')
  const [notice, setNotice] = useState<Notice>(null)
  const [viewing, setViewing] = useState<{ target: CsvTarget; subtitle?: string } | null>(null)
  const openCsv: OpenCsv = (target, subtitle) => setViewing({ target, subtitle })
  const onNotice = (tone: 'ok' | 'warn', text: string) => setNotice({ tone, text })

  const day = useQuery({
    queryKey: ['intransit', 'day', date],
    queryFn: ({ signal }) => getDay(date, signal),
    placeholderData: keepPreviousData,
    refetchInterval: (q) => (q.state.data?.running.length ? INTRANSIT_POLL_MS : false),
  })
  const plan = day.data

  // When a build or fetch ends, the files and figures changed: reload the runs and Inventory Calculation too.
  const activeIds = (plan?.running ?? []).map((r) => r.id).join(',')
  const prevActive = useRef(activeIds)
  useEffect(() => {
    if (prevActive.current && prevActive.current !== activeIds) {
      void qc.invalidateQueries({ queryKey: ['intransit', 'runs'] })
      void qc.invalidateQueries({ queryKey: ['intransit', 'inventory'] })
      void qc.invalidateQueries({ queryKey: ['intransit', 'run'] })
    }
    prevActive.current = activeIds
  }, [activeIds, qc])

  return (
    <div className="space-y-5">
      <PageTitle title={INTRANSIT_TEXT.TITLE} sub={INTRANSIT_TEXT.SUB} />
      {plan && <DayRibbon days={plan.days} date={date} today={plan.today} onPick={(d) => { setDate(d); setNotice(null) }} />}
      <SubTabs value={tab} onChange={(t) => { setTab(t); setNotice(null) }} tabs={INTRANSIT_TABS.map((t) => ({ key: t.key, label: t.label }))} />
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />

      {day.isError && !plan && (
        <div className="flex items-center justify-between gap-3 rounded-[var(--radius)] border border-crit/30 bg-crit-soft px-4 py-3 text-[13px] text-crit">
          <span>Could not load {date}: {day.error.message}</span>
          <Button onClick={() => void day.refetch()}>Try again</Button>
        </div>
      )}
      {day.isPending && <div className="rounded-[var(--radius)] border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-600">Loading…</div>}

      {plan && tab === 'run' && (
        <div className={day.isPlaceholderData ? 'opacity-60 transition-opacity' : ''}>
          <DailyRun plan={plan} canEdit={canEdit} onNotice={onNotice} openCsv={openCsv} onManageMasters={() => setTab('masters')} />
        </div>
      )}
      {tab === 'history' && <HistoryTab canEdit={canEdit} onNotice={onNotice} openCsv={openCsv} />}
      {plan && tab === 'masters' && <MastersTab plan={plan} canEdit={canEdit} onNotice={onNotice} openCsv={openCsv} />}

      {viewing && <CsvViewer target={viewing.target} subtitle={viewing.subtitle} onClose={() => setViewing(null)} />}
    </div>
  )
}
