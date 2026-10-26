import { useEffect, useState } from 'react'
import { ChevronDown, ChevronUp, Search } from 'lucide-react'
import { FILE_VIEWER_TEXT, FIND_DEBOUNCE_MS } from '../constants/poReview'

/*
 * The search box in the top bar of the file viewer (2026-10-21, user: search on top for every type): typing, a status
 * ("3 of 12", "No matches", a note), ↑ / ↓ to jump; Enter = next, Shift+Enter = previous.
 */

/** The value after typing has paused for FIND_DEBOUNCE_MS. */
export function useDebounced<T>(value: T, ms = FIND_DEBOUNCE_MS) {
  const [v, setV] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms)
    return () => clearTimeout(t)
  }, [value, ms])
  return v
}

const btn = 'rounded p-0.5 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30 disabled:hover:bg-transparent'

export function FindBox({ value, onChange, placeholder, status, onPrev, onNext, disabled = false }: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  /** Shown after the box: "3 of 12", "No matches", "12 rows" … */
  status?: string
  /** Jump to the previous / next match; buttons hidden when not given (tables filter instead). */
  onPrev?: () => void
  onNext?: () => void
  disabled?: boolean
}) {
  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return
    e.preventDefault()
    if (e.shiftKey) onPrev?.()
    else onNext?.()
  }
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <label className={`flex items-center gap-1.5 rounded bg-black/30 px-2 py-1 focus-within:ring-1 focus-within:ring-white/40 ${disabled ? 'opacity-50' : ''}`}>
        <Search className="size-3.5 text-white/60" />
        <input value={value} onChange={(e) => onChange(e.target.value)} onKeyDown={onKey} placeholder={placeholder} disabled={disabled}
          className="w-44 bg-transparent text-[12px] text-white outline-none placeholder:text-white/50 disabled:cursor-not-allowed" />
      </label>
      {status && <span className="tnum min-w-12 text-[12px] whitespace-nowrap text-white/70">{status}</span>}
      {onPrev && onNext && (
        <>
          <button type="button" onClick={onPrev} disabled={disabled} title={FILE_VIEWER_TEXT.PREV} className={btn}><ChevronUp className="size-4" /></button>
          <button type="button" onClick={onNext} disabled={disabled} title={FILE_VIEWER_TEXT.NEXT} className={btn}><ChevronDown className="size-4" /></button>
        </>
      )}
    </div>
  )
}

/** Every place `q` (lower case) appears in `text`, case-insensitive. */
export function findAll(text: string, q: string): number[] {
  const out: number[] = []
  if (!q) return out
  const low = text.toLowerCase()
  for (let i = low.indexOf(q); i !== -1; i = low.indexOf(q, i + q.length)) out.push(i)
  return out
}

/**
 * A search asked for from outside the viewer (2026-10-22: a click on a processed.json value in the Verify panel):
 * any of `terms` (spellings of one value), matched as whole words / numbers; `seq` changes on every click so the same
 * value can be asked again. The viewer answers through FindResult: how many places it found (null = this file has no
 * searchable text, e.g. an image or a scanned PDF).
 */
export type ExternalFind = { terms: string[]; seq: number }
export type FindResult = (found: number | null) => void

const isWordChar = (c: string | undefined) => !!c && /[\p{L}\p{N}]/u.test(c)

/** Places where `term` (lower case) stands on its own in `text`: not inside a longer word or number. */
export function findTerm(text: string, term: string): number[] {
  return findAll(text, term).filter((i) => {
    const before = text[i - 1]
    const after = text[i + term.length]
    if (isWordChar(term[0]) && isWordChar(before)) return false
    if (isWordChar(term[term.length - 1]) && isWordChar(after)) return false
    // "17" must not match the "17" of "17.5" (but may match "17.00" or "17,"): a decimal point followed by a non-zero digit.
    if (/\d$/.test(term) && after === '.' && /[1-9]/.test(text.slice(i + term.length + 1).match(/^\d+/)?.[0] ?? '')) return false
    return true
  })
}

/** Every match of any of the terms, earliest first, overlaps dropped. */
export function findTerms(text: string, terms: string[]): { start: number; len: number }[] {
  const hits = terms.flatMap((t) => findTerm(text, t).map((start) => ({ start, len: t.length })))
  hits.sort((a, b) => a.start - b.start || b.len - a.len)
  const out: { start: number; len: number }[] = []
  for (const h of hits) if (!out.length || h.start >= out[out.length - 1].start + out[out.length - 1].len) out.push(h)
  return out
}
