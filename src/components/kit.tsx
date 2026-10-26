// Section-level toolkit: toolbar (search · filters · CSV/Excel/Upload), filter panel, data grid
import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Download, Eye, Filter, History, MoreHorizontal, Pencil, Search, Upload, X } from 'lucide-react'
import { Badge, BulkUpload, downloadCsv } from './ui'
import { DatePicker, Pop, usePopover } from './pickers'
import { fmtDate, statusTone, type ColKind } from '../lib/ops'
import { NOT_IN_DB } from '../constants/masters'
import { copyText } from '../lib/clipboard'
import { COPIED_MS, GRID_HINT } from '../constants/ui'

// ---- Toolbar -----------------------------------------------------------
export function SectionToolbar({
  q, setQ, placeholder = 'Search…', filtersOpen, onToggleFilters, activeFilters = 0, entity, onExport, primary, extra, onUpload,
}: {
  q: string; setQ: (v: string) => void; placeholder?: string
  filtersOpen?: boolean; onToggleFilters?: () => void; activeFilters?: number
  entity: string; onExport: (ext: 'csv' | 'xls') => void; primary?: ReactNode; extra?: ReactNode
  /** What Upload CSV does on a live page (e.g. open the page that takes the files); default: the sample upload modal. */
  onUpload?: () => void
}) {
  const [upload, setUpload] = useState(false)
  return (
    <div className="flex flex-wrap items-center gap-2">
      <label className="relative flex min-w-[220px] flex-1 items-center sm:max-w-sm">
        <Search className="pointer-events-none absolute left-3 size-4 text-ink-400" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          className="h-9 w-full rounded-[var(--radius)] border border-line bg-surface pl-9 pr-3 text-[13px] outline-none transition-shadow placeholder:text-ink-400 focus:border-primary focus:ring-2 focus:ring-primary/15"
        />
      </label>
      {onToggleFilters && (
        <button
          onClick={onToggleFilters}
          className={`inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border px-3 text-[13px] font-medium transition-colors ${
            filtersOpen || activeFilters ? 'border-primary/40 bg-primary-soft text-primary' : 'border-line bg-surface text-ink-900 hover:bg-canvas'
          }`}
        >
          <Filter className="size-4" /> Filters
          {activeFilters > 0 && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{activeFilters}</span>}
        </button>
      )}
      {extra}
      <div className="ml-auto flex flex-wrap items-center gap-2">
        <button onClick={() => onExport('csv')} className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-primary-soft px-3 text-[13px] font-medium text-primary hover:bg-primary/15">
          <Download className="size-4" /> CSV
        </button>
        <button onClick={() => onExport('xls')} className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-primary-soft px-3 text-[13px] font-medium text-primary hover:bg-primary/15">
          <Download className="size-4" /> Excel
        </button>
        <button onClick={() => (onUpload ? onUpload() : setUpload(true))} className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] border border-line bg-surface px-3 text-[13px] font-medium text-ink-900 hover:bg-canvas">
          <Upload className="size-4" /> Upload CSV
        </button>
        {primary}
      </div>
      <BulkUpload open={upload} onClose={() => setUpload(false)} entity={entity} onDownloadTemplate={() => onExport('csv')} />
    </div>
  )
}

export function PrimaryBtn({ children, onClick, icon }: { children: ReactNode; onClick?: () => void; icon?: ReactNode }) {
  return (
    <button onClick={onClick} className="inline-flex h-9 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3.5 text-[13px] font-semibold text-white shadow-sm hover:opacity-90">
      {icon}{children}
    </button>
  )
}

// ---- Filters ------------------------------------------------------------
export type FilterDef =
  | { key: string; label: string; type: 'date' }
  | { key: string; label: string; type: 'multi'; options: readonly string[]; placeholder?: string }
  | { key: string; label: string; type: 'text'; placeholder?: string }
export type FilterValues = Record<string, string | string[]>

export const countActive = (v: FilterValues) => Object.values(v).filter((x) => (Array.isArray(x) ? x.length : x)).length

function MultiSelect({ value, onChange, options, placeholder }: { value: string[]; onChange: (v: string[]) => void; options: readonly string[]; placeholder: string }) {
  // Our popover: opens / closes with the same animation as the other pickers (components/pickers.tsx).
  const { open, leaving, ref, toggle } = usePopover()
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={toggle}
        className={`flex h-9 w-full items-center gap-2 rounded-[var(--radius)] border bg-surface px-3 text-left text-[13px] transition-[border-color,box-shadow] duration-200 ease-out ${open ? 'border-primary ring-2 ring-primary/15' : 'border-line'}`}
      >
        <span className={`min-w-0 flex-1 truncate ${value.length ? 'text-ink-900' : 'text-ink-400'}`}>
          {value.length ? (value.length <= 2 ? value.join(', ') : `${value[0]} +${value.length - 1}`) : placeholder}
        </span>
        {value.length > 0 ? (
          <X className="size-3.5 shrink-0 text-ink-400 hover:text-ink-900" onClick={(e) => { e.stopPropagation(); onChange([]) }} />
        ) : (
          <ChevronDown className="size-3.5 shrink-0 text-ink-400" />
        )}
      </button>
      {open && (
        <Pop leaving={leaving} className="max-h-60 w-full min-w-[180px] overflow-y-auto">
          {options.map((o) => {
            const on = value.includes(o)
            return (
              <label key={o} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-[13px] hover:bg-alt">
                <input type="checkbox" checked={on} onChange={() => onChange(on ? value.filter((x) => x !== o) : [...value, o])} className="accent-[var(--color-primary)]" />
                {o}
              </label>
            )
          })}
        </Pop>
      )}
    </div>
  )
}

const fieldCls = 'h-9 w-full rounded-[var(--radius)] border border-line bg-surface px-3 text-[13px] outline-none placeholder:text-ink-400 focus:border-primary focus:ring-2 focus:ring-primary/15'

export function FilterPanel({ defs, value, onApply, onClose }: { defs: FilterDef[]; value: FilterValues; onApply: (v: FilterValues) => void; onClose: () => void }) {
  const [draft, setDraft] = useState<FilterValues>(value)
  const set = (k: string, v: string | string[]) => setDraft((d) => ({ ...d, [k]: v }))
  return (
    <div className="rounded-[var(--radius-card)] border border-primary/25 bg-surface p-4 shadow-[0_1px_0_rgba(79,70,229,0.06)]">
      <div className="mb-3 flex items-center justify-between">
        <div className="text-[13px] font-semibold text-ink-900">Filters</div>
        <button onClick={onClose} className="rounded p-1 text-ink-400 hover:bg-alt hover:text-ink-900"><X className="size-4" /></button>
      </div>
      <div className="grid grid-cols-1 gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
        {defs.map((d) => (
          <div key={d.key}>
            <div className="mb-1 text-[12px] font-medium text-ink-600">{d.label}</div>
            {d.type === 'multi' ? (
              <MultiSelect value={(draft[d.key] as string[]) ?? []} onChange={(v) => set(d.key, v)} options={d.options} placeholder={d.placeholder ?? `Select ${d.label.toLowerCase()}`} />
            ) : d.type === 'date' ? (
              <DateInput value={(draft[d.key] as string) ?? ''} onChange={(v) => set(d.key, v)} className={draft[d.key] ? '' : 'text-ink-400'} />
            ) : (
              <input value={(draft[d.key] as string) ?? ''} onChange={(e) => set(d.key, e.target.value)} placeholder={d.placeholder} className={fieldCls} />
            )}
          </div>
        ))}
      </div>
      <div className="mt-4 flex justify-end gap-2">
        <button onClick={() => { setDraft({}); onApply({}) }} className="h-8 rounded-[var(--radius)] border border-line px-3 text-[13px] font-medium hover:bg-canvas">Clear</button>
        <button onClick={() => onApply(draft)} className="h-8 rounded-[var(--radius)] bg-primary px-3.5 text-[13px] font-semibold text-white hover:opacity-90">Apply</button>
      </div>
    </div>
  )
}

// Generic matcher — keys ending in From/To compare against the base date key
export function applyFilters<T>(rows: T[], f: FilterValues): T[] {
  return rows.filter((r) => {
    const rec = r as Record<string, unknown>
    for (const [k, v] of Object.entries(f)) {
      if (Array.isArray(v) ? !v.length : !v) continue
      if (k.endsWith('From') || k.endsWith('To')) {
        const base = k.replace(/(From|To)$/, '')
        const val = String(rec[base] ?? '')
        if (!val) return false
        if (k.endsWith('From') && val < (v as string)) return false
        if (k.endsWith('To') && val > (v as string)) return false
      } else if (k === 'notAssigned') {
        if ((v as string[]).some((field) => rec[field])) return false
      } else if (Array.isArray(v)) {
        if (!v.includes(String(rec[k]))) return false
      } else if (!String(rec[k] ?? '').toLowerCase().includes(v.toLowerCase())) return false
    }
    return true
  })
}

export function useSection<T>(rows: T[], searchKeys: (keyof T)[]) {
  const [q, setQ] = useState('')
  const [open, setOpen] = useState(false)
  const [filters, setFilters] = useState<FilterValues>({})
  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    const base = s ? rows.filter((r) => searchKeys.some((k) => String(r[k] ?? '').toLowerCase().includes(s))) : rows
    return applyFilters(base, filters)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, q, filters])
  return { q, setQ, open, setOpen, filters, setFilters, filtered, active: countActive(filters) }
}

export function exportRows<T>(name: string, ext: 'csv' | 'xls', cols: [string, keyof T, ColKind][], rows: T[]) {
  downloadCsv(`${name}.${ext === 'xls' ? 'xls' : 'csv'}`, cols.map((c) => c[0]), rows.map((r) => cols.map((c) => String(r[c[1]] ?? ''))))
}

// ---- Data grid ---------------------------------------------------------
export function Cell({ kind, v }: { kind: ColKind; v: unknown }) {
  if (v === '' || v === null || v === undefined) return <span className="text-ink-400">—</span>
  if (v === NOT_IN_DB) return <span className="whitespace-nowrap text-[12px] text-ink-400">{NOT_IN_DB}</span>
  switch (kind) {
    case 'mono': return <span className="font-mono text-[12.5px]">{String(v)}</span>
    case 'date': return <span className="tnum text-[12.5px]">{fmtDate(String(v))}</span>
    case 'num': return <span className="tnum">{Number(v).toLocaleString('en-IN')}</span>
    case 'money': return <span className="tnum">₹{Number(v).toLocaleString('en-IN')}</span>
    case 'link': return <a href="#" onClick={(e) => e.preventDefault()} className="text-primary hover:underline">{String(v)}</a>
    case 'status': return <Badge tone={statusTone(String(v))}>{String(v)}</Badge>
    default: return <span className="block max-w-[240px] truncate">{String(v)}</span>
  }
}

/** Width of the row menu (px); the menu's right edge lines up with its ⋯ button. */
const ROW_MENU_W = 176
const ROW_MENU_ITEM_PX = 32
const ROW_MENU_MS = 150

/*
 * The ⋯ menu of a row (2026-10-14): drawn in a layer above the whole page (portal, position fixed), so it is never cut
 * by the table's scroll area or covered by the fixed cells of the rows below; opens upward when there is no room
 * below; fades in / out; closes on a click outside, Esc, scroll or resize.
 */
function RowMenu({ items }: { items: () => { label: string; onClick: () => void }[] }) {
  const [pos, setPos] = useState<{ top: number; left: number; up: boolean } | null>(null)
  const [leaving, setLeaving] = useState(false)
  const btn = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  const list = pos ? items() : []
  const close = (now = false) => {
    if (!pos) return
    if (now) { setPos(null); setLeaving(false); return }
    setLeaving(true)
    setTimeout(() => { setPos(null); setLeaving(false) }, ROW_MENU_MS)
  }
  const open = () => {
    const r = btn.current!.getBoundingClientRect()
    const h = items().length * ROW_MENU_ITEM_PX + 10
    const up = r.bottom + h + 8 > window.innerHeight && r.top - h - 8 > 0
    setPos({ top: up ? r.top - h - 4 : r.bottom + 4, left: Math.max(8, r.right - ROW_MENU_W), up })
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
      <button ref={btn} aria-label="Open menu" aria-expanded={!!pos} onClick={() => (pos ? close() : open())}
        className={`pf-press rounded-md p-1.5 transition-colors duration-150 hover:bg-alt hover:text-ink-900 ${pos && !leaving ? 'bg-alt text-ink-900' : 'text-ink-600'}`}>
        <MoreHorizontal className="size-4" />
      </button>
      {pos && createPortal(
        <div ref={box} role="menu" style={{ top: pos.top, left: pos.left, width: ROW_MENU_W }}
          className={`fixed z-[100] rounded-[var(--radius)] border border-line bg-surface p-1 shadow-lg ${pos.up ? 'origin-bottom-right' : 'origin-top-right'} ${leaving ? 'pf-pop-out' : 'pf-pop-in'}`}>
          {list.map((m) => (
            <button key={m.label} role="menuitem" onClick={() => { close(); m.onClick() }}
              className="pf-press block h-8 w-full rounded px-2.5 text-left text-[13px] text-ink-900 transition-colors duration-150 hover:bg-alt">{m.label}</button>
          ))}
        </div>,
        document.body,
      )}
    </>
  )
}

export function DataGrid<T>({
  cols, rows, rowKey, sticky = 1, onRowClick, rowMenu, pageSize = 15, trailing, rowClass, groups, editable, rowEditable, onRowHistory, stickyWidths, maxHeight, onScrolledChange,
}: {
  cols: [string, keyof T, ColKind][]; rows: T[]; rowKey: (r: T) => string; sticky?: number
  onRowClick?: (r: T) => void; rowMenu?: (r: T) => { label: string; onClick: () => void }[]; pageSize?: number
  trailing?: { label: string; render: (r: T) => ReactNode }[]; rowClass?: (r: T) => string
  /** A header row above the columns: each group spans `span` columns in order; `edit` = marked with a pencil. */
  groups?: { label: string; span: number; edit?: boolean }[]
  /** Columns the person can edit: their header carries a pencil (no colour). */
  editable?: ReadonlySet<keyof T>
  /** Rows the person may edit at all (e.g. only their facilities'): a pencil in their Action cell. */
  rowEditable?: (r: T) => boolean
  /** Adds a History button to the Action cell (who changed what and when). */
  onRowHistory?: (r: T) => void
  /** Width (px) of each fixed column; default 132 each. Fixed cells cut long values with "…" (full value on hover). */
  stickyWidths?: number[]
  /** Give the table its own scroll area of this height (CSS), so the header rows and the sideways scrollbar stay on screen. */
  maxHeight?: string
  /** Told true when the table is scrolled / dragged away from its top-left start, false when it is back there. */
  onScrolledChange?: (scrolled: boolean) => void
}) {
  const [page, setPage] = useState(0)
  // Every table (user, 2026-10-15): a single click copies that cell's text (as shown), a double-click opens the row.
  const [copied, setCopied] = useState<string | null>(null)
  const copyTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const copyCell = (e: React.MouseEvent<HTMLTableCellElement>, id: string) => {
    if (e.detail > 1) return // the second click of a double-click: that one opens the row
    if ((e.target as HTMLElement).closest('button, a, input, select, textarea, label')) return // a control in the cell does its own thing
    if (window.getSelection()?.toString()) return // the person is selecting text themselves
    const text = e.currentTarget.innerText.trim()
    if (!text || text === '—') return
    void copyText(text).then((ok) => {
      if (!ok) return
      setCopied(id)
      clearTimeout(copyTimer.current)
      copyTimer.current = setTimeout(() => setCopied(null), COPIED_MS)
    })
  }
  const chip = (id: string) => copied === id && <span key={id} className="pf-copy-chip pointer-events-none absolute right-1 top-1/2 z-[6] -translate-y-1/2 rounded bg-ink-900 px-1.5 py-0.5 text-[10.5px] font-semibold text-white shadow">Copied</span>
  const pages = Math.max(1, Math.ceil(rows.length / pageSize))
  useEffect(() => setPage(0), [rows.length])
  const view = rows.slice(page * pageSize, page * pageSize + pageSize)
  const scrolledRef = useRef(false)
  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const away = e.currentTarget.scrollLeft > 0 || e.currentTarget.scrollTop > 0
    if (away !== scrolledRef.current) { scrolledRef.current = away; onScrolledChange?.(away) }
  }
  const stickyW = 132
  /** Height of the group header row (h-7), so the column header row sticks just under it. */
  const GROUP_ROW_PX = 28
  // Fixed columns: each its own width, each placed after the widths before it.
  const widthOf = (i: number) => stickyWidths?.[i] ?? stickyW
  const leftOf = (i: number) => Array.from({ length: i }, (_, j) => widthOf(j)).reduce((a, b) => a + b, 0)
  const fixed = (i: number) => (i < sticky ? { left: leftOf(i), width: widthOf(i), minWidth: widthOf(i), maxWidth: widthOf(i) } : undefined)
  return (
    <div className="overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface">
      <div className={maxHeight ? 'overflow-auto' : 'overflow-x-auto'} style={maxHeight ? { maxHeight } : undefined} onScroll={onScrolledChange ? onScroll : undefined}>
        <table className="w-full border-separate border-spacing-0 text-[13px]">
          <thead>
            {groups && (
              <tr>
                {groups.map((g, i) => {
                  // A group over the fixed columns is fixed with them; the others keep their name visible just right of
                  // the fixed columns while their columns scroll under it.
                  const start = groups.slice(0, i).reduce((n, x) => n + x.span, 0)
                  const overFixed = start + g.span <= sticky
                  return (
                    <th key={`${g.label}-${i}`} colSpan={g.span} style={overFixed ? { left: leftOf(start) } : undefined}
                      className={`sticky top-0 h-7 whitespace-nowrap border-b border-l border-line bg-alt px-3 py-1 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600 first:border-l-0 ${overFixed ? 'z-40' : 'z-30'}`}>
                      <span className="sticky inline-flex items-center gap-1.5" style={overFixed ? undefined : { left: leftOf(sticky) + 12 }}>{g.label}{g.edit && <Pencil className="size-3" />}</span>
                    </th>
                  )
                })}
                {(trailing?.length ?? 0) + (rowMenu ? 1 : 0) > 0 && <th colSpan={(trailing?.length ?? 0) + (rowMenu ? 1 : 0)} className="sticky top-0 z-30 h-7 border-b border-l border-line bg-alt" />}
              </tr>
            )}
            <tr>
              {cols.map(([label, key], i) => (
                <th
                  key={label}
                  style={{ ...fixed(i), top: groups ? GROUP_ROW_PX : 0 }}
                  className={`sticky overflow-hidden text-ellipsis whitespace-nowrap border-b border-line px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide bg-alt text-ink-600 ${i < sticky ? 'z-20' : 'z-10'} ${i === sticky - 1 ? 'border-r' : ''}`}
                >
                  {editable?.has(key) ? <span className="inline-flex items-center gap-1">{label}<Pencil className="size-3 shrink-0" /></span> : label}
                </th>
              ))}
              {trailing?.map((t) => <th key={t.label} style={{ top: groups ? GROUP_ROW_PX : 0 }} className="sticky z-10 border-b border-line bg-alt px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600">{t.label}</th>)}
              {rowMenu && <th style={{ top: groups ? GROUP_ROW_PX : 0 }} className="sticky right-0 z-20 border-b border-l border-line bg-alt px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600">Action</th>}
            </tr>
          </thead>
          <tbody>
            {view.length === 0 && (
              <tr><td colSpan={cols.length + 2} className="px-4 py-14 text-center text-[13px] text-ink-400">No records match the current search & filters.</td></tr>
            )}
            {view.map((r) => {
              const k = rowKey(r)
              return (
                <tr key={k}
                  onDoubleClick={onRowClick ? () => onRowClick(r) : undefined}
                  onMouseDown={(e) => { if (e.detail > 1) e.preventDefault() }} className={`group ${rowClass?.(r) ?? ''}`}>
                  {cols.map(([label, key, kind], i) => (
                    <td
                      key={label}
                      style={fixed(i)}
                      title={i < sticky ? String(r[key] ?? '') : undefined}
                      onClick={(e) => copyCell(e, `${k}|${i}`)}
                      className={`cursor-copy whitespace-nowrap border-b border-line px-3 py-2.5 transition-colors duration-200 group-hover:bg-canvas ${i < sticky ? 'sticky z-[5] overflow-hidden text-ellipsis bg-surface' : 'relative'} ${i === sticky - 1 ? 'border-r' : ''} ${copied === `${k}|${i}` ? '!bg-primary-soft' : ''}`}
                    >
                      <Cell kind={kind} v={r[key]} />
                      {chip(`${k}|${i}`)}
                    </td>
                  ))}
                  {trailing?.map((t, j) => (
                    <td key={t.label} onClick={(e) => copyCell(e, `${k}|t${j}`)}
                      className={`relative cursor-copy whitespace-nowrap border-b border-line px-3 py-2.5 transition-colors duration-200 group-hover:bg-canvas ${copied === `${k}|t${j}` ? '!bg-primary-soft' : ''}`}>
                      {t.render(r)}{chip(`${k}|t${j}`)}
                    </td>
                  ))}
                  {rowMenu && (
                    <td className="sticky right-0 z-[5] border-b border-l border-line bg-surface px-2 py-1.5 group-hover:bg-canvas" onClick={(e) => e.stopPropagation()}>
                      <div className="relative flex items-center gap-0.5">
                        {/* The pencil (editable row) or eye (view only) opens the row, the same as the double-click / click. */}
                        {onRowClick && (editable && editable.size > 0 && (rowEditable?.(r) ?? true)
                          ? <button title="Edit this row" aria-label="Edit this row" onClick={() => onRowClick(r)} className="pf-press rounded-md p-1.5 text-ink-600 transition-colors duration-150 hover:bg-alt hover:text-ink-900"><Pencil className="size-3.5" /></button>
                          : <button title="View this row" aria-label="View this row" onClick={() => onRowClick(r)} className="pf-press rounded-md p-1.5 text-ink-600 transition-colors duration-150 hover:bg-alt hover:text-ink-900"><Eye className="size-3.5" /></button>)}
                        {onRowHistory && <button title="History: who changed what and when" aria-label="History" onClick={() => onRowHistory(r)} className="pf-press rounded-md p-1.5 text-ink-600 transition-colors duration-150 hover:bg-alt hover:text-ink-900"><History className="size-3.5" /></button>}
                        <RowMenu items={() => rowMenu(r)} />
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[12px] text-ink-600">
        <span>
          <span className="mr-3 hidden text-ink-400 md:inline">{onRowClick ? GRID_HINT.OPEN_AND_COPY : GRID_HINT.COPY}</span>
          <span className="tnum">{rows.length ? page * pageSize + 1 : 0}–{Math.min(rows.length, (page + 1) * pageSize)}</span> of <span className="tnum">{rows.length}</span> records
        </span>
        <div className="flex items-center gap-1">
          <button disabled={page === 0} onClick={() => setPage(page - 1)} className="rounded-md p-1.5 hover:bg-alt disabled:opacity-30"><ChevronLeft className="size-4" /></button>
          {Array.from({ length: pages }, (_, i) => i).filter((i) => i < 2 || i === pages - 1 || Math.abs(i - page) <= 1).map((i, idx, arr) => (
            <span key={i} className="flex items-center">
              {idx > 0 && arr[idx - 1] !== i - 1 && <span className="px-1 text-ink-400">…</span>}
              <button onClick={() => setPage(i)} className={`tnum size-7 rounded-md text-[12px] font-medium ${page === i ? 'border border-line bg-surface text-ink-900 shadow-sm' : 'hover:bg-alt'}`}>{i + 1}</button>
            </span>
          ))}
          <button disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="flex items-center gap-0.5 rounded-md px-2 py-1 font-medium hover:bg-alt disabled:opacity-30">Next <ChevronRight className="size-4" /></button>
        </div>
      </div>
    </div>
  )
}

// Field row used in drawers
export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[150px_1fr] items-start gap-3 py-1.5 text-[13px]">
      <div className="text-ink-600">{label}</div>
      <div className="min-w-0 text-ink-900">{children}</div>
    </div>
  )
}
export const inputCls = fieldCls

/** A multi-line text box with the same look (its own height + padding, so the cursor starts at the first line). */
export const textareaCls = fieldCls.replace('h-9 ', '') + ' min-h-[68px] py-2 leading-5'

/** A date field (our animated calendar, components/pickers.tsx). Value / onChange as YYYY-MM-DD ('' = empty). */
export function DateInput({ value, onChange, className = '' }: { value: string; onChange: (v: string) => void; className?: string }) {
  return <DatePicker value={value} onChange={onChange} className={className} />
}
