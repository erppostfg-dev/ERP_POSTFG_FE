import { useEffect, useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { ChevronLeft, ChevronRight, Download, Search, X } from 'lucide-react'
import { Button } from '../../components/ui'
import { downloadCsvFile, previewCsv, type CsvTarget } from '../../api/intransit'
import { CSV_VIEWER_PAGE, CSV_SEARCH_DELAY_MS } from '../../constants/intransit'
import { istDateTime } from '../../lib/time'

/*
 * Table viewer (In-transit Stock, user 2026-10-16 / 18): any input file, a file a connector run fetched (Uniware,
 * Amazon, Flipkart; also the ones refused by the column check), or a sheet of a built report (Sheet35(2),
 * Full_Shipment_Enhanced, Final Sheet35(2) on the Reports tab). Read page by page from the server with a search over
 * every column: the big tables are tens of MB, so only one page of rows ever reaches the browser.
 *   <CsvTable>   the table itself (search, rows, pager, download), embedded in a page;
 *   <CsvViewer>  the same in a large window.
 */

const fmtSize = (n: number) => (n >= 1048576 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)
const num = (n: number) => n.toLocaleString('en-IN')

export function CsvTable({ target, subtitle, onClose, maxHeight = '60vh', showName = true }: {
  target: CsvTarget; subtitle?: string; onClose?: () => void; maxHeight?: string; showName?: boolean
}) {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [offset, setOffset] = useState(0)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => { const t = setTimeout(() => { setSearch(q); setOffset(0) }, CSV_SEARCH_DELAY_MS); return () => clearTimeout(t) }, [q])

  const key = target.kind === 'input' ? ['input', target.name, target.date ?? ''] : [target.kind, target.runId, target.name]
  const page = useQuery({
    queryKey: ['intransit', 'csv', ...key, offset, search],
    queryFn: ({ signal }) => previewCsv(target, { offset, limit: CSV_VIEWER_PAGE, q: search }, signal),
    placeholderData: keepPreviousData,
  })
  const d = page.data
  const last = d ? Math.max(0, Math.ceil(d.total / CSV_VIEWER_PAGE) - 1) : 0
  const pageNo = Math.floor(offset / CSV_VIEWER_PAGE)
  const what = target.kind === 'sheet' ? 'sheet' : 'file'

  return (
    <div className="flex min-h-0 flex-col">
      {/* header */}
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line px-4 py-3">
        <div className="min-w-0">
          {showName && <h3 className="truncate font-mono text-[14px] font-semibold text-ink-900">{target.name}</h3>}
          <p className="mt-0.5 text-xs text-slate-500">
            {subtitle ? `${subtitle} · ` : ''}
            {d ? `${num(d.totalRows)} rows · ${d.columns.length} columns${target.kind === 'sheet' ? '' : ` · ${fmtSize(d.size)} · updated ${istDateTime(d.modified)}`}` : page.isError ? '' : 'Loading…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <label className="flex h-8 w-64 items-center gap-2 rounded-[var(--radius)] border border-line bg-canvas px-2.5">
            <Search className="size-3.5 text-ink-400" />
            <input autoFocus={!!onClose} value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search every column…" className="w-full bg-transparent text-[12.5px] outline-none" />
          </label>
          <Button icon={<Download className="size-3.5" />} onClick={() => void downloadCsvFile(target).catch((e) => setError(e instanceof Error ? e.message : String(e)))}>
            {target.kind === 'sheet' ? 'Download CSV' : 'Download'}
          </Button>
          {onClose && <button onClick={onClose} title="Close (Esc)" className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink-900"><X className="size-4" /></button>}
        </div>
      </div>

      {(page.isError || error) && (
        <div className="mx-4 mt-3 rounded-[var(--radius)] border border-crit/30 bg-crit-soft px-3 py-2 text-[12.5px] text-crit">{error ?? page.error?.message}</div>
      )}

      {/* table: own scroll area, header row stays on top */}
      <div className={`min-h-[160px] overflow-auto ${page.isFetching ? 'opacity-70' : ''}`} style={{ maxHeight }}>
        {d && (
          <table className="w-full border-separate border-spacing-0 text-[12.5px]">
            <thead>
              <tr>
                <th className="sticky left-0 top-0 z-20 border-b border-line bg-alt px-2 py-2 text-right text-[11px] font-semibold text-ink-400">#</th>
                {d.columns.map((c, i) => (
                  <th key={i} className="sticky top-0 z-10 whitespace-nowrap border-b border-line bg-alt px-3 py-2 text-left text-[11px] font-semibold text-ink-600">{c || `Column ${i + 1}`}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {d.rows.map((r, i) => (
                <tr key={d.offset + i} className="hover:bg-alt/40">
                  <td className="tnum sticky left-0 border-b border-line bg-surface px-2 py-1.5 text-right text-[11px] text-ink-400">{num(d.offset + i + 1)}</td>
                  {d.columns.map((_, j) => (
                    <td key={j} title={r[j]} className="max-w-[280px] truncate whitespace-nowrap border-b border-line px-3 py-1.5 text-ink-900">{r[j] ?? ''}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {d && !d.rows.length && <div className="px-5 py-10 text-center text-[13px] text-ink-600">{search ? `No row contains "${search}".` : `The ${what} has no data rows.`}</div>}
      </div>

      {/* pager */}
      {d && (
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12.5px] text-ink-600">
          <span>
            {d.total ? `${num(d.offset + 1)}–${num(Math.min(d.total, d.offset + d.rows.length))} of ${num(d.total)}` : '0'} rows
            {search && ` matching "${search}" (of ${num(d.totalRows)})`}
          </span>
          <div className="flex items-center gap-2">
            <button disabled={pageNo === 0} onClick={() => setOffset(0)} className="rounded px-1.5 py-0.5 disabled:opacity-40">First</button>
            <button disabled={pageNo === 0} onClick={() => setOffset((pageNo - 1) * CSV_VIEWER_PAGE)} className="rounded p-1 disabled:opacity-40"><ChevronLeft className="size-4" /></button>
            <span className="tnum rounded-md border border-line px-2.5 py-0.5 text-ink-900">{num(pageNo + 1)} / {num(last + 1)}</span>
            <button disabled={pageNo >= last} onClick={() => setOffset((pageNo + 1) * CSV_VIEWER_PAGE)} className="rounded p-1 disabled:opacity-40"><ChevronRight className="size-4" /></button>
            <button disabled={pageNo >= last} onClick={() => setOffset(last * CSV_VIEWER_PAGE)} className="rounded px-1.5 py-0.5 disabled:opacity-40">Last</button>
          </div>
        </div>
      )}
    </div>
  )
}

export default function CsvViewer({ target, subtitle, onClose }: { target: CsvTarget; subtitle?: string; onClose: () => void }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-ink-900/40 p-4 backdrop-blur-[1px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mt-[3vh] flex max-h-[92vh] w-full max-w-[min(1400px,96vw)] flex-col rounded-[var(--radius)] border border-line bg-surface shadow-xl">
        <CsvTable target={target} subtitle={subtitle} onClose={onClose} maxHeight="calc(92vh - 130px)" />
      </div>
    </div>
  )
}
