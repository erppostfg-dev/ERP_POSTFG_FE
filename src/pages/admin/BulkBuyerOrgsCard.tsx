import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Building2 } from 'lucide-react'
import { addBuyerOrg, listBuyerOrgs, updateBuyerOrg, type BulkBuyerOrg } from '../../api/bulkOrders'
import { BULK_TEXT } from '../../constants/bulkOrders'
import { errorText } from '../../lib/friendlyError'

/*
 * Users & Roles -> Settings -> Bulk Orders -> Buyer organisations (2026-11-24, user "yes do this too"): an outside buyer
 * organisation and its people (emails of people already in Users & Roles, one organisation each). Its people see only
 * its orders + customers in the portal; our people see everything. Switched off, never deleted.
 */

const input = 'rounded-md border border-line bg-surface px-2.5 py-1.5 text-[12.5px] outline-none focus:border-primary'
const emailsOf = (text: string) => text.split(/[\s,;]+/).map((e) => e.trim()).filter(Boolean)

function OrgRow({ o, onDone }: { o: BulkBuyerOrg; onDone: () => void }) {
  const [editing, setEditing] = useState(false)
  const [name, setName] = useState(o.name)
  const [emails, setEmails] = useState(o.members.map((m) => m.email).join(', '))
  const [err, setErr] = useState('')
  const save = useMutation({
    mutationFn: (change: { name?: string; active?: boolean; emails?: string[] }) => updateBuyerOrg(o.id, change),
    onSuccess: () => { setEditing(false); setErr(''); onDone() },
    onError: (e) => setErr(errorText(e)),
  })
  return (
    <li className={`border-t border-line px-3 py-2.5 first:border-t-0 ${o.active ? '' : 'opacity-60'}`}>
      {editing ? (
        <div className="flex flex-col gap-2">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={BULK_TEXT.ORG_NAME} />
          <textarea rows={2} className={input} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={BULK_TEXT.ORG_EMAILS} />
          <div className="flex gap-2">
            <button disabled={save.isPending || !name.trim()} onClick={() => save.mutate({ name: name.trim(), emails: emailsOf(emails) })} className="rounded-md bg-primary px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50">{BULK_TEXT.SAVE}</button>
            <button onClick={() => setEditing(false)} className="rounded-md border border-line px-3 py-1 text-[12px]">{BULK_TEXT.CANCEL}</button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          <strong className="text-ink-900">{o.name}</strong>
          {!o.active && <span className="rounded-full bg-alt px-2 py-0.5 text-[11px] text-ink-600">{BULK_TEXT.CUSTOMER_OFF}</span>}
          <span className="text-ink-600">{o.members.length ? o.members.map((m) => m.email).join(', ') : BULK_TEXT.ORG_NO_PEOPLE}</span>
          <button onClick={() => setEditing(true)} className="ml-auto rounded-md border border-line px-2 py-0.5 text-[12px] font-semibold">{BULK_TEXT.CUSTOMER_EDIT}</button>
          <button disabled={save.isPending} onClick={() => save.mutate({ active: !o.active })} className="rounded-md border border-line px-2 py-0.5 text-[12px] text-ink-600">{o.active ? BULK_TEXT.CUSTOMER_SWITCH_OFF : BULK_TEXT.CUSTOMER_SWITCH_ON}</button>
        </div>
      )}
      {err && <div className="mt-1 text-[12px] text-crit">{err}</div>}
    </li>
  )
}

export function BulkBuyerOrgsCard() {
  const qc = useQueryClient()
  const list = useQuery({ queryKey: ['bulk', 'orgs'], queryFn: listBuyerOrgs })
  const [name, setName] = useState('')
  const [emails, setEmails] = useState('')
  const [err, setErr] = useState('')
  const refresh = () => void qc.invalidateQueries({ queryKey: ['bulk', 'orgs'] })
  const add = useMutation({
    mutationFn: () => addBuyerOrg(name.trim(), emailsOf(emails)),
    onSuccess: () => { setName(''); setEmails(''); setErr(''); refresh() },
    onError: (e) => setErr(errorText(e)),
  })
  return (
    <div className="flex items-start gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
      <Building2 className="mt-0.5 size-5 shrink-0 text-primary" />
      <div className="flex-1">
        <div className="text-[14px] font-semibold text-ink-900">{BULK_TEXT.ORGS_TITLE}</div>
        <p className="mt-1 max-w-3xl text-[12.5px] text-ink-600">{BULK_TEXT.ORGS_SUB}</p>
        <div className="mt-3 grid gap-2 md:grid-cols-[1fr_2fr_auto]">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} placeholder={BULK_TEXT.ORG_NAME} />
          <input className={input} value={emails} onChange={(e) => setEmails(e.target.value)} placeholder={BULK_TEXT.ORG_EMAILS} />
          <button disabled={!name.trim() || add.isPending} onClick={() => add.mutate()} className="rounded-md bg-primary px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-50">{BULK_TEXT.ORG_ADD}</button>
        </div>
        {err && <div className="mt-1.5 text-[12px] text-crit">{err}</div>}
        {list.isError && <div className="mt-1.5 text-[12px] text-crit">{list.error.message}</div>}
        {!!list.data?.length && <ul className="mt-3 rounded-md border border-line">{list.data.map((o) => <OrgRow key={`${o.id}-${o.updatedAt}`} o={o} onDone={refresh} />)}</ul>}
      </div>
    </div>
  )
}
