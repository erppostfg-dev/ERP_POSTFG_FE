import { useState } from 'react'
import { Check, Clock, Loader2, Upload } from 'lucide-react'
import { Badge } from '../../components/ui'
import { apiUrl, ApiError } from '../../api/client'
import { markUniwareUploaded } from '../../api/poReview'
import { UNIWARE_AGE, UNIWARE_ENDPOINT, UNIWARE_STATE, UNIWARE_TEXT, type UniwareState } from '../../constants/poReview'
import { istDateTime } from '../../lib/time'

/*
 * Uniware hand-off on the Processed tab (user, 2026-10-19): a completed PO waits here until its sale order CSV is
 * downloaded (amber, days counting) and then someone marks it uploaded into Uniware (green); only then does it show in
 * PO Overview. Downloads only through the row checkboxes (user, 2026-10-19): one ticked PO = its own CSV (file named
 * after the sale order); several = ONE combined CSV. The row shows the state and Mark uploaded / Undo.
 */

export interface Handoff {
  id: string
  completedAt: string | null
  csvDownloadedAt: string | null
  csvDownloadedBy: string | null
  uniwareUploadedAt: string | null
  uniwareUploadedBy: string | null
}

export const stateOf = (h: Handoff): UniwareState =>
  h.uniwareUploadedAt ? UNIWARE_STATE.UPLOADED : h.csvDownloadedAt ? UNIWARE_STATE.DOWNLOADED : UNIWARE_STATE.PENDING

/** Whole days since the PO was processed (0 = today). */
export const daysWaiting = (h: Handoff): number =>
  h.completedAt ? Math.max(0, Math.floor((Date.now() - new Date(h.completedAt).getTime()) / 864e5)) : 0

const dayText = (n: number) => (n === 0 ? 'today' : n === 1 ? '1 day' : `${n} days`)

/** Small badges like PO Working's (no row colour): grey, from 5 days yellow, from 10 days red. */
export const ageTone = (n: number) => (n >= UNIWARE_AGE.CRIT_DAYS ? 'crit' : n >= UNIWARE_AGE.WARN_DAYS ? 'warn' : 'neutral')

/** Saves a CSV the backend sends (GET one / POST several): it records the download on the server. */
export const saveCsv = async (path: string, init?: RequestInit): Promise<void> => {
  const res = await fetch(apiUrl(path), { ...init, credentials: 'include', headers: { ...(init?.body ? { 'Content-Type': 'application/json' } : {}) } })
  if (!res.ok) {
    const err = (await res.json().catch(() => null))?.error
    throw new ApiError(res.status, err?.code ?? `HTTP_${res.status}`, err?.message ?? res.statusText, err?.details)
  }
  const name = /filename="([^"]+)"/.exec(res.headers.get('Content-Disposition') ?? '')?.[1] ?? 'uniware.csv'
  const url = URL.createObjectURL(await res.blob())
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export const downloadOneCsv = (uploadId: string) => saveCsv(UNIWARE_ENDPOINT.ONE(uploadId))
export const downloadCombinedCsv = (uploadIds: string[]) =>
  saveCsv(UNIWARE_ENDPOINT.MANY, { method: 'POST', body: JSON.stringify({ uploadIds }) })

/** The status chip + Mark uploaded / Undo of one PO (the last column of Processed); no download button here. */
export function UniwareCell({ h, canEdit, onDone, onError }: {
  h: Handoff; canEdit: boolean; onDone: (message: string) => void; onError: (message: string) => void
}) {
  const [busy, setBusy] = useState<'mark' | 'undo' | null>(null)
  const st = stateOf(h)
  const days = daysWaiting(h)
  const run = async (what: 'mark' | 'undo') => {
    setBusy(what)
    try {
      await markUniwareUploaded([h.id], what === 'undo')
      onDone(what === 'undo' ? UNIWARE_TEXT.UNDONE(1) : UNIWARE_TEXT.MARKED(1))
    } catch (e) {
      onError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(null)
    }
  }
  const spin = <Loader2 className="size-3.5 animate-spin" />

  if (st === UNIWARE_STATE.UPLOADED) {
    return (
      <span className="inline-flex items-center gap-2">
        <span title={`${UNIWARE_TEXT.UPLOADED_BY} ${h.uniwareUploadedBy ?? '—'} · ${istDateTime(h.uniwareUploadedAt)}`}>
          <Badge tone="ok"><Check className="size-3" />{UNIWARE_TEXT.IN_UNIWARE}</Badge>
        </span>
        {canEdit && <button type="button" onClick={() => void run('undo')} disabled={!!busy} className="text-[11.5px] text-ink-400 underline-offset-2 hover:text-ink-900 hover:underline">{busy === 'undo' ? 'Undoing…' : 'Undo'}</button>}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      <span title={st === UNIWARE_STATE.DOWNLOADED ? `${UNIWARE_TEXT.DOWNLOADED_BY} ${h.csvDownloadedBy ?? '—'} · ${istDateTime(h.csvDownloadedAt)}` : UNIWARE_TEXT.NOT_DOWNLOADED_HINT}>
        <Badge tone={st === UNIWARE_STATE.DOWNLOADED ? 'info' : 'neutral'}>{st === UNIWARE_STATE.DOWNLOADED ? UNIWARE_TEXT.WAITING_UPLOAD : UNIWARE_TEXT.NOT_DOWNLOADED}</Badge>
      </span>
      <span title={UNIWARE_TEXT.AGE_HINT}><Badge tone={ageTone(days)}><Clock className="size-3" />{dayText(days)}</Badge></span>
      {canEdit && st === UNIWARE_STATE.DOWNLOADED && (
        <button type="button" onClick={() => void run('mark')} disabled={!!busy}
          className="pf-press inline-flex h-7 items-center gap-1.5 rounded-md bg-ok px-2.5 text-[12px] font-semibold text-white transition-opacity duration-150 hover:opacity-90 disabled:opacity-60">
          {busy === 'mark' ? spin : <Upload className="size-3.5" />}{UNIWARE_TEXT.MARK_UPLOADED}
        </button>
      )}
    </span>
  )
}
