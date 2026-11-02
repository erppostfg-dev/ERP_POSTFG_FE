/*
 * Talks to the ERP Robot Login Chrome extension (extensions/erp-robot-login, 2026-11-02) through window.postMessage:
 * its bridge script runs on the ERP's pages and hands over a portal's login (cookies) after the person confirms.
 */

export type RobotPortal = 'myntra'

export interface PortalLogin {
  cookies: unknown[]
  localStorage: { name: string; value: string }[]
}

const PING_MS = 1_500
/** The person answers the extension's confirm dialog meanwhile. */
const LOGIN_MS = 120_000

let seq = 0

const ask = <T>(body: Record<string, unknown>, timeoutMs: number): Promise<T | null> => new Promise((resolve) => {
  const id = `robot-login-${Date.now()}-${++seq}`
  const done = (value: T | null) => {
    window.removeEventListener('message', onMessage)
    clearTimeout(timer)
    resolve(value)
  }
  const onMessage = (e: MessageEvent) => {
    if (e.source !== window || e.origin !== window.location.origin) return
    const d = e.data as { type?: string; id?: string } | null
    if (d?.type === 'erp-robot-login:reply' && d.id === id) done(d as T)
  }
  const timer = setTimeout(() => done(null), timeoutMs)
  window.addEventListener('message', onMessage)
  window.postMessage({ ...body, id }, window.location.origin)
})

/** The extension's version, or null when it is not installed (or not enabled for this site). */
export const robotLoginExtension = async (): Promise<string | null> =>
  (await ask<{ version?: string }>({ type: 'erp-robot-login:ping' }, PING_MS))?.version ?? null

export class RobotLoginError extends Error {
  readonly reason: 'missing' | 'cancelled' | 'failed'
  constructor(reason: 'missing' | 'cancelled' | 'failed', message: string) {
    super(message)
    this.reason = reason
  }
}

/** The portal's login from this browser (the extension asks the person first). */
export const portalLogin = async (portal: RobotPortal): Promise<PortalLogin> => {
  if (!(await robotLoginExtension())) throw new RobotLoginError('missing', 'extension not installed')
  const r = await ask<{ cookies?: unknown[]; localStorage?: PortalLogin['localStorage']; error?: string }>({ type: 'erp-robot-login:request', portal }, LOGIN_MS)
  if (!r) throw new RobotLoginError('failed', 'the extension did not answer in time')
  if (r.error === 'cancelled') throw new RobotLoginError('cancelled', 'cancelled')
  if (r.error || !r.cookies) throw new RobotLoginError('failed', r.error ?? 'the extension sent no login')
  return { cookies: r.cookies, localStorage: r.localStorage ?? [] }
}
