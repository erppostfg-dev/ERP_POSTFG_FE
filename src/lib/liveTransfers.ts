import { useEffect, useRef, useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { apiUrl } from '../api/client'
import { getChanges, isD2cOffline, type D2cChange } from '../api/d2cTransfers'
import { D2C_ENDPOINT } from '../constants/d2cTransfers'
import { LIVE_EVENT, LIVE_FLASH_MS, LIVE_POLL_MS, LIVE_SILENT_MS, LIVE_WATCHDOG_MS } from '../constants/poOverview'
import type { LiveMode } from './liveShipments'

/*
 * Live D2C Internal Transfers (2026-11-03), the same self-healing scheme as PO Overview (lib/liveShipments.ts):
 * SSE at /d2c-transfers/events (transfer changes only), a watchdog that falls back to polling /changes?after=<cursor>,
 * one cursor for both. A change reloads the lists, the tab counts and that transfer's detail (the list rows carry
 * totals the change may have moved), and the row flashes for LIVE_FLASH_MS. Off in the dev preview.
 */

/** Query keys of the page (TanStack Query): every key starts with D2C_KEY. */
export const D2C_KEY = 'd2c'

export function useLiveTransfers() {
  const qc = useQueryClient()
  const offline = isD2cOffline()
  const [mode, setMode] = useState<LiveMode>('connecting')
  const [flash, setFlash] = useState<Record<string, number>>({})
  const cursor = useRef<string | null>(null)
  const lastHeard = useRef(Date.now())

  useEffect(() => {
    if (offline) return
    let stopped = false
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    const seen = (id?: string) => { if (id && (!cursor.current || Number(id) > Number(cursor.current))) cursor.current = id }

    const apply = (c: D2cChange) => {
      seen(c.logId)
      void qc.invalidateQueries({ queryKey: [D2C_KEY, 'list'] })
      void qc.invalidateQueries({ queryKey: [D2C_KEY, 'counts'] })
      void qc.invalidateQueries({ queryKey: [D2C_KEY, 'detail', c.uid] })
      setFlash((f) => ({ ...f, [c.uid]: Date.now() }))
      setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[c.uid]; return n }), LIVE_FLASH_MS)
    }

    const poll = async () => {
      if (stopped || document.hidden) return
      try {
        const { lastId, changes } = await getChanges(cursor.current ?? undefined)
        for (const c of changes) apply(c)
        seen(lastId)
      } catch (e) {
        if ((e as { status?: number }).status === 401) window.location.reload()
      }
    }
    const startPolling = () => {
      if (stopped || pollTimer) return
      setMode('polling')
      const tick = async () => { await poll(); if (!stopped) pollTimer = setTimeout(tick, LIVE_POLL_MS) }
      void tick()
    }
    const stopPolling = () => { clearTimeout(pollTimer); pollTimer = undefined }

    const es = new EventSource(apiUrl(D2C_ENDPOINT.EVENTS), { withCredentials: true })
    const heard = () => { lastHeard.current = Date.now(); if (pollTimer) stopPolling(); setMode('live') }
    es.addEventListener(LIVE_EVENT.PING, (e) => {
      heard()
      try { const d = JSON.parse((e).data) as { lastId?: string }; if (d.lastId && !cursor.current) seen(d.lastId) } catch { /* ignore */ }
    })
    es.addEventListener(LIVE_EVENT.SHIPMENT, (e) => {
      heard()
      try { apply(JSON.parse((e).data) as D2cChange) } catch { /* ignore */ }
    })
    es.onerror = () => startPolling()

    const watchdog = setInterval(() => { if (Date.now() - lastHeard.current > LIVE_SILENT_MS) startPolling() }, LIVE_WATCHDOG_MS)
    const onVisible = () => { if (!document.hidden && pollTimer) void poll() }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      stopped = true
      es.close()
      stopPolling()
      clearInterval(watchdog)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [qc, offline])

  return { mode, flash, offline }
}
