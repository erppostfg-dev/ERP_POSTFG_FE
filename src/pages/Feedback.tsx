import { useEffect, useMemo, useState } from 'react'
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query'
import { ExternalLink, ImagePlus, MessageSquarePlus, Search, X } from 'lucide-react'
import { useNavigate } from 'react-router'
import { Badge, Button, Drawer, PageTitle } from '../components/ui'
import { DataGrid, inputCls, textareaCls } from '../components/kit'
import { AuthImage } from '../components/FeedbackImages'
import { pickImages } from '../lib/feedbackImages'
import { AssigneeSelect, FeedbackForm } from '../components/ReportProblem'
import { ApiError } from '../api/client'
import {
  addFeedbackImages, addFeedbackMember, commentFeedback, feedbackImageUrl, feedbackItemKey, feedbackKey, feedbackPeople, feedbackPeopleKey, getFeedback, listFeedback,
  removeFeedbackImage, removeFeedbackMember, updateFeedback, type FeedbackDetail, type FeedbackListItem, type FeedbackPatch,
} from '../api/feedback'
import {
  FEEDBACK_COMMENT_MAX, FEEDBACK_DESCRIPTION_ROWS, FEEDBACK_IMAGE_ACCEPT, FEEDBACK_MAX_IMAGES, FEEDBACK_REFRESH_MS, FEEDBACK_SEVERITIES, FEEDBACK_SEVERITY_LABEL,
  FEEDBACK_STATUSES, FEEDBACK_STATUS_LABEL, FEEDBACK_STATUS_TONE, FEEDBACK_TEXT as T, FEEDBACK_TEXT_MAX, FEEDBACK_TITLE_MAX, FEEDBACK_TYPES,
  FEEDBACK_TYPE_LABEL, type FeedbackSeverity, type FeedbackStatus, type FeedbackType,
} from '../constants/feedback'
import { PATHS, URL_PARAM } from '../constants/pages'
import { SEARCH_DELAY_MS } from '../constants/poOverview'
import { istDateTime } from '../lib/time'
import { oneOf, useUrlParam } from '../lib/urlState'
import type { ColKind } from '../lib/ops'

/*
 * Feedback page (2026-10-29): every item for everyone, newest first; status chips, type, Mine, search. A row opens its
 * drawer: the text, the captured details, images, people, and one timeline of comments + changes. Changing it is for
 * the reporter, the people added to it and developer / admin (canEdit from the server, which checks it again).
 */

const errText = (e: unknown) => (e instanceof ApiError ? (Array.isArray(e.details) ? (e.details as { message: string }[]).map((d) => d.message).join(' · ') : e.message) : String(e))

type Row = { id: string; num: string; type: string; title: string; status: string; severity: string; by: string; assigned: string; people: string; images: number; comments: number; updated: string; raw: FeedbackListItem }
// Added by + Assigned to right after the title (user 2026-10-29: "always in the app")
const COLS: [string, keyof Row, ColKind][] = [
  ['#', 'num', 'mono'], ['Title', 'title', 'text'], [T.REPORTED_BY, 'by', 'text'], [T.ASSIGNED_TO, 'assigned', 'text'], ['Type', 'type', 'text'],
  ['How bad', 'severity', 'text'], ['People', 'people', 'text'], ['Images', 'images', 'num'], ['Comments', 'comments', 'num'], ['Updated', 'updated', 'mono'],
]
const toRow = (i: FeedbackListItem): Row => ({
  id: i.id, num: `#${i.id}`, type: FEEDBACK_TYPE_LABEL[i.type], title: i.title, status: FEEDBACK_STATUS_LABEL[i.status],
  severity: i.severity ? FEEDBACK_SEVERITY_LABEL[i.severity] : '', by: i.reporter.name, assigned: i.assignedTo?.name ?? T.NOBODY, people: i.members.map((m) => m.name).join(', '),
  images: i.images, comments: i.comments, updated: istDateTime(i.updatedAt), raw: i,
})
const STATUS_KEYS = FEEDBACK_STATUSES.map((s) => s.key)

/** A small labelled select (value + label pairs). */
function Select({ value, options, onChange, disabled }: { value: string; options: { value: string; label: string }[]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} className={`${inputCls} w-auto py-1 disabled:opacity-60`}>
      {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
    </select>
  )
}
const TYPE_KEYS = FEEDBACK_TYPES.map((t) => t.key)

export default function Feedback() {
  const [status, setStatus] = useUrlParam<string>(PATHS.FEEDBACK, URL_PARAM.TAB, oneOf(['all', ...STATUS_KEYS]), 'all')
  const [type, setType] = useUrlParam<string>(PATHS.FEEDBACK, URL_PARAM.VIEW, oneOf(['all', ...TYPE_KEYS]), 'all')
  const [mine, setMine] = useState(false)
  const [text, setText] = useState('')
  const [q, setQ] = useState('')
  useEffect(() => { const t = setTimeout(() => setQ(text.trim()), SEARCH_DELAY_MS); return () => clearTimeout(t) }, [text])
  const filters = { status: status === 'all' ? undefined : status, type: type === 'all' ? undefined : type, q: q || undefined, mine }
  const list = useQuery({ queryKey: feedbackKey(filters), queryFn: ({ signal }) => listFeedback(filters, signal), placeholderData: keepPreviousData, refetchInterval: FEEDBACK_REFRESH_MS })
  // the open item lives in the address (?item=12), so a refresh or a shared link opens it again
  const [openId, setOpenId] = useUrlParam<string>(PATHS.FEEDBACK, URL_PARAM.ITEM, (v) => /^\d{1,18}$/.test(v), '')
  const [creating, setCreating] = useState(false)
  const rows = useMemo(() => (list.data ?? []).map(toRow), [list.data])

  return (
    <div className="space-y-4">
      <PageTitle title={T.PAGE_TITLE} sub={T.PAGE_SUB} right={<Button variant="primary" icon={<MessageSquarePlus className="size-4" />} onClick={() => setCreating(true)}>{T.NEW}</Button>} />
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex flex-wrap items-center gap-1 rounded-[var(--radius)] bg-alt/70 p-1">
          {[{ key: 'all', label: T.ALL }, ...FEEDBACK_STATUSES].map((s) => (
            <button key={s.key} type="button" onClick={() => setStatus(s.key)}
              className={`rounded-md px-2.5 py-1 text-[12px] font-semibold transition-colors ${status === s.key ? 'bg-surface text-ink-900 shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}>{s.label}</button>
          ))}
        </div>
        <Select value={type} onChange={setType} options={[{ value: 'all', label: `${T.TYPE}: ${T.ALL}` }, ...FEEDBACK_TYPES.map((t) => ({ value: t.key, label: t.label }))]} />
        <label className="inline-flex items-center gap-1.5 text-[12.5px] text-ink-600" title={T.MINE_HINT}>
          <input type="checkbox" checked={mine} onChange={(e) => setMine(e.target.checked)} /> {T.MINE}
        </label>
        <label className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder={T.SEARCH} className={`${inputCls} w-64 pl-8`} />
        </label>
      </div>
      {list.error && <div className="rounded-md bg-crit-soft px-3 py-2 text-[12.5px] text-crit">{errText(list.error)}</div>}
      {list.isPending ? <div className="text-[13px] text-ink-400">{T.LOADING}</div> : !rows.length ? (
        <div className="rounded-[var(--radius-card)] border border-dashed border-line px-4 py-10 text-center text-[13px] text-ink-400">{T.EMPTY}</div>
      ) : (
        <DataGrid cols={COLS} rows={rows} rowKey={(r) => r.id} sticky={1} pageSize={25} onRowClick={(r) => setOpenId(r.id)}
          trailing={[{ label: T.STATUS, render: (r) => <Badge tone={FEEDBACK_STATUS_TONE[r.raw.status]}>{r.status}</Badge>, sortValue: (r) => STATUS_KEYS.indexOf(r.raw.status) }]} />
      )}
      <FeedbackForm open={creating} onClose={() => setCreating(false)} onSent={(item) => setOpenId(item.id)} />
      {openId && <ItemDrawer id={openId} onClose={() => setOpenId('')} />}
    </div>
  )
}

function ItemDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const item = useQuery({ queryKey: feedbackItemKey(id), queryFn: ({ signal }) => getFeedback(id, signal), refetchInterval: FEEDBACK_REFRESH_MS })
  const [note, setNote] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [big, setBig] = useState<string | null>(null)

  /** Runs a change; the answer is the fresh item (shown at once), the lists reload. */
  const act = async (fn: () => Promise<FeedbackDetail>) => {
    setBusy(true)
    setNote(null)
    try {
      queryClient.setQueryData(feedbackItemKey(id), await fn())
      void queryClient.invalidateQueries({ queryKey: ['feedback', 'list'] })
      return true
    } catch (e) {
      setNote(errText(e))
      return false
    } finally {
      setBusy(false)
    }
  }

  const d = item.data
  return (
    <Drawer open onClose={onClose} wide title={d ? <span>#{d.id} · {d.title}</span> : T.LOADING}
      sub={d && <>{FEEDBACK_TYPE_LABEL[d.type]} · {T.REPORTED_BY} {d.reporter.name} · {istDateTime(d.createdAt)}</>}>
      {item.error && <div className="rounded-md bg-crit-soft px-3 py-2 text-[12.5px] text-crit">{errText(item.error)}</div>}
      {d && (
        <div className="space-y-5">
          {note && <div className="rounded-md bg-crit-soft px-3 py-2 text-[12.5px] text-crit">{note}</div>}
          {!d.canEdit && <div className="rounded-md bg-alt px-3 py-2 text-[12px] text-ink-600">{T.VIEW_ONLY}</div>}
          <Owners d={d} busy={busy} onAssign={(assignedToId) => act(() => updateFeedback(id, { assignedToId }))} />
          <Details d={d} busy={busy} onSave={(p) => act(() => updateFeedback(id, p))} />
          {d.page && (
            <button type="button" onClick={() => navigate(d.page!)} className="inline-flex items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline">
              <ExternalLink className="size-3.5" />{T.OPEN_PAGE}: <span className="font-mono">{d.page}</span>
            </button>
          )}

          <section>
            <h3 className="mb-2 text-[13px] font-semibold text-ink-900">{T.IMAGES} ({d.imageList.length}/{FEEDBACK_MAX_IMAGES})</h3>
            <div className="flex flex-wrap gap-2">
              {!d.imageList.length && <span className="text-[12.5px] text-ink-400">{T.NO_IMAGES}</span>}
              {d.imageList.map((img) => (
                <div key={img.id} className="relative">
                  <AuthImage path={feedbackImageUrl(id, img.id)} alt={img.fileName} onClick={() => setBig(img.id)}
                    className="size-28 cursor-zoom-in rounded-md border border-line object-cover" />
                  {d.canEdit && (
                    <button type="button" title={T.REMOVE_IMAGE} disabled={busy} onClick={() => void act(() => removeFeedbackImage(id, img.id))}
                      className="absolute right-1 top-1 rounded bg-ink-900/70 p-0.5 text-white hover:bg-ink-900"><X className="size-3" /></button>
                  )}
                </div>
              ))}
              {d.canEdit && d.imageList.length < FEEDBACK_MAX_IMAGES && (
                <label className="flex size-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-line text-[11.5px] text-ink-600 hover:bg-alt">
                  <ImagePlus className="size-5" />{T.ADD_IMAGES}
                  <input type="file" multiple accept={FEEDBACK_IMAGE_ACCEPT} className="hidden" disabled={busy} onChange={(e) => {
                    const { ok, note: why } = pickImages([...(e.target.files ?? [])], FEEDBACK_MAX_IMAGES - d.imageList.length)
                    e.target.value = ''
                    setNote(why)
                    if (ok.length) void act(() => addFeedbackImages(id, ok))
                  }} />
                </label>
              )}
            </div>
          </section>

          <People d={d} busy={busy} onAdd={(uid) => act(() => addFeedbackMember(id, uid))} onRemove={(uid) => act(() => removeFeedbackMember(id, uid))} />

          {d.context && (
            <details className="rounded-md border border-line px-3 py-2 text-[11.5px] text-ink-600">
              <summary className="cursor-pointer font-semibold">{T.CAPTURED}</summary>
              <pre className="mt-2 max-h-48 overflow-auto whitespace-pre-wrap break-all">{JSON.stringify(d.context, null, 2)}</pre>
            </details>
          )}

          <Timeline d={d} busy={busy} onComment={(text) => act(() => commentFeedback(id, text))} />
        </div>
      )}
      {big && d && (
        <div className="fixed inset-0 z-[60] grid place-items-center bg-ink-900/80 p-6" onClick={() => setBig(null)}>
          <AuthImage path={feedbackImageUrl(id, big)} alt="" className="max-h-full max-w-full rounded-md bg-surface object-contain" />
        </div>
      )}
    </Drawer>
  )
}

/** Added by + Assigned to, always on top of the item; the assignee is picked here by people who may change it. */
function Owners({ d, busy, onAssign }: { d: FeedbackDetail; busy: boolean; onAssign: (id: number | null) => Promise<boolean> }) {
  const people = useQuery({ queryKey: feedbackPeopleKey, queryFn: ({ signal }) => feedbackPeople(signal), enabled: d.canEdit, staleTime: 5 * 60_000 })
  return (
    <section className="grid gap-3 rounded-md border border-line px-3 py-2.5 sm:grid-cols-2">
      <div>
        <div className="text-[11.5px] font-semibold text-ink-400">{T.REPORTED_BY}</div>
        <div className="text-[13px] text-ink-900" title={d.reporter.email}>{d.reporter.name}</div>
        <div className="text-[11.5px] text-ink-400">{istDateTime(d.createdAt)}</div>
      </div>
      <div>
        <div className="text-[11.5px] font-semibold text-ink-400">{T.ASSIGNED_TO}</div>
        {d.canEdit ? (
          <AssigneeSelect value={d.assignedTo?.id ?? null} people={people.data ?? (d.assignedTo ? [d.assignedTo] : [])} disabled={busy} onChange={(v) => void onAssign(v)} />
        ) : (
          <div className={`text-[13px] ${d.assignedTo ? 'text-ink-900' : 'text-ink-400'}`} title={d.assignedTo?.email}>{d.assignedTo?.name ?? T.NOBODY}</div>
        )}
      </div>
    </section>
  )
}

/** Status, type, how bad, title and text: editable for people who may change it, read-only otherwise. */
function Details({ d, busy, onSave }: { d: FeedbackDetail; busy: boolean; onSave: (p: FeedbackPatch) => Promise<boolean> }) {
  const [edit, setEdit] = useState(false)
  const [title, setTitle] = useState(d.title)
  const [description, setDescription] = useState(d.description)
  const [dupOf, setDupOf] = useState(d.duplicateOfId ?? '')
  const lock = !d.canEdit || busy
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Duplicate is set with "Duplicate of #" (it needs the other item's number) */}
        <Select value={d.status} disabled={lock} onChange={(v) => void onSave({ status: v as FeedbackStatus })}
          options={FEEDBACK_STATUSES.filter((s) => s.key !== 'duplicate' || d.status === 'duplicate').map((s) => ({ value: s.key, label: `${T.STATUS}: ${s.label}` }))} />
        <Select value={d.type} disabled={lock} onChange={(v) => void onSave({ type: v as FeedbackType, ...(v === 'problem' && !d.severity ? { severity: 'annoying' } : {}) })}
          options={FEEDBACK_TYPES.map((t) => ({ value: t.key, label: `${T.TYPE}: ${t.label}` }))} />
        {d.type === 'problem' && (
          <Select value={d.severity ?? ''} disabled={lock} onChange={(v) => void onSave({ severity: v as FeedbackSeverity })}
            options={FEEDBACK_SEVERITIES.map((s) => ({ value: s.key, label: s.label }))} />
        )}
        {d.canEdit && (
          <span className="inline-flex items-center gap-1 text-[12px] text-ink-600">
            {T.DUPLICATE_OF}
            <input value={dupOf} onChange={(e) => setDupOf(e.target.value.replace(/\D/g, ''))} className={`${inputCls} w-20`} />
            <Button disabled={busy || !dupOf} onClick={() => void onSave({ status: 'duplicate', duplicateOfId: dupOf })}>{T.SAVE}</Button>
          </span>
        )}
        {!d.canEdit && <Badge tone={FEEDBACK_STATUS_TONE[d.status]}>{FEEDBACK_STATUS_LABEL[d.status]}{d.duplicateOfId ? ` #${d.duplicateOfId}` : ''}</Badge>}
      </div>
      {edit ? (
        <div className="space-y-2">
          <input value={title} maxLength={FEEDBACK_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} className={inputCls} />
          <textarea value={description} maxLength={FEEDBACK_TEXT_MAX} rows={FEEDBACK_DESCRIPTION_ROWS} onChange={(e) => setDescription(e.target.value)} className={`${textareaCls} min-h-[116px] resize-y`} />
          <div className="flex gap-2">
            <Button variant="primary" disabled={busy || !title.trim() || !description.trim()} onClick={() => void onSave({ title, description }).then((ok) => ok && setEdit(false))}>{busy ? T.SAVING : T.SAVE}</Button>
            <Button onClick={() => { setTitle(d.title); setDescription(d.description); setEdit(false) }}>{T.CANCEL}</Button>
          </div>
        </div>
      ) : (
        <div className="rounded-md border border-line bg-alt/40 px-3 py-2">
          <div className="mb-1 text-[11.5px] font-semibold text-ink-400">{T.DESCRIPTION}</div>
          <p className="min-h-24 whitespace-pre-wrap text-[13px] text-ink-900">{d.description}</p>
          {d.canEdit && <button type="button" onClick={() => { setTitle(d.title); setDescription(d.description); setEdit(true) }} className="mt-2 text-[12px] font-semibold text-primary hover:underline">{T.EDIT}</button>}
        </div>
      )}
    </section>
  )
}

function People({ d, busy, onAdd, onRemove }: { d: FeedbackDetail; busy: boolean; onAdd: (id: number) => Promise<boolean>; onRemove: (id: number) => Promise<boolean> }) {
  const people = useQuery({ queryKey: feedbackPeopleKey, queryFn: ({ signal }) => feedbackPeople(signal), enabled: d.canEdit, staleTime: 5 * 60_000 })
  const choices = (people.data ?? []).filter((p) => p.id !== d.reporter.id && !d.members.some((m) => m.id === p.id))
  return (
    <section>
      <h3 className="text-[13px] font-semibold text-ink-900">{T.PEOPLE}</h3>
      <p className="mb-2 text-[11.5px] text-ink-400">{T.PEOPLE_HINT}</p>
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded-full bg-primary-soft px-2.5 py-1 text-[12px] font-semibold text-primary" title={d.reporter.email}>{d.reporter.name} · {T.REPORTED_BY.toLowerCase()}</span>
        {d.members.map((m) => (
          <span key={m.id} className="inline-flex items-center gap-1 rounded-full bg-alt px-2.5 py-1 text-[12px] text-ink-900" title={m.email}>
            {m.name}
            {d.canEdit && <button type="button" disabled={busy} title={T.REMOVE} onClick={() => void onRemove(m.id)} className="text-ink-400 hover:text-crit"><X className="size-3" /></button>}
          </span>
        ))}
        {d.canEdit && (
          <Select value="" disabled={busy || !choices.length} onChange={(v) => v && void onAdd(Number(v))}
            options={[{ value: '', label: T.ADD_PERSON }, ...choices.map((p) => ({ value: String(p.id), label: `${p.name} (${p.email})` }))]} />
        )}
      </div>
    </section>
  )
}

function Timeline({ d, busy, onComment }: { d: FeedbackDetail; busy: boolean; onComment: (text: string) => Promise<boolean> }) {
  const [text, setText] = useState('')
  return (
    <section>
      <h3 className="mb-2 text-[13px] font-semibold text-ink-900">{T.COMMENTS}</h3>
      <ol className="space-y-2">
        {d.timeline.map((t) => (
          <li key={t.id} className={t.kind === 'change' ? 'text-[12px] text-ink-400' : 'rounded-md border border-line px-3 py-2'}>
            <div className={t.kind === 'change' ? '' : 'mb-1 text-[11.5px] text-ink-400'}>
              <span className="font-semibold text-ink-600">{t.by.name}</span> · {istDateTime(t.createdAt)}{t.kind === 'change' && <> · {t.text}</>}
            </div>
            {t.kind === 'comment' && <p className="whitespace-pre-wrap text-[13px] text-ink-900">{t.text}</p>}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex items-start gap-2">
        <textarea value={text} maxLength={FEEDBACK_COMMENT_MAX} rows={2} onChange={(e) => setText(e.target.value)} placeholder={T.COMMENT_PLACEHOLDER} className={`${textareaCls} flex-1 resize-y`} />
        <Button variant="primary" disabled={busy || !text.trim()} onClick={() => void onComment(text.trim()).then((ok) => ok && setText(''))}>{T.COMMENT_SEND}</Button>
      </div>
    </section>
  )
}
