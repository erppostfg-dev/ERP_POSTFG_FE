import { useEffect, useMemo, useRef, useState } from 'react'
import { ImagePlus, X } from 'lucide-react'
import { apiUrl } from '../api/client'
import { FEEDBACK_IMAGE_ACCEPT, FEEDBACK_TEXT as T } from '../constants/feedback'
import { pickImages } from '../lib/feedbackImages'

/*
 * Feedback images (2026-10-29). ImagePicker: paste (Ctrl+V anywhere in the form), drop or pick, previews, at most
 * `max`. AuthImage: an image from the API through the signed-in session (fetch + blob: the API's own images are not
 * shown cross-site by <img> alone). The server checks the real type again (first bytes) and the count.
 */

function Preview({ file, onRemove }: { file: File; onRemove: () => void }) {
  const url = useMemo(() => URL.createObjectURL(file), [file])
  useEffect(() => () => URL.revokeObjectURL(url), [url])
  return (
    <div className="group relative size-20 overflow-hidden rounded-md border border-line bg-alt">
      <img src={url} alt={file.name} className="size-full object-cover" />
      <button type="button" onClick={onRemove} title={T.REMOVE_IMAGE}
        className="absolute right-0.5 top-0.5 rounded bg-ink-900/70 p-0.5 text-white opacity-80 hover:opacity-100"><X className="size-3" /></button>
    </div>
  )
}

export function ImagePicker({ files, onChange, max, onNote }: { files: File[]; onChange: (f: File[]) => void; max: number; onNote: (n: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const add = (list: File[]) => {
    const { ok, note } = pickImages(list, max - files.length)
    onNote(note)
    if (ok.length) onChange([...files, ...ok])
  }
  return (
    <div>
      <div
        onDragOver={(e) => { e.preventDefault(); setOver(true) }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => { e.preventDefault(); setOver(false); add([...e.dataTransfer.files]) }}
        className={`flex flex-wrap items-center gap-2 rounded-md border border-dashed p-2 transition-colors ${over ? 'border-primary bg-primary-soft/40' : 'border-line'}`}
      >
        {files.map((f, i) => <Preview key={`${f.name}-${i}`} file={f} onRemove={() => onChange(files.filter((_, j) => j !== i))} />)}
        {files.length < max && (
          <button type="button" onClick={() => input.current?.click()}
            className="flex h-20 min-w-20 flex-col items-center justify-center gap-1 rounded-md px-2 text-[11px] text-ink-600 hover:bg-alt">
            <ImagePlus className="size-5" />{files.length}/{max}
          </button>
        )}
        <span className="text-[11.5px] text-ink-400">{T.IMAGES_HINT(max)}</span>
      </div>
      <input ref={input} type="file" multiple accept={FEEDBACK_IMAGE_ACCEPT} className="hidden"
        onChange={(e) => { add([...(e.target.files ?? [])]); e.target.value = '' }} />
    </div>
  )
}

/** An image of the API (path under the API base), loaded with the session cookie. */
export function AuthImage({ path, alt, className, onClick }: { path: string; alt: string; className?: string; onClick?: () => void }) {
  const [url, setUrl] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let made: string | null = null
    const ctrl = new AbortController()
    fetch(path.startsWith('http') ? path : apiUrl(path), { credentials: 'include', signal: ctrl.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        made = URL.createObjectURL(await r.blob())
        setUrl(made)
      })
      .catch(() => { if (!ctrl.signal.aborted) setFailed(true) })
    return () => { ctrl.abort(); if (made) URL.revokeObjectURL(made) }
  }, [path])
  if (failed) return <div className={`grid place-items-center bg-alt text-[11px] text-ink-400 ${className ?? ''}`}>—</div>
  if (!url) return <div className={`animate-pulse bg-alt ${className ?? ''}`} />
  return <img src={url} alt={alt} className={className} onClick={onClick} />
}
