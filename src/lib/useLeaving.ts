import { useRef, useState } from 'react'

/** Shown / hidden with a closing animation: hide() keeps it on screen for `ms` with leaving = true, then removes it. */
export function useLeaving(ms: number) {
  const [shown, setShown] = useState(false)
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const show = () => {
    if (timer.current) clearTimeout(timer.current)
    timer.current = null
    setLeaving(false)
    setShown(true)
  }
  const hide = () => {
    if (!shown || timer.current) return
    setLeaving(true)
    timer.current = setTimeout(() => { timer.current = null; setShown(false); setLeaving(false) }, ms)
  }
  return { shown, leaving, show, hide }
}
