import { api, apiUrl, ApiError } from './client'
import { ERROR_CODE } from '../constants/auth'
import { FEEDBACK_ENDPOINT, type FeedbackSeverity, type FeedbackStatus, type FeedbackType } from '../constants/feedback'
import { rememberError } from '../lib/lastError'

/* Feedback (2026-10-29): backend routes/feedback.routes.ts, modules/feedback/feedback.service.ts. */

export interface FeedbackPerson { id: number; name: string; email: string }

export interface FeedbackListItem {
  id: string; type: FeedbackType; title: string; severity: FeedbackSeverity | null; status: FeedbackStatus
  duplicateOfId: string | null; page: string | null; reporter: FeedbackPerson
  /** The one person working on it; null = nobody yet. */
  assignedTo: FeedbackPerson | null
  members: FeedbackPerson[]
  images: number; comments: number; createdAt: string; updatedAt: string
  /** The person may change it: reporter, the assignee, a person added to it, developer / admin. */
  canEdit: boolean
}

export interface FeedbackDetail extends FeedbackListItem {
  description: string
  context: Record<string, unknown> | null
  updatedBy: FeedbackPerson | null
  imageList: { id: string; fileName: string; contentType: string; sizeBytes: number; uploadedBy: FeedbackPerson; createdAt: string }[]
  timeline: { id: string; kind: 'comment' | 'change'; text: string; by: FeedbackPerson; createdAt: string }[]
}

export interface FeedbackFilters { status?: string; type?: string; q?: string; mine?: boolean }

export interface NewFeedback {
  type: FeedbackType; title: string; description: string; severity: FeedbackSeverity | null
  page: string; context: Record<string, unknown>; assignedToId: number | null
}

export type FeedbackPatch = Partial<{ title: string; description: string; type: FeedbackType; severity: FeedbackSeverity | null; status: FeedbackStatus; duplicateOfId: string; assignedToId: number | null }>

const one = (id: string) => `${FEEDBACK_ENDPOINT}/${encodeURIComponent(id)}`

export const feedbackKey = (f: FeedbackFilters = {}) => ['feedback', 'list', f] as const
export const feedbackItemKey = (id: string) => ['feedback', 'item', id] as const
export const feedbackPeopleKey = ['feedback', 'people'] as const

export const listFeedback = (f: FeedbackFilters, signal?: AbortSignal) => {
  const p = new URLSearchParams()
  if (f.status) p.set('status', f.status)
  if (f.type) p.set('type', f.type)
  if (f.q) p.set('q', f.q)
  if (f.mine) p.set('mine', '1')
  const qs = p.toString()
  return api<FeedbackListItem[]>(`${FEEDBACK_ENDPOINT}${qs ? `?${qs}` : ''}`, { signal })
}
export const getFeedback = (id: string, signal?: AbortSignal) => api<FeedbackDetail>(one(id), { signal })
export const feedbackPeople = (signal?: AbortSignal) => api<FeedbackPerson[]>(`${FEEDBACK_ENDPOINT}/people`, { signal })
export const updateFeedback = (id: string, patch: FeedbackPatch) => api<FeedbackDetail>(one(id), { method: 'PATCH', body: JSON.stringify(patch) })
export const commentFeedback = (id: string, text: string) => api<FeedbackDetail>(`${one(id)}/comments`, { method: 'POST', body: JSON.stringify({ text }) })
export const addFeedbackMember = (id: string, userId: number) => api<FeedbackDetail>(`${one(id)}/members`, { method: 'POST', body: JSON.stringify({ userId }) })
export const removeFeedbackMember = (id: string, userId: number) => api<FeedbackDetail>(`${one(id)}/members/${userId}`, { method: 'DELETE' })
export const removeFeedbackImage = (id: string, imageId: string) => api<FeedbackDetail>(`${one(id)}/images/${encodeURIComponent(imageId)}/remove`, { method: 'POST' })
/** The image itself (the browser sends the session cookie: same site via the API base). */
export const feedbackImageUrl = (id: string, imageId: string) => apiUrl(`${one(id)}/images/${encodeURIComponent(imageId)}`)

/* Multipart (images). Not api(): the browser sets the multipart Content-Type itself. */
async function sendForm<T>(path: string, form: FormData): Promise<T> {
  let res: Response
  try {
    res = await fetch(apiUrl(path), { method: 'POST', body: form, credentials: 'include', headers: { Accept: 'application/json' } })
  } catch {
    throw new ApiError(0, ERROR_CODE.NETWORK, 'Cannot reach the server')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) {
    const err = body?.error
    if (res.status !== 401) rememberError({ status: res.status, code: err?.code ?? `HTTP_${res.status}`, message: err?.message ?? res.statusText, requestId: err?.requestId, path })
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText, err?.details)
  }
  return body?.data as T
}

export function createFeedback(item: NewFeedback, images: File[]): Promise<FeedbackDetail> {
  const form = new FormData()
  form.append('type', item.type)
  form.append('title', item.title)
  form.append('description', item.description)
  if (item.severity) form.append('severity', item.severity)
  form.append('page', item.page)
  form.append('context', JSON.stringify(item.context))
  if (item.assignedToId !== null) form.append('assignedToId', String(item.assignedToId))
  for (const f of images) form.append('images', f, f.name)
  return sendForm<FeedbackDetail>(FEEDBACK_ENDPOINT, form)
}

export function addFeedbackImages(id: string, images: File[]): Promise<FeedbackDetail> {
  const form = new FormData()
  for (const f of images) form.append('images', f, f.name)
  return sendForm<FeedbackDetail>(`${one(id)}/images`, form)
}
