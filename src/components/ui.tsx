import { useCallback, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import { Pop, usePopover } from './pickers'
import { TOOLBAR_TEXT } from '../constants/ui'

type Tone = 'ok' | 'warn' | 'crit' | 'info' | 'neutral' | 'primary'

const TONE: Record<Tone, string> = {
  ok: 'bg-ok-soft text-ok',
  warn: 'bg-warn-soft text-warn',
  crit: 'bg-crit-soft text-crit',
  info: 'bg-info-soft text-info',
  primary: 'bg-primary-soft text-primary',
  neutral: 'bg-slate-100 text-slate-600',
}

export function Badge({ tone = 'neutral', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold leading-none ${TONE[tone]}`}
    >
      {children}
    </span>
  )
}

export function Dot({ tone = 'neutral' }: { tone?: Tone }) {
  const c: Record<Tone, string> = {
    ok: 'bg-ok', warn: 'bg-warn', crit: 'bg-crit', info: 'bg-info',
    primary: 'bg-primary', neutral: 'bg-slate-400',
  }
  return <span className={`inline-block size-1.5 rounded-full ${c[tone]}`} />
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-[var(--radius-card)] border border-line bg-surface ${className}`}>
      {children}
    </div>
  )
}

// Serif page title + subtitle + right actions
export function PageTitle({ title, sub, right }: { title: string; sub?: ReactNode; right?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="font-serif text-[28px] font-medium leading-tight text-ink-900">{title}</h1>
        {sub && <p className="mt-1 max-w-2xl text-[13px] text-ink-600">{sub}</p>}
      </div>
      {right && <div className="flex items-center gap-2">{right}</div>}
    </div>
  )
}

// Segmented pill toggle (Material Master pattern)
export function PillToggle<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: { key: T; label: string }[] }) {
  return (
    <div className="inline-flex rounded-md border border-line bg-surface p-0.5">
      {options.map((o) => (
        <button
          key={o.key}
          onClick={() => onChange(o.key)}
          className={`rounded px-3 py-1.5 text-[13px] font-medium transition-colors ${value === o.key ? 'bg-primary text-white' : 'text-ink-600 hover:text-ink-900'}`}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

// Workflow subtabs with count badges
export function SubTabs<T extends string>({ value, onChange, tabs }: { value: T; onChange: (v: T) => void; tabs: { key: T; label: string; count?: number; danger?: boolean }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-line">
      {tabs.map((t) => {
        const active = value === t.key
        return (
          <button
            key={t.key}
            onClick={() => onChange(t.key)}
            className={`-mb-px flex items-center gap-1.5 border-b-2 px-3 py-2 text-[13px] font-medium transition-colors ${
              active ? 'border-primary text-primary' : 'border-transparent text-ink-600 hover:text-ink-900'
            }`}
          >
            {t.label}
            {typeof t.count === 'number' && (
              <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${
                t.danger ? 'bg-crit-soft text-crit' : active ? 'bg-primary-soft text-primary' : 'bg-alt text-ink-600'
              }`}>{t.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}

// Right contextual drawer (~520px)
/** Time of the drawer's slide in / out (ms); the same as .pf-drawer-* in index.css. */
const DRAWER_MS = 250

/**
 * A panel sliding in from the right over a fading backdrop; ✕, a backdrop click and Esc slide it out first, then call
 * onClose. `footer` may be a function getting that same animated close, for its own Close / Cancel buttons.
 */
export function Drawer({
  open, onClose, title, sub, children, footer, wide = false,
}: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode | ((close: () => void) => ReactNode); wide?: boolean }) {
  const [leaving, setLeaving] = useState(false)
  const close = useCallback(() => {
    setLeaving(true)
    setTimeout(() => { setLeaving(false); onClose() }, DRAWER_MS)
  }, [onClose])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close()
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, close])
  if (!open) return null
  const foot = typeof footer === 'function' ? footer(close) : footer
  return (
    <div className={`fixed inset-0 z-50 flex justify-end bg-ink-900/40 backdrop-blur-[1px] ${leaving ? 'pf-backdrop-out' : 'pf-backdrop-in'}`} onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className={`flex h-full w-full ${wide ? 'max-w-[880px]' : 'max-w-[540px]'} flex-col border-l border-line bg-surface shadow-2xl ${leaving ? 'pf-drawer-out' : 'pf-drawer-in'}`}>
        <div className="flex items-start justify-between border-b border-line px-5 py-4">
          <div className="min-w-0">
            <div className="text-[15px] font-semibold text-ink-900">{title}</div>
            {sub && <div className="mt-0.5 text-[12px] text-ink-600">{sub}</div>}
          </div>
          <button onClick={close} className="rounded-md p-1 text-ink-400 hover:bg-alt hover:text-ink-900">✕</button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {foot && <div className="flex items-center justify-end gap-2 border-t border-line bg-alt/40 px-5 py-3">{foot}</div>}
      </div>
    </div>
  )
}

export function KPI({
  label, value, unit, delta, tone = 'neutral', hint,
}: {
  label: string; value: string; unit?: string; delta?: string; tone?: Tone; hint?: string
}) {
  const deltaTone = tone === 'crit' ? 'text-crit' : tone === 'ok' ? 'text-ok' : tone === 'warn' ? 'text-warn' : 'text-slate-500'
  return (
    <Card className="p-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide text-slate-500">
        <Dot tone={tone} /> {label}
      </div>
      <div className="mt-2 flex items-baseline gap-1">
        <span className="tnum text-2xl font-semibold text-ink-900">{value}</span>
        {unit && <span className="text-xs font-medium text-slate-400">{unit}</span>}
      </div>
      <div className="mt-1 flex items-center justify-between text-[11px]">
        {delta ? <span className={`tnum font-semibold ${deltaTone}`}>{delta}</span> : <span />}
        {hint && <span className="text-slate-400">{hint}</span>}
      </div>
    </Card>
  )
}

export function SectionHeader({ title, sub, right }: { title: string; sub?: string; right?: ReactNode }) {
  return (
    <div className="flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[15px] font-semibold text-ink-900">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
      </div>
      {right}
    </div>
  )
}

export function Th({ children, right = false }: { children: ReactNode; right?: boolean }) {
  return (
    <th className={`whitespace-nowrap px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-slate-500 ${right ? 'text-right' : 'text-left'}`}>
      {children}
    </th>
  )
}

export function Td({ children, right = false, mono = false, className = '' }: { children: ReactNode; right?: boolean; mono?: boolean; className?: string }) {
  return (
    <td className={`whitespace-nowrap px-3 py-2.5 text-[13px] ${right ? 'text-right' : ''} ${mono ? 'tnum' : ''} ${className}`}>
      {children}
    </td>
  )
}

// ---- Buttons ----------------------------------------------------------
export function Button({
  children, variant = 'default', onClick, icon, disabled,
}: { children: ReactNode; variant?: 'default' | 'primary' | 'ghost'; onClick?: () => void; icon?: ReactNode; disabled?: boolean }) {
  const v =
    variant === 'primary'
      ? 'bg-primary text-white hover:opacity-90 border-transparent'
      : variant === 'ghost'
      ? 'bg-transparent text-primary hover:bg-primary-soft/60 border-transparent'
      : 'bg-surface text-ink-900 hover:bg-slate-50 border-line'
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-xs font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${v}`}
    >
      {icon}
      {children}
    </button>
  )
}

// ---- Data toolbar (Columns / Filters / Density / Export / Bulk) -------
export type Density = 'comfortable' | 'compact'

/*
 * Columns / Filters / Density work only when the page passes what they need (user, 2026-10-16: they looked clickable
 * but did nothing); without it the button is shown disabled.
 */
export function Toolbar({
  total, onExport, onBulk, right, columns, filtersOpen, activeFilters = 0, onToggleFilters, density, onDensity,
}: {
  total?: number; onExport?: () => void; onBulk?: () => void; right?: ReactNode
  /** Show / hide columns: every column's label, the hidden ones, and the ones that can't be hidden. */
  columns?: { all: string[]; hidden: ReadonlySet<string>; locked?: ReadonlySet<string>; onToggle: (label: string) => void }
  filtersOpen?: boolean; activeFilters?: number; onToggleFilters?: () => void
  density?: Density; onDensity?: (d: Density) => void
}) {
  const cols = usePopover()
  const Item = ({ label, icon, onClick, on = false, badge }: { label: string; icon: string; onClick?: () => void; on?: boolean; badge?: number }) => (
    <button onClick={onClick} disabled={!onClick} title={onClick ? undefined : TOOLBAR_TEXT.NOT_HERE}
      className={`inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-primary-soft/60 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-transparent ${on ? 'bg-primary-soft' : ''}`}>
      <span className="text-sm leading-none">{icon}</span> {label}
      {!!badge && <span className="rounded-full bg-primary px-1.5 py-0.5 text-[10px] font-semibold leading-none text-white">{badge}</span>}
    </button>
  )
  return (
    <div className="flex flex-wrap items-center gap-1 border-b border-line px-3 py-2">
      <div ref={cols.ref} className="relative">
        <Item label="Columns" icon="▚" onClick={columns ? cols.toggle : undefined} on={cols.open} badge={columns?.hidden.size} />
        {columns && cols.open && (
          <Pop leaving={cols.leaving} className="max-h-72 w-56 overflow-y-auto">
            {columns.all.map((c) => {
              const locked = columns.locked?.has(c)
              return (
                <label key={c} className={`flex items-center gap-2 rounded px-2 py-1.5 text-[13px] ${locked ? 'text-ink-400' : 'cursor-pointer hover:bg-alt'}`}>
                  <input type="checkbox" checked={!columns.hidden.has(c)} disabled={locked} onChange={() => columns.onToggle(c)} className="accent-[var(--color-primary)]" />
                  {c}
                </label>
              )
            })}
          </Pop>
        )}
      </div>
      <Item label="Filters" icon="⧩" onClick={onToggleFilters} on={filtersOpen || activeFilters > 0} badge={activeFilters} />
      <Item label={density === 'compact' ? 'Compact' : 'Density'} icon="≡" on={density === 'compact'}
        onClick={onDensity ? () => onDensity(density === 'compact' ? 'comfortable' : 'compact') : undefined} />
      <Item label="Export" icon="↓" onClick={onExport} />
      {typeof total === 'number' && <span className="ml-2 text-[11px] text-slate-400">Total: {total.toLocaleString('en-IN')} items</span>}
      <div className="ml-auto flex items-center gap-2">
        {right}
        <Button variant="default" icon={<span>↑</span>} onClick={onBulk}>Bulk Upload</Button>
      </div>
    </div>
  )
}

// ---- Modal ------------------------------------------------------------
export function Modal({
  open, onClose, title, sub, children, footer, wide = false,
}: { open: boolean; onClose: () => void; title: ReactNode; sub?: ReactNode; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    if (open) document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink-900/40 p-4 backdrop-blur-[1px]" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div ref={ref} className={`mt-[6vh] w-full ${wide ? 'max-w-4xl' : 'max-w-lg'} rounded-[var(--radius)] border border-line bg-surface shadow-xl`}>
        <div className="flex items-start justify-between border-b border-line px-5 py-3.5">
          <div>
            <h3 className="text-[15px] font-semibold text-ink-900">{title}</h3>
            {sub && <p className="mt-0.5 text-xs text-slate-500">{sub}</p>}
          </div>
          <button onClick={onClose} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-ink-900">✕</button>
        </div>
        <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
      </div>
    </div>
  )
}

// ---- Bulk upload drop zone (prototype) --------------------------------
export function BulkUpload({ open, onClose, entity, onDownloadTemplate }: { open: boolean; onClose: () => void; entity: string; onDownloadTemplate?: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Bulk upload — ${entity}`}
      sub="Upload a CSV to create or update rows in bulk. Existing rows matched by key are updated."
      footer={<>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="primary" onClick={onClose}>Validate & import</Button>
      </>}
    >
      <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-line bg-canvas py-10 text-center hover:border-primary">
        <span className="text-2xl">↑</span>
        <span className="text-[13px] font-medium text-ink-900">Drop CSV here or click to browse</span>
        <span className="text-[11px] text-slate-400">.csv, .xlsx · PO numbers preserved as text · match keys trimmed & case-folded</span>
        <input type="file" accept=".csv,.xlsx" className="hidden" />
      </label>
      <button onClick={onDownloadTemplate} className="mt-3 text-xs font-semibold text-primary hover:underline">↓ Download CSV template</button>
    </Modal>
  )
}

// ---- CSV download (prototype) -----------------------------------------
export function downloadCsv(filename: string, headers: string[], rows: (string | number)[][]) {
  const esc = (v: string | number) => {
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const csv = [headers, ...rows].map((r) => r.map(esc).join(',')).join('\n')
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}
