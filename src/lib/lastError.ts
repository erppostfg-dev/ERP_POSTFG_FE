/*
 * The last error the backend gave this browser tab (2026-10-29, Feedback): "Report a problem" sends it along, so the
 * person never has to copy an error. requestId finds the request's log lines in CloudWatch. Memory only.
 */

export interface LastError { status: number; code: string; message: string; requestId?: string; path: string; at: string }

let last: LastError | null = null

export const rememberError = (e: Omit<LastError, 'at'>): void => {
  last = { ...e, at: new Date().toISOString() }
}

export const lastError = (): LastError | null => last
