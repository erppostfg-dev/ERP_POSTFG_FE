/*
 * After a deploy an old tab asks for page files that no longer exist (Vite's 'vite:preloadError'): reload ONCE by
 * itself (2026-11-24; sessionStorage guard so a real outage never loops; components/ErrorBoundary shows the rest).
 */

import { reportClientError } from './clientErrors'

const RELOAD_KEY = 'pf-chunk-reload-at'

export const reloadOnStaleChunks = (): void => {
  window.addEventListener('vite:preloadError', (e) => {
    let last = 0
    try { last = Number(sessionStorage.getItem(RELOAD_KEY) ?? 0) } catch { /* storage blocked: still reload once */ }
    if (Date.now() - last < 60_000) { // reloaded a moment ago: show the error instead of looping
      reportClientError({ kind: 'stale_chunk', code: 'STALE_CHUNK', message: 'A page file was still missing after a reload' })
      return
    }
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())) } catch { /* ignore */ }
    e.preventDefault()
    window.location.reload()
  })
}
