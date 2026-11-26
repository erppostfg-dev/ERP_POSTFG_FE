import { useState } from 'react'
import { AlertTriangle, RotateCw } from 'lucide-react'
import { ERROR_NOTE } from '../constants/errors'
import { errorText } from '../lib/friendlyError'
import { copyText } from '../lib/clipboard'

/*
 * The one red error box of POST_FG and the Bulk Orders portal (2026-11-26): a plain sentence (lib/friendlyError),
 * "Try again" when the screen can retry, and "Copy details" (code + request id) for Report a problem / a developer.
 * Never the server's raw text. inline = a red line for small places (next to a button, inside a card).
 */

interface Props {
  /** Anything thrown or a ready sentence. Nothing = nothing shown. */
  error: unknown
  onRetry?: () => void
  inline?: boolean
  className?: string
  /** A stored raw failure (robot / outside service): folded under "Technical details", shown only when opened. */
  technical?: string | null
}

const detailsOf = (e: unknown): string => {
  if (!e || typeof e !== 'object') return ''
  const x = e as { status?: number; code?: string; requestId?: string; rawMessage?: string }
  return [x.code && `code ${x.code}`, x.status !== undefined && `status ${x.status}`, x.requestId && `request ${x.requestId}`]
    .filter(Boolean).join(' · ')
}

export function ErrorNote({ error, onRetry, inline, className = '', technical }: Props) {
  const [copied, setCopied] = useState(false)
  if (error === null || error === undefined || error === false || error === '') return null
  const text = errorText(error)
  const details = detailsOf(error)
  if (inline) {
    return (
      <p role="alert" className={`flex items-start gap-1.5 text-[12px] font-medium text-crit ${className}`}>
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span>{text}</span>
      </p>
    )
  }
  return (
    <div role="alert" className={`flex items-start gap-2.5 rounded-[var(--radius)] border border-crit/30 bg-crit-soft px-3 py-2.5 text-[12.5px] text-crit ${className}`}>
      <AlertTriangle className="mt-0.5 size-4 shrink-0" />
      <div className="min-w-0 flex-1">
        <p className="font-medium leading-5">{text}</p>
        {technical && technical.trim() !== text && (
          <details className="mt-1 text-[11.5px] text-crit/80">
            <summary className="cursor-pointer select-none">{ERROR_NOTE.DETAILS}</summary>
            <pre className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words rounded bg-white/60 p-2 font-mono text-[11px] text-ink-600">{technical}</pre>
          </details>
        )}
        {(onRetry || details) && (
          <div className="mt-1 flex flex-wrap items-center gap-3 text-[11.5px]">
            {onRetry && (
              <button type="button" onClick={onRetry} className="inline-flex items-center gap-1 font-semibold underline-offset-2 hover:underline">
                <RotateCw className="size-3" /> {ERROR_NOTE.RETRY}
              </button>
            )}
            {details && (
              <button
                type="button"
                title={details}
                onClick={() => { void copyText(details).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500) }) }}
                className="text-crit/70 underline-offset-2 hover:underline"
              >
                {copied ? ERROR_NOTE.COPIED : ERROR_NOTE.COPY}
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
