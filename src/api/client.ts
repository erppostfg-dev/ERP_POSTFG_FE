import { API_BASE_URL, ERROR_CODE } from '../constants/auth'
import { rememberError } from '../lib/lastError'
import { messageForStatus, plainMessage } from '../lib/friendlyError'

/*
 * Every backend call goes through here: the session cookie is sent (credentials: 'include'), success bodies are
 * { data }, failures { error: { code, message, details } } and become an ApiError the caller branches on by code.
 */

/*
 * Every failure becomes an ApiError (2026-11-26, user: "proper messages, not codes and gibberish"). The constructor
 * cleans the text, so every place that builds one (here and the hand-written fetches in other api files) gives a
 * person-readable message: our backend's own message when it is plain, else the plain sentence of its kind (a proxy's
 * HTML 502 page, "Bad Gateway", a stack trace, a code). rawMessage keeps the original for Report a problem / console.
 */
export class ApiError extends Error {
  /** The server's own text, before cleaning; never shown on a page. */
  public rawMessage: string
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown,
    public requestId?: string,
  ) {
    super(status === 0 ? messageForStatus(0) : plainMessage(status, message))
    this.rawMessage = message
  }
}

const failure = (res: Response, body: unknown, path: string): ApiError => {
  const err = (body as { error?: { code?: string; message?: string; details?: unknown; requestId?: string } } | null)?.error
  const code = err?.code ?? `HTTP_${res.status}`
  const raw = err?.message ?? res.statusText
  const requestId = err?.requestId ?? res.headers.get('X-Request-Id') ?? undefined
  // kept for "Report a problem" (lib/lastError.ts); a signed-out check is not an error the person saw
  if (res.status !== 401) rememberError({ status: res.status, code, message: raw, requestId, path })
  // no JSON error body = not our backend's answer (a proxy / gateway page): only the sentence of its kind
  return new ApiError(res.status, code, err ? raw : '', err?.details, requestId)
}

const networkFailure = () => new ApiError(0, ERROR_CODE.NETWORK, '')

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
    throw networkFailure()
  }
  if (res.status === 204) return undefined as T

  const body = await res.json().catch(() => null)
  if (!res.ok) throw failure(res, body, path)
  return body?.data as T
}

/** Like api(), for a multipart form (file uploads): the browser sets the multipart Content-Type itself. */
export async function apiForm<T>(path: string, form: FormData): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), { method: 'POST', body: form, credentials: 'include', headers: { Accept: 'application/json' } })
  } catch {
    throw networkFailure()
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) throw failure(res, body, path)
  return body?.data as T
}

/** Like api(), for list endpoints: also returns the body's meta (paging totals). */
export async function apiWithMeta<T, M>(path: string, init: RequestInit = {}): Promise<{ data: T; meta: M }> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), { ...init, credentials: 'include', headers: { Accept: 'application/json', ...init.headers } })
  } catch {
    throw networkFailure()
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) throw failure(res, body, path)
  return { data: body?.data as T, meta: body?.meta as M }
}
