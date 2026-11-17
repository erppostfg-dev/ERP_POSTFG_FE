import { useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ExternalLink, Loader2, Megaphone, Reply, Search, Send, Users, X } from 'lucide-react'
import { useLocation } from 'react-router'
import { ApiError } from '../api/client'
import { noticePeople, noticePeopleKey, sendNotice, type MyNotices, type Notice, type NoticePerson, type NoticeSend } from '../api/notices'
import { NOTICE_REVEAL_OUT_MS, NOTICE_TEXT_MAX, NOTICES_TEXT as T } from '../constants/notices'
import { istDateTime } from '../lib/time'
import { useLeaving } from '../lib/useLeaving'

/*
 * The notices part of the bell (2026-11-10): the Send form (person picked by searching a name or email), the list
 * (received + sent, newest first, gone after 2 days) and a one-line Reply on notices sent to me alone. Boxes open and
 * close smoothly (index.css pf-reveal). Not a chat: no threads, no history, no delete.
 */

const hoursLeft = (n: Notice) => Math.max(0, Math.floor((Date.parse(n.expiresAt) - Date.now()) / 3_600_000))
const nameOf = (to: Notice['to']) => (to === 'everyone' ? T.EVERYONE : to.name)
const initial = (name: string) => name.trim().slice(0, 1).toUpperCase() || '?'

/** Text box + counter + Send / Cancel; used for a new notice and for a reply. */
function Compose({ placeholder, busy, error, onSend, onCancel, children, focus = false }: {
  placeholder: string; busy: boolean; error: string | null; focus?: boolean
  onSend: (text: string, withLink: boolean) => void; onCancel: () => void; children?: ReactNode
}) {
  const [text, setText] = useState('')
  const [withLink, setWithLink] = useState(false)
  const ok = text.trim().length > 0 && text.length <= NOTICE_TEXT_MAX
  return (
    <div className="space-y-2">
      {children}
      <textarea value={text} onChange={(e) => setText(e.target.value)} rows={3} maxLength={NOTICE_TEXT_MAX} placeholder={placeholder} autoFocus={focus}
        className="w-full resize-none rounded-md border border-line bg-surface px-2 py-1.5 text-[12.5px] text-ink-900 outline-none transition-[border-color,box-shadow] duration-200 focus:border-primary focus:ring-2 focus:ring-primary/15" />
      <div className="flex items-center justify-between gap-2 text-[11.5px] text-ink-400">
        <label className="inline-flex cursor-pointer items-center gap-1.5">
          <input type="checkbox" checked={withLink} onChange={(e) => setWithLink(e.target.checked)} className="accent-primary" />{T.LINK_PAGE}
        </label>
        <span className="tabular-nums">{T.COUNT(text.length, NOTICE_TEXT_MAX)}</span>
      </div>
      {error && <div className="pf-tab-in rounded-md bg-crit-soft px-2 py-1.5 text-[12px] text-crit">{error}</div>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-md px-2.5 py-1 text-[12px] font-semibold text-ink-600 transition-colors hover:bg-alt">{T.CANCEL}</button>
        <button type="button" disabled={!ok || busy} onClick={() => onSend(text.trim(), withLink)}
          className="pf-press inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-[12px] font-semibold text-white transition-opacity hover:opacity-90 disabled:opacity-50">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}{busy ? T.SENDING : T.SEND}
        </button>
      </div>
    </div>
  )
}

/** Search box + list: type part of a name or email, arrows + Enter or click; the pick shows as a chip (x = pick again). */
function PersonPicker({ people, loading, everyone, value, onChange }: {
  people: NoticePerson[]; loading: boolean; everyone: boolean; value: string; onChange: (v: string) => void
}) {
  const [q, setQ] = useState('')
  const [active, setActive] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const options = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    const hit = (p: NoticePerson) => words.every((w) => p.name.toLowerCase().includes(w) || p.email.toLowerCase().includes(w))
    const list = people.filter(hit).map((p) => ({ key: String(p.id), label: p.name, sub: p.email }))
    const all = everyone && words.every((w) => T.EVERYONE.toLowerCase().includes(w))
    return all ? [{ key: 'everyone', label: T.EVERYONE, sub: T.EVERYONE_SUB }, ...list] : list
  }, [people, q, everyone])
  const pick = (key: string) => { onChange(key); setQ(''); setActive(0) }

  if (value) {
    const person = people.find((x) => String(x.id) === value)
    const label = value === 'everyone' ? T.EVERYONE : person?.name ?? value
    const sub = value === 'everyone' ? T.EVERYONE_SUB : person?.email ?? ''
    return (
      <div className="pf-pop-in flex items-center gap-2 rounded-md border border-primary/40 bg-primary-soft/50 px-2 py-1.5">
        {value === 'everyone'
          ? <Users className="size-3.5 text-primary" />
          : <span className="flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-white">{initial(label)}</span>}
        <span className="min-w-0 flex-1 truncate text-[12.5px]"><span className="font-semibold text-ink-900">{label}</span>{sub && <span className="ml-1.5 text-ink-400">{sub}</span>}</span>
        <button type="button" aria-label={T.CHANGE} title={T.CHANGE} onClick={() => { onChange(''); setTimeout(() => input.current?.focus(), 0) }}
          className="rounded p-0.5 text-ink-400 transition-colors hover:bg-surface hover:text-ink-900"><X className="size-3.5" /></button>
      </div>
    )
  }
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive((a) => Math.min(a + 1, options.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && options[active]) { e.preventDefault(); pick(options[active].key) }
    else if (e.key === 'Escape' && q) { e.stopPropagation(); setQ('') }
  }
  return (
    <div className="rounded-md border border-line bg-surface transition-[border-color,box-shadow] duration-200 focus-within:border-primary focus-within:ring-2 focus-within:ring-primary/15">
      <div className="flex items-center gap-1.5 border-b border-line px-2">
        <Search className="size-3.5 shrink-0 text-ink-400" />
        <input ref={input} value={q} onChange={(e) => { setQ(e.target.value); setActive(0) }} onKeyDown={onKey} placeholder={T.SEARCH} aria-label={T.TO} autoFocus
          className="h-8 w-full bg-transparent text-[12.5px] text-ink-900 outline-none" />
      </div>
      <div className="max-h-44 overflow-y-auto p-1" role="listbox">
        {loading && <div className="px-2 py-2 text-[12px] text-ink-400">{T.LOADING}</div>}
        {!loading && !options.length && <div className="px-2 py-2 text-[12px] text-ink-400">{T.NO_MATCH}</div>}
        {options.map((o, i) => (
          <button key={o.key} type="button" role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => pick(o.key)}
            className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left text-[12.5px] transition-colors duration-100 ${i === active ? 'bg-primary-soft' : ''}`}>
            {o.key === 'everyone'
              ? <Users className="size-3.5 shrink-0 text-primary" />
              : <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-alt text-[10px] font-bold text-ink-600">{initial(o.label)}</span>}
            <span className="min-w-0 flex-1 truncate"><span className="font-semibold text-ink-900">{o.label}</span><span className="ml-1.5 text-ink-400">{o.sub}</span></span>
          </button>
        ))}
      </div>
    </div>
  )
}

export function NoticeSendForm({ canSendEveryone, onSent, onCancel }: { canSendEveryone: boolean; onSent: (b: MyNotices) => void; onCancel: () => void }) {
  const location = useLocation()
  const people = useQuery({ queryKey: noticePeopleKey, queryFn: ({ signal }) => noticePeople(signal), staleTime: 5 * 60_000 })
  const [to, setTo] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const send = async (text: string, withLink: boolean) => {
    if (!to) return setError(T.PICK)
    setBusy(true)
    setError(null)
    try {
      const body: NoticeSend = { to: to === 'everyone' ? 'everyone' : Number(to), text, ...(withLink ? { link: location.pathname + location.search } : {}) }
      onSent(await sendNotice(body))
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="border-b border-line bg-alt/40 px-3 py-2.5">
      <div className="mb-2 text-[12.5px] font-semibold text-ink-900">{T.SEND_TITLE}</div>
      <Compose placeholder={T.PLACEHOLDER} busy={busy} error={error} onSend={(t, l) => void send(t, l)} onCancel={onCancel}>
        <PersonPicker people={people.data ?? []} loading={people.isLoading} everyone={canSendEveryone} value={to} onChange={(v) => { setTo(v); setError(null) }} />
      </Compose>
    </div>
  )
}

export function NoticeRow({ n, fresh, onSent, onOpenLink }: { n: Notice; fresh: boolean; onSent: (b: MyNotices) => void; onOpenLink: (link: string) => void }) {
  const box = useLeaving(NOTICE_REVEAL_OUT_MS)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const location = useLocation()
  const reply = async (text: string, withLink: boolean) => {
    setBusy(true)
    setError(null)
    try {
      onSent(await sendNotice({ replyToId: n.id, text, ...(withLink ? { link: location.pathname + location.search } : {}) }))
      box.hide()
    } catch (e) {
      setError(e instanceof ApiError ? e.message : String(e))
    } finally {
      setBusy(false)
    }
  }
  const head = n.sent ? T.YOU_TO(nameOf(n.to)) : n.to === 'everyone' ? T.FROM_TO_ALL(n.from.name) : n.from.name
  return (
    <div className={`flex gap-2 border-b border-line px-3 py-2 transition-colors duration-500 last:border-b-0 ${fresh ? 'bg-primary-soft/40' : ''}`}>
      <Megaphone className={`mt-0.5 size-3.5 shrink-0 ${n.sent ? 'text-ink-400' : 'text-primary'}`} />
      <div className="min-w-0 flex-1">
        <div className="text-[12.5px] font-semibold text-ink-900">{head}</div>
        {n.replyQuote && <div className="mt-0.5 truncate text-[11.5px] italic text-ink-400">{T.RE(n.replyQuote)}</div>}
        <div className="mt-0.5 whitespace-pre-wrap break-words text-[12.5px] text-ink-900">{n.text}</div>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-ink-400">
          <span>{istDateTime(n.createdAt)} · {T.GONE_IN(hoursLeft(n))}</span>
          {n.link && (
            <button type="button" onClick={() => onOpenLink(n.link!)} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              <ExternalLink className="size-3" />{T.OPEN_LINK}
            </button>
          )}
          {n.canReply && !box.shown && (
            <button type="button" onClick={box.show} className="inline-flex items-center gap-1 font-semibold text-primary hover:underline">
              <Reply className="size-3" />{T.REPLY}
            </button>
          )}
        </div>
        {box.shown && (
          <div className={box.leaving ? 'pf-reveal-out' : 'pf-reveal'}>
            <div>
              <div className="pt-2">
                <Compose focus placeholder={T.REPLY_PLACEHOLDER} busy={busy} error={error} onSend={(t, l) => void reply(t, l)} onCancel={box.hide} />
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
