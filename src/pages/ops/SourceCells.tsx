import { useCallback, useEffect, useState } from 'react'
import type { ComponentType } from 'react'
import { createPortal } from 'react-dom'
import { Check, Eye, ExternalLink, Mail, X } from 'lucide-react'
import { apiUrl } from '../../api/client'
import { getPoFile } from '../../api/poReview'
import { FileViewer } from '../../components/FileViewer'
import { copyText } from '../../lib/clipboard'
import { COPIED_MS } from '../../constants/ui'
import { FILE_VIEWER_TEXT, FULL_SCREEN_PDF_ZOOM, PO_FILE_PATH } from '../../constants/poReview'

/*
 * Cells of the PO Processing & Review lists (2026-10-16, user):
 *   SourceCell: API / Email / Manual with its icon; a click copies the PO's subject (the email subject; for an API PO the
 *               channel's own name, e.g. Amazon's "FBA STA (28/09/2026 08:03)-DEL5"; else the PO number). Hover shows it.
 *   FileCell:   a blue "View" only (user: no file name; the name shows on hover) that opens the file in the in-app viewer
 *               (2026-10-21, user: no downloads): PDF pages, sheets as grids, the API's JSON as tables, the email body.
 *               Bytes streamed from S3 by GET /po-review/:uploadId/file with the person's sign-in.
 * Both are buttons / links, so the grid's own click-to-copy leaves them alone.
 */

export function SourceCell({ source, subject, fallback, icon: Icon = Mail }: {
  source: string; subject: string | null; fallback: string; icon?: ComponentType<{ className?: string }>
}) {
  const [copied, setCopied] = useState(false)
  const text = subject?.trim() || fallback
  const copy = () => {
    if (!text) return
    void copyText(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      setTimeout(() => setCopied(false), COPIED_MS)
    })
  }
  return (
    <button type="button" onClick={copy} title={text ? `Click to copy: ${text}` : undefined}
      className={`pf-press inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 text-[12px] transition-colors duration-150 hover:bg-alt ${copied ? 'text-ok' : 'text-ink-600 hover:text-ink-900'}`}>
      {copied ? <Check className="size-3.5" /> : <Icon className="size-3.5" />}
      {copied ? 'Subject copied' : source}
    </button>
  )
}

export function FileCell({ uploadId, name }: { uploadId: string; name: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title={`View ${name}`}
        className="inline-flex items-center gap-1 text-[12px] font-semibold text-primary hover:underline">
        <Eye className="size-3.5" />View
      </button>
      {open && <FileViewerDialog uploadId={uploadId} name={name} onClose={() => setOpen(false)} />}
    </>
  )
}

/** The viewer over the whole page (portal, so no table or panel clips it); Esc, ✕ or a click outside closes it. */
function FileViewerDialog({ uploadId, name, onClose }: { uploadId: string; name: string; onClose: () => void }) {
  const load = useCallback((signal: AbortSignal) => getPoFile(uploadId, signal), [uploadId])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])
  return createPortal(
    <div className="pf-backdrop-in fixed inset-0 z-[60] flex bg-ink-900/50 p-4 backdrop-blur-[1px] sm:p-8"
      onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="flex min-h-0 w-full flex-col shadow-2xl">
        <FileViewer load={load} fileName={name} pdfZoom={FULL_SCREEN_PDF_ZOOM} actions={(
          <>
            <a href={apiUrl(PO_FILE_PATH(uploadId))} target="_blank" rel="noreferrer" title={FILE_VIEWER_TEXT.OPEN_TAB} className="hover:opacity-100"><ExternalLink className="size-4" /></a>
            <button type="button" onClick={onClose} title={FILE_VIEWER_TEXT.CLOSE} className="hover:opacity-100"><X className="size-4" /></button>
          </>
        )} />
      </div>
    </div>,
    document.body,
  )
}
