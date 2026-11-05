/*
 * The last error the backend gave this browser tab (2026-10-29, Feedback): "Report a problem" sends it along, so the
 * person never has to copy an error. requestId finds the request's log lines in CloudWatch. Memory only.
 */

export interface LastError { status: number; code: string; message: string; requestId?: string; path: string; at: string }

let last: LastError | null = null

const listeners = new Set<(e: LastError) => void>()

export const rememberError = (e: Omit<LastError, 'at'>): void => {
  last = { ...e, at: new Date().toISOString() }
  for (const fn of listeners) fn(last)
}

/** Called on every error remembered (the "Report a problem" hint after a server error); returns the unsubscribe. */
export const onError = (fn: (e: LastError) => void): (() => void) => {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}

export const lastError = (): LastError | null => last
