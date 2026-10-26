import { useEffect, useMemo, useRef, useState } from 'react'
import type { KeyboardEvent, ReactNode } from 'react'
import { Calendar, Check, ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide-react'

/*
 * Our own dropdown list and calendar (2026-10-14): the browser's <select> list and date picker can't be animated, so
 * these open with a short fade-and-drop and close the same way (.pf-pop-in / .pf-pop-out in index.css), and look like
 * the rest of the app. Both close on Esc and on a click outside. Values: a string ('' = empty); dates YYYY-MM-DD.
 */

/** Time of the open / close animation (ms), the same as .pf-pop-* in index.css. */
const POP_MS = 150
/** Lists longer than this get a search box. */
const SEARCH_FROM = 10
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']
const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']

const boxCls = (open: boolean) =>
  `flex h-9 w-full items-center gap-2 rounded-[var(--radius)] border bg-surface px-3 text-left text-[13px] outline-none transition-[border-color,box-shadow] duration-200 ease-out ${open ? 'border-primary ring-2 ring-primary/15' : 'border-line hover:border-ink-400'}`

/** Open / close state with a closing animation and outside-click / Esc closing. */
export function usePopover() {
  const [open, setOpen] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const close = () => {
    if (!open || leaving) return
    setLeaving(true)
    setTimeout(() => { setOpen(false); setLeaving(false) }, POP_MS)
  }
  const toggle = () => (open ? close() : setOpen(true))
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) close() }
    const onKey = (e: globalThis.KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey, true)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey, true) }
  })
  return { open, leaving, ref, close, toggle, setOpen }
}

/** The floating panel under a field. */
export function Pop({ leaving, children, className = '' }: { leaving: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={`absolute left-0 z-40 mt-1 origin-top rounded-[var(--radius)] border border-line bg-surface p-1 shadow-lg ${leaving ? 'pf-pop-out' : 'pf-pop-in'} ${className}`}>
      {children}
    </div>
  )
}

/** A single-choice dropdown (search box for long lists, arrow keys + Enter, a "—" row to empty it). */
export function SelectBox({ value, options, onChange, placeholder = '—', allowEmpty = true }: {
  value: string; options: readonly string[]; onChange: (v: string) => void; placeholder?: string; allowEmpty?: boolean
}) {
  const p = usePopover()
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const list = useMemo(() => {
    const f = q.trim().toLowerCase()
    const shown = f ? options.filter((o) => o.toLowerCase().includes(f)) : [...options]
    return allowEmpty && !f ? ['', ...shown] : shown
  }, [options, q, allowEmpty])
  useEffect(() => { if (p.open) { setQ(''); setActive(Math.max(0, list.indexOf(value))) } }, [p.open]) // eslint-disable-line react-hooks/exhaustive-deps
  const pick = (v: string) => { onChange(v); p.close() }
  const onKey = (e: KeyboardEvent) => {
    if (!p.open && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); p.setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(list.length - 1, i + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    if (e.key === 'Enter' && list[active] !== undefined) { e.preventDefault(); pick(list[active]) }
  }
  return (
    <div ref={p.ref} className="relative" onKeyDown={onKey}>
      <button type="button" onClick={p.toggle} className={boxCls(p.open)}>
        <span className={`min-w-0 flex-1 truncate ${value ? 'text-ink-900' : 'text-ink-400'}`}>{value || placeholder}</span>
        <ChevronDown className={`size-3.5 shrink-0 text-ink-400 transition-transform duration-150 ${p.open && !p.leaving ? 'rotate-180' : ''}`} />
      </button>
      {p.open && (
        <Pop leaving={p.leaving} className="w-full min-w-[200px]">
          {options.length > SEARCH_FROM && (
            <label className="mb-1 flex items-center gap-2 border-b border-line px-2 pb-1.5 pt-1">
              <Search className="size-3.5 text-ink-400" />
              <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0) }} placeholder="Search…" className="w-full bg-transparent text-[13px] outline-none" />
            </label>
          )}
          <div className="max-h-60 overflow-y-auto">
            {list.length === 0 && <div className="px-2 py-1.5 text-[12.5px] text-ink-400">No match</div>}
            {list.map((o, i) => (
              <button type="button" key={o || '__empty'} onMouseEnter={() => setActive(i)} onClick={() => pick(o)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] ${i === active ? 'bg-alt' : ''} ${o ? 'text-ink-900' : 'text-ink-400'}`}>
                <span className="min-w-0 flex-1 truncate">{o || '— (empty)'}</span>
                {o === value && o && <Check className="size-3.5 text-primary" />}
              </button>
            ))}
          </div>
        </Pop>
      )}
    </div>
  )
}

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
const todayIso = () => { const t = new Date(); return iso(t.getFullYear(), t.getMonth(), t.getDate()) }
const shown = (v: string) => { const [y, m, d] = v.split('-'); return `${d}-${m}-${y}` }

/** A date field with our calendar: click anywhere to open it, the icon at the end, Today / Clear. */
export function DatePicker({ value, onChange, placeholder = 'Pick a date', className = '' }: {
  value: string; onChange: (v: string) => void; placeholder?: string; className?: string
}) {
  const p = usePopover()
  const start = value || todayIso()
  const [view, setView] = useState({ y: Number(start.slice(0, 4)), m: Number(start.slice(5, 7)) - 1 })
  useEffect(() => { if (p.open) { const s = value || todayIso(); setView({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1 }) } }, [p.open]) // eslint-disable-line react-hooks/exhaustive-deps
  const first = new Date(view.y, view.m, 1)
  const lead = (first.getDay() + 6) % 7 // Monday first
  const days = new Date(view.y, view.m + 1, 0).getDate()
  const cells = [...Array(lead).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)]
  const move = (n: number) => setView((v) => { const d = new Date(v.y, v.m + n, 1); return { y: d.getFullYear(), m: d.getMonth() } })
  const pick = (v: string) => { onChange(v); p.close() }
  const today = todayIso()
  return (
    <div ref={p.ref} className="relative">
      <button type="button" onClick={p.toggle} className={`${boxCls(p.open)} ${className}`}>
        <span className={`min-w-0 flex-1 truncate ${value ? 'text-ink-900' : 'text-ink-400'}`}>{value ? shown(value) : placeholder}</span>
        {value && <X className="size-3.5 shrink-0 text-ink-400 hover:text-ink-900" onClick={(e) => { e.stopPropagation(); onChange('') }} />}
        <Calendar className="size-3.5 shrink-0 text-ink-400" />
      </button>
      {p.open && (
        <Pop leaving={p.leaving} className="w-[264px] p-2">
          <div className="mb-1 flex items-center justify-between">
            <button type="button" onClick={() => move(-1)} className="rounded p-1 text-ink-600 hover:bg-alt"><ChevronLeft className="size-4" /></button>
            <div className="text-[13px] font-semibold text-ink-900">{MONTHS[view.m]} {view.y}</div>
            <button type="button" onClick={() => move(1)} className="rounded p-1 text-ink-600 hover:bg-alt"><ChevronRight className="size-4" /></button>
          </div>
          <div className="grid grid-cols-7 gap-0.5 text-center text-[11px] text-ink-400">
            {WEEKDAYS.map((w) => <div key={w} className="py-1">{w}</div>)}
          </div>
          <div key={`${view.y}-${view.m}`} className="pf-tab-in grid grid-cols-7 gap-0.5 text-center text-[12.5px]">
            {cells.map((d, i) => {
              if (d === null) return <div key={`e${i}`} />
              const v = iso(view.y, view.m, d)
              const on = v === value
              return (
                <button type="button" key={v} onClick={() => pick(v)}
                  className={`h-8 rounded transition-colors ${on ? 'bg-primary font-semibold text-white' : v === today ? 'font-semibold text-primary hover:bg-alt' : 'text-ink-900 hover:bg-alt'}`}>{d}</button>
              )
            })}
          </div>
          <div className="mt-1 flex justify-between border-t border-line pt-1.5 text-[12px]">
            <button type="button" onClick={() => pick('')} className="rounded px-2 py-1 text-ink-600 hover:bg-alt">Clear</button>
            <button type="button" onClick={() => pick(today)} className="rounded px-2 py-1 font-semibold text-primary hover:bg-alt">Today</button>
          </div>
        </Pop>
      )}
    </div>
  )
}

export interface OptionGroup {
  label: string
  items: { value: string; label: string }[]
  /** Folded until its title is clicked (user, 2026-10-22: API / Email are rarely used, keep them inside). */
  collapsible?: boolean
}

/**
 * A single-choice dropdown with groups (2026-10-22, Manual Upload channels: Recent, then API / Email folded): the same
 * look and open / close animation as SelectBox. A search box on top looks through every group (groups with a match
 * open by themselves); a folded group opens / closes smoothly on a click of its title; arrow keys + Enter move through
 * the items that are showing. Empty groups are left out.
 */
export function GroupedSelect({ value, groups, onChange, placeholder = '—' }: {
  value: string; groups: OptionGroup[]; onChange: (v: string) => void; placeholder?: string
}) {
  const p = usePopover()
  const [q, setQ] = useState('')
  const [open, setOpen] = useState<Set<string>>(new Set())
  const [active, setActive] = useState(0)
  const f = q.trim().toLowerCase()
  const shown = groups
    .map((g) => ({ ...g, items: f ? g.items.filter((it) => it.label.toLowerCase().includes(f)) : g.items }))
    .filter((g) => g.items.length)
  // Searching opens every group with a match; otherwise a folded group shows only when opened.
  const isOpen = (g: OptionGroup) => !g.collapsible || !!f || open.has(g.label)
  const visible = shown.flatMap((g) => (isOpen(g) ? g.items : []))
  const all = groups.flatMap((g) => g.items)
  useEffect(() => {
    if (!p.open) return
    setQ('')
    // The picked channel's folded group opens with the list, so the tick is in view.
    const home = groups.find((g) => g.collapsible && g.items.some((it) => it.value === value))
    setOpen(home ? new Set([home.label]) : new Set())
    setActive(0)
  }, [p.open]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => setActive(0), [f])
  const current = all.find((it) => it.value === value)
  const pick = (v: string) => { onChange(v); p.close() }
  const toggleGroup = (label: string) => setOpen((s) => { const x = new Set(s); if (x.has(label)) x.delete(label); else x.add(label); return x })
  const onKey = (e: KeyboardEvent) => {
    if (!p.open && (e.key === 'ArrowDown' || e.key === 'Enter')) { e.preventDefault(); p.setOpen(true); return }
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(visible.length - 1, i + 1)) }
    if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
    if (e.key === 'Enter' && visible[active]) { e.preventDefault(); pick(visible[active].value) }
  }
  let n = 0
  return (
    <div ref={p.ref} className="relative" onKeyDown={onKey}>
      <button type="button" onClick={p.toggle} className={boxCls(p.open)}>
        <span className={`min-w-0 flex-1 truncate ${current ? 'text-ink-900' : 'text-ink-400'}`}>{current?.label ?? placeholder}</span>
        <ChevronDown className={`size-3.5 shrink-0 text-ink-400 transition-transform duration-150 ${p.open && !p.leaving ? 'rotate-180' : ''}`} />
      </button>
      {p.open && (
        <Pop leaving={p.leaving} className="w-full min-w-[260px]">
          <label className="mb-1 flex items-center gap-2 border-b border-line px-2 pb-1.5 pt-1">
            <Search className="size-3.5 text-ink-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search…" className="w-full bg-transparent text-[13px] outline-none" />
            {q && <X className="size-3.5 shrink-0 cursor-pointer text-ink-400 hover:text-ink-900" onClick={() => setQ('')} />}
          </label>
          <div className="max-h-80 overflow-y-auto">
            {!shown.length && <div className="px-2 py-1.5 text-[12.5px] text-ink-400">No match</div>}
            {shown.map((g, gi) => {
              const expanded = isOpen(g)
              const items = g.items.map((it) => {
                const i = expanded ? n++ : -1
                return (
                  <button type="button" key={`${g.label}:${it.value}`} onMouseEnter={() => i >= 0 && setActive(i)} onClick={() => pick(it.value)}
                    className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] text-ink-900 transition-colors duration-100 ${i === active ? 'bg-alt' : ''} ${g.collapsible ? 'pl-5' : ''}`}>
                    <span className="min-w-0 flex-1 truncate">{it.label}</span>
                    {it.value === value && <Check className="size-3.5 shrink-0 text-primary" />}
                  </button>
                )
              })
              return (
                <div key={g.label} className={gi ? 'mt-1 border-t border-line pt-1' : ''}>
                  {g.collapsible ? (
                    <button type="button" onClick={() => toggleGroup(g.label)}
                      className="flex w-full items-center gap-1.5 rounded px-2 py-1.5 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600 hover:bg-alt">
                      <ChevronRight className={`size-3.5 transition-transform duration-200 ${expanded ? 'rotate-90' : ''}`} />
                      <span className="flex-1">{g.label}</span>
                      <span className="rounded-full bg-alt px-1.5 text-[10px] text-ink-400">{g.items.length}</span>
                    </button>
                  ) : (
                    <div className="px-2 pb-0.5 pt-1 text-[10.5px] font-semibold uppercase tracking-wide text-ink-400">{g.label}</div>
                  )}
                  {/* Height animates from 0 to its content: grid rows 0fr -> 1fr. */}
                  <div className={`grid transition-[grid-template-rows,opacity] duration-200 ease-out ${expanded ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
                    <div className="overflow-hidden">{items}</div>
                  </div>
                </div>
              )
            })}
          </div>
        </Pop>
      )}
    </div>
  )
}
