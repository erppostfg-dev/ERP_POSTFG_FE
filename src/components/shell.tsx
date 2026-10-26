import { useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'

/*
 * App-shell helpers (2026-10-14):
 *   - Reveal: shows / hides its content with a smooth height + fade (filter panels), keeping it mounted while it closes.
 * (The sidebar collapses on wide-table pages through RAIL_PAGES in constants/pages.ts.)
 */

/** Time of the shell's open / close animations (ms), the same as the CSS `duration-300`. */
export const ANIMATION_MS = 300

export function Reveal({ open, children }: { open: boolean; children: ReactNode }) {
  const [render, setRender] = useState(open)
  const [shown, setShown] = useState(open)
  // Clip only while the height animates: an open panel must let its dropdowns / calendars hang outside it.
  const [settled, setSettled] = useState(open)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  useEffect(() => {
    clearTimeout(timer.current)
    if (open) {
      setRender(true)
      return
    }
    setShown(false)
    setSettled(false)
    timer.current = setTimeout(() => setRender(false), ANIMATION_MS)
    return () => clearTimeout(timer.current)
  }, [open])
  // Opening: the panel must first be painted closed, or the browser has nothing to animate from. Two frames: the first
  // paints it closed, the second starts the transition to open.
  useEffect(() => {
    if (!render || !open || shown) return
    let second = 0
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setShown(true)) })
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second) }
  }, [render, open, shown])
  // Once open, stop clipping, so dropdowns / calendars can hang outside the panel. (Its own effect: the timer used to
  // live in the effect above, whose cleanup cancelled it as soon as `shown` turned true, so the panel stayed clipped.)
  useEffect(() => {
    if (!open || !shown) return
    const t = setTimeout(() => setSettled(true), ANIMATION_MS + 50)
    return () => clearTimeout(t)
  }, [open, shown])
  if (!render) return null
  return (
    <div className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${shown ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
      <div className={`min-h-0 ${settled ? 'overflow-visible' : 'overflow-hidden'}`}>{children}</div>
    </div>
  )
}
