import { API_BASE_URL } from '../constants/auth'
import { ADMIN_ENDPOINT } from '../constants/admin'

/*
 * Errors the server never sees (2026-11-26, Admin > Monitor > Errors): a page crash, "can't reach the server", a page
 * file missing after a deploy. The browser sends each one to POST /client-errors, which writes a CLIENT_ERROR log line
 * (CloudWatch). Fire and forget: never shown, never blocks. When the server cannot be reached the report waits in
 * memory (max QUEUE_MAX) and goes with the next successful call (flushClientErrors, called by the API client).
 * It imports nothing from api/client.ts (the client imports it), so there is no import cycle.
 */

export type ClientErrorKind = 'crash' | 'network' | 'stale_chunk' | 'other'
export interface ClientErrorReport { kind: ClientErrorKind; message: string; code?: string; status?: number; requestId?: string }

const QUEUE_MAX = 10
/** "Can't reach the server" is reported at most once a minute (it repeats on every poll while offline). */
const NETWORK_EVERY_MS = 60_000

const queue: (ClientErrorReport & { page: string })[] = []
let lastNetworkAt = 0
let sending = false

const send = (r: ClientErrorReport & { page: string }): Promise<boolean> =>
  fetch(`${API_BASE_URL}${ADMIN_ENDPOINT.CLIENT_ERRORS}`, {
    method: 'POST', credentials: 'include', keepalive: true,
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ ...r, message: r.message.slice(0, 1000) }),
  }).then((res) => res.ok || res.status === 401 || res.status === 400).catch(() => false)

export const reportClientError = (r: ClientErrorReport): void => {
  if (r.kind === 'network') {
    if (Date.now() - lastNetworkAt < NETWORK_EVERY_MS) return
    lastNetworkAt = Date.now()
  }
  const item = { ...r, page: window.location.pathname }
  // offline: keep it for later (a network report can only go once the server answers again)
  if (r.kind === 'network') {
    if (queue.length < QUEUE_MAX) queue.push(item)
    return
  }
  void send(item).then((ok) => { if (!ok && queue.length < QUEUE_MAX) queue.push(item) })
}

/** After a call that worked: send what waited (one at a time, quietly). */
export const flushClientErrors = (): void => {
  if (!queue.length || sending) return
  sending = true
  const items = queue.splice(0, queue.length)
  void (async () => {
    for (const item of items) if (!(await send(item))) break
    sending = false
  })()
}
