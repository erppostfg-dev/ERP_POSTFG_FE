import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router'
import { PATHS } from '../../../constants/pages'
import { AlertTriangle, Check, Download, FileText } from 'lucide-react'
import { Button, Card } from '../../../components/ui'
import { downloadCsvFile, downloadLog, downloadReport, getRun, type IntransitRun } from '../../../api/intransit'
import { COMBO_FILES, COMBO_TAB, INTRANSIT_POLL_MS } from '../../../constants/intransit'
import { ComboTable, pendingCombos, useAddToSplit1, useMapVariants } from '../ComboSplit1'
import { dayLabel, errText, isActive, shortDay, StatusBadge, took, whenOn, type OnNotice } from './shared'

/*
 * One built report (user, 2026-10-15 / 19): who built it for which day and from what, the combo check, then its
 * Summary and the combos not in Split1. Used under the Daily run (the day's latest report) and in History (any
 * report). The report's main tables (Sheet35(2), Full_Shipment_Enhanced, Final Sheet35(2)) are tabs on Inventory
 * Calculation (moved there, user 2026-10-21).
 */

export default function ReportPanel({ run, canEdit, onNotice }: { run: IntransitRun; canEdit: boolean; onNotice: OnNotice }) {
  // 'summary' or the combos
  const [view, setView] = useState<string>('summary')
  const live = useQuery({
    queryKey: ['intransit', 'run', run.id],
    queryFn: ({ signal }) => getRun(run.id, signal),
    refetchInterval: isActive(run) ? INTRANSIT_POLL_MS : false,
  })
  const r = live.data?.id === run.id ? live.data : run
  const fail = (err: unknown) => onNotice('warn', errText(err))
  const used = r.result?.inputsUsed
  const fetchFailed = (r.result?.fetched ?? []).filter((f) => f.error)

  const combo = r.result?.comboCheck
  const missing = combo?.combos.length ?? 0
  const tabs = [
    { key: 'summary', label: 'Summary' },
    ...(missing ? [{ key: COMBO_TAB, label: 'Combos not in Split1' }] : []),
  ]
  const shown = tabs.some((t) => t.key === view) ? view : 'summary'

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-[15px] font-semibold text-ink-900">Report for {r.asOf ? dayLabel(r.asOf) : 'today'}</h2>
            <StatusBadge run={r} />
          </div>
          <p className="mt-0.5 text-[12px] text-ink-600">
            #{r.id}, {r.finishedAt ? `built ${whenOn(r.finishedAt, r.asOf ?? '')}` : r.startedAt ? `started ${whenOn(r.startedAt, r.asOf ?? '')}` : 'waiting to start'}
            {r.createdBy ? ` by ${r.createdBy.name}` : ''}{r.finishedAt ? ` in ${took(r)}` : ''}
            {used && <>, from {used.masters} masters{used.earlier.length ? ` and ${used.earlier.length} earlier ${used.earlier.length > 1 ? 'copies' : 'copy'} (${used.earlier.map((e) => `${e.name.replace(/\.csv$/i, '')} of ${shortDay(e.date)}`).join(', ')})` : ''}</>}
          </p>
        </div>
        <div className="flex gap-2">
          {r.hasReport && <Button variant="primary" icon={<Download className="size-3.5" />} onClick={() => void downloadReport(r.id).catch(fail)}>Download workbook</Button>}
          <Button icon={<FileText className="size-3.5" />} onClick={() => void downloadLog(r.id).catch(fail)}>Log</Button>
        </div>
      </div>

      <div className="space-y-3 p-4">
        {r.error && <div className="rounded-[var(--radius)] bg-crit-soft px-3 py-2 text-[12.5px] text-crit">{r.error}</div>}
        {fetchFailed.map((f) => (
          <div key={f.source} className="rounded-[var(--radius)] bg-warn-soft px-3 py-2 text-[12.5px] text-warn">
            The {f.source} fetch failed ({f.error}), so earlier copies of {f.files.join(', ')} were used.
          </div>
        ))}
        {isActive(r) && (
          <pre className="max-h-56 overflow-auto rounded-[var(--radius)] bg-canvas px-3 py-2 font-mono text-[11.5px] text-ink-600">{(r.logTail ?? []).join('\n') || 'Waiting to start…'}</pre>
        )}
        {r.summary && (
          <>
            <ComboNotice run={r} canEdit={canEdit} onOpen={() => setView(COMBO_TAB)} onError={fail} onNotice={onNotice} />
            <div className="flex flex-wrap gap-1 border-b border-line" role="tablist">
              {tabs.map((t) => (
                <button key={t.key} role="tab" aria-selected={shown === t.key} onClick={() => setView(t.key)}
                  className={`-mb-px border-b-2 px-3 py-1.5 text-[12.5px] font-medium ${shown === t.key ? 'border-primary text-primary' : 'border-transparent text-ink-600 hover:text-ink-900'}`}>
                  {t.label}
                  {t.key === COMBO_TAB && <span className="ml-1.5 rounded-full bg-warn-soft px-1.5 text-[11px] font-semibold text-warn">{missing}</span>}
                </button>
              ))}
            </div>
            {shown === 'summary' ? <RunSummary run={r} /> : (
              <div className="overflow-hidden rounded-[var(--radius)] border border-line">
                <ComboTable run={r} canEdit={canEdit} onNotice={onNotice} />
              </div>
            )}
            {r.hasReport && (
              <p className="text-[12px] text-ink-600">
                Its tables (SKU × Location, Full_Shipment_Enhanced, Final Stock) are in{' '}
                <Link to={PATHS.INVENTORY} className="font-medium text-primary hover:underline">Inventory Calculation</Link>, for the latest report.
              </p>
            )}
          </>
        )}
      </div>
    </Card>
  )
}

/**
 * The combo check of a report (user, 2026-10-19): an amber alert with the combos missing from Split1, split into those
 * Uniware confirms as bundles (ready to add), variants of a combo (map to the base) and those found only by their
 * CMB / SCMB / COMB code (to check); a one-line note when none is missing, and a note when Uniware could not be asked.
 */
function ComboNotice({ run, canEdit, onOpen, onError, onNotice }: {
  run: IntransitRun; canEdit: boolean; onOpen: () => void; onError: (e: unknown) => void; onNotice: OnNotice
}) {
  const { add, busy } = useAddToSplit1(onNotice)
  const { map, busy: mapping } = useMapVariants(onNotice)
  const c = run.result?.comboCheck
  if (!c) return null
  const uniwareNote = c.status !== 'done' && (
    <p className="text-[12px] text-ink-400">Uniware was not asked ({c.status === 'skipped' ? 'skipped' : 'failed'}: {c.reason}); combos were found by their CMB code only.</p>
  )
  if (!c.combos.length) {
    return uniwareNote || (
      <p className="flex items-center gap-1.5 text-[12px] text-ok">
        <Check className="size-3.5" /> Every combo is in Split1 ({c.checked.toLocaleString('en-IN')} SKUs outside Split1 checked against Uniware and their codes)
      </p>
    )
  }
  const pending = pendingCombos(run)
  if (!pending.length) {
    return (
      <p className="flex items-center gap-1.5 text-[12px] text-ok">
        <Check className="size-3.5" /> All {c.combos.length} flagged combo{c.combos.length > 1 ? 's are' : ' is'} fixed (in Split1 or mapped to their base). Build the report again to split their stock.
      </p>
    )
  }
  const confirmed = pending.filter((x) => x.foundBy === 'uniware' || x.foundBy === 'uniware+code')
  const variants = pending.filter((x) => x.foundBy === 'variant')
  const byCode = pending.filter((x) => x.foundBy === 'code-only')
  const units = pending.reduce((t, x) => t + x.units, 0)
  const list = (xs: typeof c.combos) => `${xs.slice(0, 6).map((x) => x.sku).join(', ')}${xs.length > 6 ? ' …' : ''}`
  return (
    <>
      <div className="flex flex-wrap items-start gap-3 rounded-[var(--radius)] border border-warn/30 bg-warn-soft px-3 py-2.5 text-[12.5px] text-warn">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-[240px] flex-1 space-y-0.5">
          <div className="font-semibold">{pending.length} combo{pending.length > 1 ? 's are' : ' is'} not in Split1 ({units.toLocaleString('en-IN')} units): their stock stays under the combo instead of its products</div>
          {confirmed.length > 0 && <div className="text-ink-600"><span className="font-medium text-warn">{confirmed.length} confirmed by Uniware</span>, ready to add: {list(confirmed)}</div>}
          {variants.length > 0 && (
            <div className="text-ink-600"><span className="font-medium text-warn">{variants.length} variant{variants.length > 1 ? 's' : ''} of a combo</span>, to map to the base: {variants.slice(0, 6).map((x) => `${x.sku} to ${x.base?.sku}`).join(', ')}{variants.length > 6 ? ' …' : ''}</div>
          )}
          {byCode.length > 0 && <div className="text-ink-600"><span className="font-medium text-warn">{byCode.length} found by CMB code only</span>, enter their components in Show combos: {list(byCode)}</div>}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={onOpen}>Show combos</Button>
          {confirmed.length > 0 && (
            <Button icon={<Download className="size-3.5" />} onClick={() => void downloadCsvFile({ kind: 'run', runId: run.id, name: COMBO_FILES.SPLIT1_ROWS }).catch(onError)}>Split1 rows</Button>
          )}
          {canEdit && confirmed.length > 0 && (
            <Button variant="primary" disabled={busy} onClick={() => void add(confirmed.map((x) => ({ combo: x.sku, components: x.components })))}>
              {busy ? 'Adding…' : `Add ${confirmed.length} to Split1`}
            </Button>
          )}
          {canEdit && variants.length > 0 && (
            <Button variant="primary" disabled={mapping} onClick={() => void map(variants)}>
              {mapping ? 'Mapping…' : `Map ${variants.length} variant${variants.length > 1 ? 's' : ''}`}
            </Button>
          )}
        </div>
      </div>
      {uniwareNote}
    </>
  )
}

/** The report's Summary_Dashboard (the in-transit total first) and its sheets' row counts. */
function RunSummary({ run }: { run: IntransitRun }) {
  const head = ['Final Status', 'Shipments', 'Total Units', 'Updated Qty', 'Intransit?']
  const rows = run.summary ?? []
  return (
    <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
      <div className="overflow-x-auto rounded-[var(--radius)] border border-line">
        <table className="w-full text-[12.5px]">
          <thead><tr className="bg-alt">{head.map((h, i) => <th key={h} className={`px-3 py-2 text-[11.5px] font-semibold text-ink-600 ${i ? 'text-right' : 'text-left'}`}>{h}</th>)}</tr></thead>
          <tbody>
            {rows.map((s) => {
              const total = s['Intransit?'] === 'TOTAL'
              return (
                <tr key={String(s['Final Status'])} className={`border-t border-line ${total ? 'bg-primary-soft/50 font-semibold text-ink-900' : s['Intransit?'] === 'No' ? 'text-ink-400' : ''}`}>
                  {head.map((h, i) => <td key={h} className={`px-3 py-1.5 ${i ? 'tnum text-right' : ''}`}>{typeof s[h] === 'number' ? (s[h] as number).toLocaleString('en-IN') : String(s[h] ?? '')}</td>)}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="max-h-[360px] overflow-auto rounded-[var(--radius)] border border-line">
        <table className="w-full text-[12.5px]">
          <thead><tr className="bg-alt"><th className="px-3 py-2 text-left text-[11.5px] font-semibold text-ink-600">Sheet</th><th className="px-3 py-2 text-right text-[11.5px] font-semibold text-ink-600">Rows</th></tr></thead>
          <tbody>
            {Object.entries(run.sheetRows ?? {}).map(([k, v]) => (
              <tr key={k} className="border-t border-line"><td className="px-3 py-1.5">{k}</td><td className="tnum px-3 py-1.5 text-right">{v.toLocaleString('en-IN')}</td></tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
