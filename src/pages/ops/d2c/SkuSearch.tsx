import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { ChevronDown, Search } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { searchSkus, type D2cSku } from '../../../api/d2cTransfers'
import { SEARCH_DELAY_MS } from '../../../constants/poOverview'
import { D2C_KEY } from '../../../lib/liveTransfers'
import { money } from './format'

/*
 * The SKU picker of the transfer form (GET /d2c-transfers/skus?q=: active, not a combo, with an MRP; at most 50 per
 * search). A field showing the picked code + name; the list opens over the page (portal) with a search box.
 */

const PANEL_W = 380
const PANEL_H = 300

export function SkuSearch({ value, label, onPick, invalid }: { value: string; label: string | null; onPick: (s: D2cSku) => void; invalid?: boolean }) {
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null)
  const [q, setQ] = useState('')
  const [term, setTerm] = useState('')
  const [active, setActive] = useState(0)
  const btn = useRef<HTMLButtonElement>(null)
  const box = useRef<HTMLDivElement>(null)
  useEffect(() => { const t = setTimeout(() => setTerm(q.trim()), SEARCH_DELAY_MS); return () => clearTimeout(t) }, [q])
  const found = useQuery({ queryKey: [D2C_KEY, 'skus', term], queryFn: ({ signal }) => searchSkus(term, signal), enabled: !!pos, staleTime: 60_000 })
  const list = found.data ?? []
  const open = () => {
    const r = btn.current!.getBoundingClientRect()
    const width = Math.max(r.width, Math.min(PANEL_W, window.innerWidth - 16))
    const up = r.bottom + PANEL_H + 8 > window.innerHeight && r.top - PANEL_H - 8 > 0
    setQ('')
    setActive(0)
    setPos({ top: up ? r.top - PANEL_H - 4 : r.bottom + 4, left: Math.min(Math.max(8, r.left), window.innerWidth - width - 8), width })
  }
  const close = () => setPos(null)
  const pick = (s: D2cSku) => { onPick(s); close(); btn.current?.focus() }
  useEffect(() => {
    if (!pos) return
    const onDown = (e: MouseEvent) => { const t = e.target as Node; if (!box.current?.contains(t) && !btn.current?.contains(t)) close() }
    const onScroll = (e: Event) => { if (!box.current?.contains(e.target as Node)) close() }
    document.addEventListener('mousedown', onDown)
    window.addEventListener('scroll', onScroll, true)
    return () => { document.removeEventListener('mousedown', onDown); window.removeEventListener('scroll', onScroll, true) }
  }, [pos])
  return (
    <>
      <button ref={btn} type="button" onClick={() => (pos ? close() : open())}
        className={`flex h-9 w-full min-w-0 items-center gap-2 rounded-[var(--radius)] border bg-surface px-2.5 text-left text-[13px] ${invalid ? 'border-crit' : pos ? 'border-primary ring-2 ring-primary/15' : 'border-line hover:border-ink-400'}`}>
        {value
          ? <span className="min-w-0 flex-1 truncate"><span className="font-mono text-[12.5px]">{value}</span>{label && <span className="text-ink-600"> · {label}</span>}</span>
          : <span className="min-w-0 flex-1 truncate text-ink-400">Select SKU…</span>}
        <ChevronDown className="size-3.5 shrink-0 text-ink-400" />
      </button>
      {pos && createPortal(
        <div ref={box} style={{ top: pos.top, left: pos.left, width: pos.width }}
          className="pf-pop-in fixed z-[100] flex max-h-[300px] flex-col rounded-[var(--radius)] border border-line bg-surface p-1 shadow-lg"
          onKeyDown={(e) => {
            if (e.key === 'Escape') { e.stopPropagation(); close() }
            if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(list.length - 1, i + 1)) }
            if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(0, i - 1)) }
            if (e.key === 'Enter' && list[active]) { e.preventDefault(); pick(list[active]) }
          }}>
          <label className="mb-1 flex items-center gap-2 border-b border-line px-2 pb-1.5 pt-1">
            <Search className="size-3.5 text-ink-400" />
            <input autoFocus value={q} onChange={(e) => { setQ(e.target.value); setActive(0) }} placeholder="Type a SKU code or name…" className="w-full bg-transparent text-[13px] outline-none" />
          </label>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {found.isFetching && !list.length && <div className="px-2 py-1.5 text-[12.5px] text-ink-400">Searching…</div>}
            {found.error && <div className="px-2 py-1.5 text-[12.5px] text-crit">{found.error.message}</div>}
            {!found.isFetching && !found.error && !list.length && <div className="px-2 py-1.5 text-[12.5px] text-ink-400">No active SKU with an MRP matches</div>}
            {list.map((s, i) => (
              <button type="button" key={s.code} onMouseEnter={() => setActive(i)} onClick={() => pick(s)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[13px] ${i === active ? 'bg-alt' : ''}`}>
                <span className="font-mono text-[12.5px]">{s.code}</span>
                <span className="min-w-0 flex-1 truncate text-ink-600">{s.name}</span>
                <span className="tnum shrink-0 text-[11.5px] text-ink-400">MRP {money(s.mrp)}</span>
              </button>
            ))}
          </div>
        </div>,
        document.body,
      )}
    </>
  )
}
