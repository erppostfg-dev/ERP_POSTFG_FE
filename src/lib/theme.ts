import { useSyncExternalStore } from 'react'
import { flushSync } from 'react-dom'
import { api } from '../api/client'
import { AUTH_ENDPOINTS } from '../constants/auth'

/*
 * Light / dark mode (2026-11-26, user). Saved on the person's account (users.theme, PUT /auth/me/preferences) so it
 * follows them to any device; GET /auth/me brings it back at sign-in (fromAccount). A copy is kept in this browser
 * (localStorage, safe when blocked) only so index.html / bulk.html can paint the right mode before the app loads (no
 * white flash at night). Set as <html data-theme="dark">; index.css gives the colour tokens their dark values. Light
 * is the default (what everyone uses today).
 *
 * The switch is ONE movement for the whole screen (user: "not smooth, some come at once, some after"): with the
 * browser's View Transitions the new mode spreads out in a circle from the sky switch (sunrise / sunset), every part
 * of the page together; without them, one even cross-fade of the colours. Reduced motion = instant.
 */

export type Theme = 'light' | 'dark'
const THEME_KEY = 'pf-theme'
const REVEAL_MS = 900
const FADE_MS = 600

const read = (): Theme => {
  try { return localStorage.getItem(THEME_KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

const listeners = new Set<() => void>()

const paint = (t: Theme): void => {
  const root = document.documentElement
  if (t === 'dark') root.dataset.theme = 'dark'
  else delete root.dataset.theme
  root.style.colorScheme = t
}

const keep = (t: Theme): void => {
  try { localStorage.setItem(THEME_KEY, t) } catch { /* storage blocked: works for this tab only */ }
  paint(t)
  for (const fn of listeners) fn()
}

type ViewTransitionDoc = Document & { startViewTransition?: (cb: () => void) => { ready: Promise<void> } }
const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

/** Where the switch was clicked: the circle starts there. */
export interface Origin { x: number; y: number }

const animateTo = (t: Theme, origin?: Origin): void => {
  const doc = document as ViewTransitionDoc
  if (reducedMotion()) { keep(t); return }
  if (doc.startViewTransition) {
    // the whole page is pictured before and after; React draws the new state inside the callback (flushSync) so the
    // switch's knob is already on its new side in the "after" picture
    const vt = doc.startViewTransition(() => { flushSync(() => keep(t)) })
    const x = origin?.x ?? window.innerWidth - 40
    const y = origin?.y ?? 28
    const r = Math.hypot(Math.max(x, window.innerWidth - x), Math.max(y, window.innerHeight - y))
    void vt.ready.then(() => {
      document.documentElement.animate(
        { clipPath: [`circle(14px at ${x}px ${y}px)`, `circle(${r}px at ${x}px ${y}px)`] },
        { duration: REVEAL_MS, easing: 'cubic-bezier(0.65, 0, 0.35, 1)', pseudoElement: '::view-transition-new(root)' },
      )
      // the old picture softens a little as the circle passes, so the edge never looks hard
      document.documentElement.animate(
        { opacity: [1, 0.85] },
        { duration: REVEAL_MS, easing: 'ease-in-out', pseudoElement: '::view-transition-old(root)' },
      )
    }).catch(() => undefined)
    return
  }
  // older browsers: every colour eases over the same time
  const root = document.documentElement
  root.classList.add('pf-theme-switching')
  keep(t)
  window.setTimeout(() => root.classList.remove('pf-theme-switching'), FADE_MS + 50)
}

/** The person clicked the switch: change smoothly, then save it on their account (a failed save keeps it here). */
export const setTheme = (t: Theme, origin?: Origin): void => {
  animateTo(t, origin)
  void api(AUTH_ENDPOINTS.PREFERENCES, { method: 'PUT', body: JSON.stringify({ theme: t }) }).catch(() => undefined)
}

/** At sign-in: the account's choice wins over this browser's copy (null = never picked: leave as it is). */
export const fromAccount = (t: string | null | undefined): void => {
  if ((t === 'light' || t === 'dark') && t !== read()) keep(t)
}

const subscribe = (fn: () => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

/** The current theme; re-renders when it changes. */
export const useTheme = (): Theme => useSyncExternalStore(subscribe, () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light'), () => 'light')

/** At start-up (main.tsx / bulk-main.tsx): make sure the page matches the stored choice. */
export const initTheme = (): void => paint(read())
