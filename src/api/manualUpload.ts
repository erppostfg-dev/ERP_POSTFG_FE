import { api, apiUrl, ApiError } from './client'
import { MANUAL_UPLOAD_ENDPOINT, type ManualStatus } from '../constants/manualUpload'
import { ERROR_CODE } from '../constants/auth'

/* Manual upload (2026-10-22): backend routes/manual-upload.routes.ts. */

export interface UploadChannel { channel: string; name: string; needs: string; twoFiles: boolean; group: 'api' | 'email' | 'manual' }
export interface ManualUploadItem {
  id: string; channel: string; channelName: string; files: { filename: string; size: number }[]
  status: ManualStatus; note: string | null; uploadedBy: string | null; uploadedAt: string
  processBy: string | null; processAt: string | null; finishedAt: string | null
  pos: { uploadId: string; poNumber: string | null; status: string }[]
}

export const listUploadChannels = (signal?: AbortSignal) => api<UploadChannel[]>(`${MANUAL_UPLOAD_ENDPOINT}/channels`, { signal })
export const listManualUploads = (signal?: AbortSignal) => api<ManualUploadItem[]>(MANUAL_UPLOAD_ENDPOINT, { signal })

/* POST /manual-uploads (multipart: channel + files). Not api(): the browser sets the multipart Content-Type itself. */
export async function uploadPoFiles(channel: string, files: File[]): Promise<{ ids: string[] }> {
  const form = new FormData()
  form.append('channel', channel)
  for (const f of files) form.append('files', f, f.name)
  let res: Response
  try {
    res = await fetch(apiUrl(MANUAL_UPLOAD_ENDPOINT), { method: 'POST', body: form, credentials: 'include', headers: { Accept: 'application/json' } })
  } catch {
    throw new ApiError(0, ERROR_CODE.NETWORK, 'Cannot reach the server')
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new ApiError(res.status, body?.error?.code ?? `HTTP_${res.status}`, body?.error?.message ?? res.statusText, body?.error?.details)
  return body?.data
}

export const processManualUploads = (ids: string[]) => api<{ queued: string[] }>(`${MANUAL_UPLOAD_ENDPOINT}/process`, { method: 'POST', body: JSON.stringify({ ids }) })
export const cancelManualUpload = (id: string) => api<{ status: string }>(`${MANUAL_UPLOAD_ENDPOINT}/${encodeURIComponent(id)}/cancel`, { method: 'POST' })
export const retryManualUpload = (id: string) => api<{ status: string }>(`${MANUAL_UPLOAD_ENDPOINT}/${encodeURIComponent(id)}/retry`, { method: 'POST' })
