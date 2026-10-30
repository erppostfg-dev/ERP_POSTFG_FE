import { useState } from 'react'
import { AlertTriangle, Check, History, Mail, Pause, Play, Send, Trash2, UserPlus, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Drawer } from '../../components/ui'
import { Field, inputCls } from '../../components/kit'
import { SelectBox } from '../../components/pickers'
import { ApiError } from '../../api/client'
import {
  addMailRecipient, getMailListHistory, listMailLists, listUsers, removeMailRecipient, sendMailListTest, setMailListEnabled, updateMailRecipient,
  type MailList, type MailRecipient, type RecipientKind,
} from '../../api/admin'
import { EMAIL_TEXT, RECIPIENT_KIND_LABEL, RECIPIENT_KINDS } from '../../constants/admin'
import { istDateTime } from '../../lib/time'
import { Toggle } from '../ops/VerifySettings'

/*
 * Users & Roles -> Email (2026-10-30, user): one card per mail the ERP sends (the list comes from the backend), with who
 * gets it - any email address as To / CC / BCC, paused without being removed - a switch for the whole mail, a test send
 * (to me, or to the list) and the history of changes.
 */

const KEY = ['admin', 'mail-lists'] as const
type Notice = { tone: 'ok' | 'err'; text: string } | null
/** What a change says when it worked: fixed text, or made from its answer. */
type Ok<T> = string | ((result: T) => string)
type Act = <T>(fn: () => Promise<T>, ok?: Ok<T>) => Promise<void>
const errText = (e: unknown) => (e instanceof ApiError ? (Array.isArray(e.details) ? (e.details as { message: string }[]).map((d) => d.message).join(' · ') : e.message) : String(e))
const kindByLabel = Object.fromEntries(RECIPIENT_KINDS.map((k) => [RECIPIENT_KIND_LABEL[k], k])) as Record<string, RecipientKind>

export function EmailTab() {
  const qc = useQueryClient()
  const lists = useQuery({ queryKey: KEY, queryFn: ({ signal }) => listMailLists(signal) })
  const [notice, setNotice] = useState<Notice>(null)
  const refresh = () => void qc.invalidateQueries({ queryKey: KEY })
  const run: Act = async (fn, ok) => {
    try {
      const result = await fn()
      if (ok) setNotice({ tone: 'ok', text: typeof ok === 'string' ? ok : ok(result) })
    } catch (e) {
      setNotice({ tone: 'err', text: errText(e) })
    }
    refresh()
  }

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-ink-600">{EMAIL_TEXT.SUB}</p>
      {notice && (
        <div className={`pf-tab-in flex items-start gap-2 rounded-[var(--radius)] px-3 py-2 text-[12.5px] ${notice.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'}`}>
          {notice.tone === 'ok' ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
          <span className="flex-1">{notice.text}</span>
          <button onClick={() => setNotice(null)} aria-label="Close"><X className="size-4" /></button>
        </div>
      )}
      {lists.isPending && <p className="text-[12.5px] text-ink-400">Loading…</p>}
      {lists.isError && <p className="text-[12.5px] text-crit">{errText(lists.error)}</p>}
      {lists.data?.map((l) => <MailCard key={l.key} list={l} run={run} />)}
    </div>
  )
}

function MailCard({ list, run }: { list: MailList; run: Act }) {
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [history, setHistory] = useState(false)
  const act: Act = async (fn, ok) => {
    setBusy(true)
    await run(fn, ok)
    setBusy(false)
  }
  const test = (onlyMe: boolean) => act(() => sendMailListTest(list.key, onlyMe), (r) => EMAIL_TEXT.TESTED([...r.to, ...r.cc, ...r.bcc]))
  const active = list.recipients.filter((r) => !r.paused).length

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface">
      <div className="flex flex-wrap items-start gap-3 border-b border-line px-4 py-3">
        <Mail className="mt-0.5 size-4 shrink-0 text-primary" />
        <div className="min-w-[220px] flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[14px] font-semibold text-ink-900">{list.name}</h3>
            <Badge tone="neutral">{list.area}</Badge>
            {list.enabled ? <Badge tone="ok">{active} active</Badge> : <Badge tone="warn">Off</Badge>}
          </div>
          <p className="mt-0.5 text-[12px] text-ink-600">{list.description}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-[12px] text-ink-600">{list.enabled ? 'On' : 'Off'}</span>
          <Toggle on={list.enabled} busy={busy} onChange={(v) => void act(() => setMailListEnabled(list.key, v))} />
          <Button icon={<Send className="size-3.5" />} disabled={busy} onClick={() => void test(true)}>{EMAIL_TEXT.TEST_ME}</Button>
          <Button icon={<Send className="size-3.5" />} disabled={busy || !list.enabled || !active} onClick={() => void test(false)}>{EMAIL_TEXT.TEST_LIST}</Button>
          <Button icon={<History className="size-3.5" />} onClick={() => setHistory(true)}>{EMAIL_TEXT.HISTORY}</Button>
          <Button variant="primary" icon={<UserPlus className="size-3.5" />} onClick={() => setAdding(true)}>{EMAIL_TEXT.ADD}</Button>
        </div>
      </div>

      {!list.enabled && <p className="px-4 pt-2 text-[12px] text-warn">{EMAIL_TEXT.OFF}</p>}
      {list.recipients.length ? (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[11.5px] text-ink-400">
              <th className="px-4 py-2 font-semibold">Email</th>
              <th className="px-2 py-2 font-semibold">As</th>
              <th className="px-2 py-2 font-semibold">Status</th>
              <th className="px-2 py-2 font-semibold">Added</th>
              <th className="px-4 py-2" />
            </tr>
          </thead>
          <tbody>
            {list.recipients.map((r) => <RecipientRow key={r.id} list={list} r={r} busy={busy} act={act} />)}
          </tbody>
        </table>
      ) : <p className="px-4 py-3 text-[12.5px] text-ink-400">{EMAIL_TEXT.NOBODY}</p>}

      {adding && <AddRecipient list={list} onClose={() => setAdding(false)} onAdded={(email) => void run(() => Promise.resolve(), EMAIL_TEXT.ADDED(email))} />}
      {history && <HistoryDrawer list={list} onClose={() => setHistory(false)} />}
    </div>
  )
}

function RecipientRow({ list, r, busy, act }: { list: MailList; r: MailRecipient; busy: boolean; act: Act }) {
  return (
    <tr className={`border-t border-line ${r.paused ? 'text-ink-400' : ''}`}>
      <td className="px-4 py-1.5 font-medium">{r.email}</td>
      <td className="w-[110px] px-2 py-1">
        <SelectBox value={RECIPIENT_KIND_LABEL[r.kind]} options={RECIPIENT_KINDS.map((k) => RECIPIENT_KIND_LABEL[k])} allowEmpty={false}
          onChange={(v) => void act(() => updateMailRecipient(list.key, r.id, { kind: kindByLabel[v] }))} />
      </td>
      <td className="px-2 py-1.5">{r.paused ? <Badge tone="neutral">Paused</Badge> : <Badge tone="ok">Active</Badge>}</td>
      <td className="px-2 py-1.5 text-[12px] text-ink-600">{r.addedBy ?? '—'}, {istDateTime(r.addedAt)}</td>
      <td className="px-4 py-1.5 text-right">
        <span className="inline-flex items-center gap-3">
          <button disabled={busy} onClick={() => void act(() => updateMailRecipient(list.key, r.id, { paused: !r.paused }))}
            className="inline-flex items-center gap-1 text-[12px] text-primary hover:underline disabled:opacity-50">
            {r.paused ? <><Play className="size-3.5" />Resume</> : <><Pause className="size-3.5" />Pause</>}
          </button>
          <button disabled={busy} title={`Remove ${r.email}`} aria-label={`Remove ${r.email}`}
            onClick={() => { if (window.confirm(`Remove ${r.email} from "${list.name}"?`)) void act(() => removeMailRecipient(list.key, r.id), EMAIL_TEXT.REMOVED(r.email)) }}
            className="text-ink-400 hover:text-crit disabled:opacity-50"><Trash2 className="size-3.5" /></button>
        </span>
      </td>
    </tr>
  )
}

function AddRecipient({ list, onClose, onAdded }: { list: MailList; onClose: () => void; onAdded: (email: string) => void }) {
  // ERP users as suggestions; any other address can be typed
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: ({ signal }) => listUsers(signal) })
  const [email, setEmail] = useState('')
  const [kind, setKind] = useState<RecipientKind>('to')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const listId = `mail-suggest-${list.key}`
  const save = async (close: () => void) => {
    setBusy(true)
    setError(null)
    try {
      await addMailRecipient(list.key, { email: email.trim(), kind })
      onAdded(email.trim().toLowerCase())
      close()
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }
  return (
    <Drawer open onClose={onClose} title={EMAIL_TEXT.ADD} sub={list.name}
      footer={(close) => (
        <>
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" disabled={busy || !email.trim()} onClick={() => void save(close)}>{busy ? 'Adding…' : 'Add'}</Button>
        </>
      )}>
      <Field label="Email">
        <input value={email} onChange={(e) => setEmail(e.target.value)} list={listId} placeholder="name@company.com" className={inputCls} autoFocus />
        <datalist id={listId}>
          {(users.data ?? []).filter((u) => u.status === 'active').map((u) => <option key={u.id} value={u.email}>{u.name}</option>)}
        </datalist>
      </Field>
      <Field label="As">
        <SelectBox value={RECIPIENT_KIND_LABEL[kind]} options={RECIPIENT_KINDS.map((k) => RECIPIENT_KIND_LABEL[k])} allowEmpty={false} onChange={(v) => setKind(kindByLabel[v])} />
      </Field>
      <p className="mt-2 text-[12px] text-ink-400">Any email address can be added, also from outside the company. BCC people get the mail without the others seeing them.</p>
      {error && <p className="mt-2 text-[12.5px] text-crit">{error}</p>}
    </Drawer>
  )
}

function HistoryDrawer({ list, onClose }: { list: MailList; onClose: () => void }) {
  const history = useQuery({ queryKey: [...KEY, 'history', list.key], queryFn: ({ signal }) => getMailListHistory(list.key, signal) })
  return (
    <Drawer open onClose={onClose} title={EMAIL_TEXT.HISTORY} sub={list.name}>
      {history.isPending && <p className="text-[12.5px] text-ink-400">Loading…</p>}
      {history.isError && <p className="text-[12.5px] text-crit">{errText(history.error)}</p>}
      {history.data && !history.data.length && <p className="text-[12.5px] text-ink-400">{EMAIL_TEXT.NO_HISTORY}</p>}
      <ul className="divide-y divide-line">
        {history.data?.map((h, i) => (
          <li key={i} className="py-2 text-[12.5px]">
            <div className="text-ink-900">{h.what}</div>
            <div className="text-[11.5px] text-ink-400">{h.by ?? 'unknown'} · {istDateTime(h.at)}</div>
          </li>
        ))}
      </ul>
    </Drawer>
  )
}
