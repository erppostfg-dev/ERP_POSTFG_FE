import { useEffect, useRef, useState } from 'react'
import { useQueryClient, type InfiniteData, type QueryClient } from '@tanstack/react-query'
import { apiUrl } from '../api/client'
import { getChanges, getShipment, type ShipmentChange, type ShipmentItem } from '../api/poOverview'
import { LIST_ACTIONS, LIVE_EVENT, LIVE_FLASH_MS, LIVE_POLL_MS, LIVE_SILENT_MS, LIVE_WATCHDOG_MS, PO_OVERVIEW_ENDPOINT } from '../constants/poOverview'

/*
 * Live PO Overview (2026-10-14, self-healing; user: "reduce manual intervention"):
 *   - SSE (EventSource) first: the server pushes `shipment` { uid, logId, action, fields, by } after every change and a
 *     `ping` every 25 s. The browser reconnects by itself and sends the last id, so the server replays what was missed.
 *   - Watchdog: no message for LIVE_SILENT_MS, or an error -> mode "polling": GET /changes?after=<cursor> every
 *     LIVE_POLL_MS until a message arrives over SSE again (then polling stops by itself).
 *   - One cursor (the newest shipment_logs id seen) for both, so a switch never loses or repeats a change.
 *   - Hidden tab: no polling; on becoming visible it catches up at once.
 *   - Session expired (401 while polling): the page reloads, which shows the login.
 *   - A change re-reads only that shipment (with the person's own access) and swaps the row in every cached list; a new
 *     shipment reloads the lists. Rows changed by others flash for LIVE_FLASH_MS.
 */

export type LiveMode = 'connecting' | 'live' | 'polling'

const SHIPMENT_LISTS = ['po-overview-shipments']
const LINE_LISTS = ['po-overview-lines']

type Page = { data: ShipmentItem[]; meta: unknown }

/** Puts the fresh row into every cached shipments list that has it. */
export const replaceShipmentRow = (qc: QueryClient, row: ShipmentItem) => {
  qc.setQueriesData<InfiniteData<Page>>({ queryKey: SHIPMENT_LISTS }, (old) =>
    old ? { ...old, pages: old.pages.map((p) => ({ ...p, data: p.data.map((r) => (r.uid === row.uid ? row : r)) })) } : old,
  )
  void qc.invalidateQueries({ queryKey: LINE_LISTS })
  void qc.invalidateQueries({ queryKey: ['po-overview', 'history', row.uid] })
}

export function useLiveShipments() {
  const qc = useQueryClient()
  const [mode, setMode] = useState<LiveMode>('connecting')
  const [flash, setFlash] = useState<Record<string, number>>({})
  const cursor = useRef<string | null>(null)
  const lastHeard = useRef(Date.now())

  useEffect(() => {
    let stopped = false
    let pollTimer: ReturnType<typeof setTimeout> | undefined
    const seen = (id?: string) => { if (id && (!cursor.current || Number(id) > Number(cursor.current))) cursor.current = id }

    const apply = async (c: ShipmentChange) => {
      seen(c.logId)
      if (LIST_ACTIONS.includes(c.action)) {
        void qc.invalidateQueries({ queryKey: SHIPMENT_LISTS })
        void qc.invalidateQueries({ queryKey: LINE_LISTS })
        return
      }
      try {
        const { shipment } = await getShipment(c.uid)
        replaceShipmentRow(qc, shipment)
        setFlash((f) => ({ ...f, [c.uid]: Date.now() }))
        setTimeout(() => setFlash((f) => { const n = { ...f }; delete n[c.uid]; return n }), LIVE_FLASH_MS)
      } catch { /* the row is re-read on the next list refresh */ }
    }

    // ---- polling fallback ----
    const poll = async () => {
      if (stopped || document.hidden) return
      try {
        const { lastId, changes } = await getChanges(cursor.current ?? undefined)
        for (const c of changes) await apply(c)
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

    // ---- SSE ----
    const es = new EventSource(apiUrl(PO_OVERVIEW_ENDPOINT.EVENTS) + (cursor.current ? `?after=${cursor.current}` : ''), { withCredentials: true })
    const heard = () => { lastHeard.current = Date.now(); if (pollTimer) stopPolling(); setMode('live') }
    es.addEventListener(LIVE_EVENT.PING, (e) => {
      heard()
      try { const d = JSON.parse((e as MessageEvent).data) as { lastId?: string }; if (d.lastId && !cursor.current) seen(d.lastId) } catch { /* ignore */ }
    })
    es.addEventListener(LIVE_EVENT.SHIPMENT, (e) => {
      heard()
      try { void apply(JSON.parse((e as MessageEvent).data) as ShipmentChange) } catch { /* ignore */ }
    })
    es.onerror = () => startPolling() // the browser keeps retrying SSE meanwhile; the first message stops the polling

    // ---- watchdog + hidden tab ----
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
  }, [qc])

  return { mode, flash }
}
