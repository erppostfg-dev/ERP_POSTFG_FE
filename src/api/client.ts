import { API_BASE_URL, ERROR_CODE } from '../constants/auth'
import { rememberError } from '../lib/lastError'

/*
 * Every backend call goes through here: the session cookie is sent (credentials: 'include'), success bodies are
 * { data }, failures { error: { code, message, details } } and become an ApiError the caller branches on by code.
 */

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
  ) {
    super(message)
  }
}

export const apiUrl = (path: string) => `${API_BASE_URL}${path}`

export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), {
      ...init,
      credentials: 'include',
      headers: { Accept: 'application/json', ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...init.headers },
    })
  } catch {
    throw new ApiError(0, ERROR_CODE.NETWORK, 'Cannot reach the server')
  }
  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = body?.error
    // kept for "Report a problem" (lib/lastError.ts); a signed-out check is not an error the person saw
    if (res.status !== 401) rememberError({ status: res.status, code: err?.code ?? `HTTP_${res.status}`, message: err?.message ?? res.statusText, requestId: err?.requestId ?? res.headers.get('X-Request-Id') ?? undefined, path })
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText, err?.details)
  }
  return body?.data as T
}

/** Like api(), for list endpoints: also returns the body's meta (paging totals). */
export async function apiWithMeta<T, M>(path: string, init: RequestInit = {}): Promise<{ data: T; meta: M }> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), { ...init, credentials: 'include', headers: { Accept: 'application/json', ...init.headers } })
  } catch {
    throw new ApiError(0, ERROR_CODE.NETWORK, 'Cannot reach the server')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = body?.error
    // kept for "Report a problem" (lib/lastError.ts); a signed-out check is not an error the person saw
    if (res.status !== 401) rememberError({ status: res.status, code: err?.code ?? `HTTP_${res.status}`, message: err?.message ?? res.statusText, requestId: err?.requestId ?? res.headers.get('X-Request-Id') ?? undefined, path })
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText, err?.details)
  }
  return { data: body?.data as T, meta: body?.meta as M }
}
