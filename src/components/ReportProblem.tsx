import { useState } from 'react'
import { useLocation } from 'react-router'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageSquarePlus } from 'lucide-react'
import { Button, Drawer } from './ui'
import { Field, inputCls, textareaCls } from './kit'
import { ImagePicker } from './FeedbackImages'
import { pastedImages } from '../lib/feedbackImages'
import { ApiError } from '../api/client'
import { createFeedback, feedbackPeople, feedbackPeopleKey, type FeedbackDetail, type FeedbackPerson } from '../api/feedback'
import { useAuth } from '../auth/AuthContext'
import {
  FEEDBACK_DESCRIPTION_ROWS, FEEDBACK_MAX_IMAGES, FEEDBACK_SEVERITIES, FEEDBACK_TEXT as T, FEEDBACK_TEXT_MAX, FEEDBACK_TITLE_MAX, FEEDBACK_TYPES,
  type FeedbackSeverity, type FeedbackType,
} from '../constants/feedback'
import { lastError } from '../lib/lastError'

/** "Assigned to": nobody, or one active person (name + email). Used by the form and the item drawer. */
export function AssigneeSelect({ value, people, onChange, disabled }: { value: number | null; people: FeedbackPerson[]; onChange: (id: number | null) => void; disabled?: boolean }) {
  return (
    <select value={value ?? ''} disabled={disabled} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)} className={`${inputCls} disabled:opacity-60`}>
      <option value="">{T.NOBODY}</option>
      {people.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.email})</option>)}
    </select>
  )
}

/*
 * "Report a problem" (2026-10-29): a form any signed-in person opens from the top bar (or New on the Feedback page).
 * The app adds what people never think to send: the page (with its tab), the browser, the screen size and the last
 * error the backend gave (code, message, request id for CloudWatch). Screenshots: paste, drop or pick, at most 4.
 */

const errText = (e: unknown) => (e instanceof ApiError ? (Array.isArray(e.details) ? (e.details as { message: string }[]).map((d) => d.message).join(' · ') : e.message) : String(e))

/** What is sent along with a report (shown in the form, so people see it). */
const captured = (page: string) => ({
  page,
  viewport: `${window.innerWidth}×${window.innerHeight}`,
  browser: navigator.userAgent,
  timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  lastError: lastError(),
})

export function FeedbackForm({ open, onClose, onSent }: { open: boolean; onClose: () => void; onSent?: (item: FeedbackDetail) => void }) {
  const { pathname, search } = useLocation()
  const queryClient = useQueryClient()
  const auth = useAuth()
  const people = useQuery({ queryKey: feedbackPeopleKey, queryFn: ({ signal }) => feedbackPeople(signal), enabled: open, staleTime: 5 * 60_000 })
  const [assignee, setAssignee] = useState<number | null>(null)
  const [type, setType] = useState<FeedbackType>('problem')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [severity, setSeverity] = useState<FeedbackSeverity>('annoying')
  const [images, setImages] = useState<File[]>([])
  const [note, setNote] = useState<string | null>(null)
  const [sending, setSending] = useState(false)
  const page = `${pathname}${search}`
  const context = captured(page)
  const reset = () => { setType('problem'); setTitle(''); setDescription(''); setSeverity('annoying'); setImages([]); setNote(null); setAssignee(null) }

  const send = async (close: () => void) => {
    setSending(true)
    setNote(null)
    try {
      const item = await createFeedback({ type, title: title.trim(), description: description.trim(), severity: type === 'problem' ? severity : null, page, context, assignedToId: assignee }, images)
      await queryClient.invalidateQueries({ queryKey: ['feedback'] })
      reset()
      onSent?.(item)
      close()
    } catch (e) {
      setNote(errText(e))
    } finally {
      setSending(false)
    }
  }
  const ready = title.trim() && description.trim() && !sending

  return (
    <Drawer open={open} onClose={onClose} wide title={T.FORM_TITLE} sub={T.FORM_SUB}
      footer={(close) => <>
        <Button onClick={close}>{T.CANCEL}</Button>
        <Button variant="primary" disabled={!ready} onClick={() => void send(close)}>{sending ? T.SENDING : T.SEND}</Button>
      </>}>
      <div className="space-y-4" onPaste={(e) => {
        const pasted = pastedImages(e)
        if (!pasted.length) return
        e.preventDefault()
        const room = FEEDBACK_MAX_IMAGES - images.length
        setImages([...images, ...pasted.slice(0, Math.max(0, room))])
        setNote(pasted.length > room ? T.IMAGES_FULL(FEEDBACK_MAX_IMAGES) : null)
      }}>
        <Field label={T.TYPE}>
          <div className="grid grid-cols-3 gap-2">
            {FEEDBACK_TYPES.map((t) => (
              <button key={t.key} type="button" onClick={() => setType(t.key)} title={t.hint}
                className={`rounded-md border px-2 py-2 text-[12.5px] font-semibold transition-colors ${type === t.key ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink-600 hover:bg-alt'}`}>{t.label}</button>
            ))}
          </div>
        </Field>
        <Field label={T.TITLE}>
          <input value={title} maxLength={FEEDBACK_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} placeholder={T.TITLE_HINT} className={inputCls} />
        </Field>
        <Field label={T.DESCRIPTION}>
          <textarea value={description} maxLength={FEEDBACK_TEXT_MAX} rows={FEEDBACK_DESCRIPTION_ROWS} onChange={(e) => setDescription(e.target.value)} placeholder={T.DESCRIPTION_HINT} className={`${textareaCls} min-h-[116px] resize-y`} />
        </Field>
        <Field label={T.REPORTED_BY}>
          <span className="inline-block py-1">{auth.status === 'signedIn' ? `${auth.user.name} (${T.YOU})` : T.YOU}</span>
        </Field>
        <Field label={T.ASSIGNED_TO}>
          <AssigneeSelect value={assignee} people={people.data ?? []} onChange={setAssignee} />
          <p className="mt-1 text-[11.5px] text-ink-400">{T.ASSIGN_HINT}</p>
        </Field>
        {type === 'problem' && (
          <Field label={T.SEVERITY}>
            <div className="flex flex-wrap gap-2">
              {FEEDBACK_SEVERITIES.map((s) => (
                <button key={s.key} type="button" onClick={() => setSeverity(s.key)}
                  className={`rounded-full border px-3 py-1 text-[12px] font-semibold ${severity === s.key ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink-600 hover:bg-alt'}`}>{s.label}</button>
              ))}
            </div>
          </Field>
        )}
        <Field label={T.IMAGES}>
          <ImagePicker files={images} onChange={setImages} max={FEEDBACK_MAX_IMAGES} onNote={setNote} />
        </Field>
        {note && <div className="rounded-md bg-crit-soft px-3 py-2 text-[12px] text-crit">{note}</div>}
        <details className="rounded-md border border-line px-3 py-2 text-[11.5px] text-ink-600">
          <summary className="cursor-pointer font-semibold">{T.CAPTURED}</summary>
          <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(context, null, 2)}</pre>
        </details>
      </div>
    </Drawer>
  )
}

/** The top-bar button: opens the form on any page; says the item number once sent. */
export function ReportProblemButton() {
  const [open, setOpen] = useState(false)
  const [sent, setSent] = useState<string | null>(null)
  return (
    <>
      <button type="button" onClick={() => { setSent(null); setOpen(true) }} title={T.REPORT}
        className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-md border border-line px-2.5 py-1.5 text-[11.5px] font-semibold text-ink-600 hover:bg-alt hover:text-ink-900">
        <MessageSquarePlus className="size-3.5" /><span className="hidden xl:inline">{sent ? T.SENT(sent) : T.REPORT}</span>
      </button>
      <FeedbackForm open={open} onClose={() => setOpen(false)} onSent={(item) => setSent(item.id)} />
    </>
  )
}
