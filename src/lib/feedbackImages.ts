import type { ClipboardEvent as ReactClipboardEvent } from 'react'
import { FEEDBACK_MAX_IMAGE_BYTES, FEEDBACK_TEXT as T } from '../constants/feedback'

/* Feedback images (2026-10-29): which files to keep, and screenshots pasted with Ctrl+V. */

/** Keeps the images that fit (type image/*, ≤ 5 MB, up to `room`); says why others were left out. */
export const pickImages = (files: File[], room: number): { ok: File[]; note: string | null } => {
  const ok: File[] = []
  let note: string | null = null
  for (const f of files) {
    if (!f.type.startsWith('image/')) note = T.IMAGE_NOT_IMAGE(f.name || 'file')
    else if (f.size > FEEDBACK_MAX_IMAGE_BYTES) note = T.IMAGE_TOO_BIG(f.name || 'image')
    else if (ok.length >= room) note = T.IMAGES_FULL(room)
    else ok.push(f)
  }
  return { ok, note }
}

/** Images pasted with Ctrl+V (screenshots come with no name: one is given). */
export const pastedImages = (e: ClipboardEvent | ReactClipboardEvent): File[] =>
  [...(e.clipboardData?.files ?? [])].filter((f) => f.type.startsWith('image/'))
    .map((f, i) => (f.name && f.name !== 'image.png' ? f : new File([f], `screenshot-${Date.now()}-${i + 1}.${f.type.split('/')[1] ?? 'png'}`, { type: f.type })))
