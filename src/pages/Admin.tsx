import { useEffect, useMemo, useState } from 'react'
import { AlertTriangle, Check, Info, Lock, Mail, Search, ShieldCheck, UserPlus, X } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Badge, Button, Drawer, PageTitle, SubTabs } from '../components/ui'
import { DataGrid, Field, MultiSelect, inputCls } from '../components/kit'
import { SelectBox } from '../components/pickers'
import { ApiError } from '../api/client'
import {
  createUser, getRolePages, getUserOptions, listRoles, listUsers, resendWelcome, updateRole, updateUser,
  type AccessLevel, type AdminUser, type RoleItem, type RolePage, type UserBody, type UserOptions,
} from '../api/admin'
import { ACCESS_LABEL, ACCESS_LEVELS, ADMIN_TEXT, EMAIL_TEXT, SETTINGS_SECTIONS, type SettingsSection } from '../constants/admin'
import { istDateTime } from '../lib/time'
import { PATHS, URL_PARAM } from '../constants/pages'
import { oneOf, useUrlParam } from '../lib/urlState'
import type { ColKind } from '../lib/ops'
import { Toggle, VerifySettings } from './ops/VerifySettings'
import { ReviewRulesDummy } from './SettingsDummy'
import { EmailTab } from './admin/EmailTab'
import { IntakeSettings } from './ops/IntakeSettings'
import { VERIFY_SETTINGS_TEXT } from '../constants/poVerify'

/*
 * Users & Roles (2026-10-15, user): admins / developers add people with a role, a PO Overview team and facilities;
 * the backend saves them, gives the access and sends the welcome email (Resend when it failed). Roles tab: a FIXED list
 * of roles (user, 2026-10-16: no creating or renaming on the screen; new roles are added by the developer); an admin
 * can change a role's page access (Hidden / View / Edit). Built-in roles (admin, developer) are read-only. Nobody is
 * deleted: people are switched off. Settings tab (2026-10-22): the verify-before-Uniware switch per channel (VerifySettings).
 * PO issues moved to PO Processing & Review (2026-10-29: for everyone with that page).
 * Email tab (2026-10-30): who gets each mail the ERP sends (pages/admin/EmailTab.tsx).
 */

const TABS = ['users', 'roles', 'email', 'settings'] as const
type Tab = (typeof TABS)[number]
type Notice = { tone: 'ok' | 'err'; text: string } | null
const errText = (e: unknown) => (e instanceof ApiError ? (Array.isArray(e.details) ? (e.details as { message: string }[]).map((d) => d.message).join(' · ') : e.message) : String(e))

export default function Admin() {
  const [tab, setTab] = useUrlParam<Tab>(PATHS.ADMIN, URL_PARAM.TAB, oneOf(TABS), 'users')
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: ({ signal }) => listUsers(signal) })
  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: ({ signal }) => listRoles(signal) })
  return (
    <div className="space-y-5">
      <PageTitle title={ADMIN_TEXT.TITLE} sub={ADMIN_TEXT.SUB} />
      <SubTabs value={tab} onChange={setTab} tabs={[{ key: 'users', label: 'Users', count: users.data?.length }, { key: 'roles', label: 'Roles', count: roles.data?.length }, { key: 'email', label: EMAIL_TEXT.TAB }, { key: 'settings', label: VERIFY_SETTINGS_TEXT.TAB }]} />
      <div key={tab} className="pf-tab-in">{tab === 'users' ? <UsersTab /> : tab === 'roles' ? <RolesTab /> : tab === 'email' ? <EmailTab /> : <SettingsTab />}</div>
    </div>
  )
}

// ---- Settings: one inner tab per group (SETTINGS_SECTIONS), so more settings can be added later ----------------------

function SettingsTab() {
  const [section, setSection] = useUrlParam<SettingsSection>(PATHS.ADMIN, URL_PARAM.SECTION, oneOf(SETTINGS_SECTIONS.map((s) => s.key)), SETTINGS_SECTIONS[0].key)
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-1 rounded-[var(--radius)] bg-alt/70 p-1">
        {SETTINGS_SECTIONS.map((s) => (
          <button key={s.key} type="button" onClick={() => setSection(s.key)} title={s.hint}
            className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-150 ${section === s.key ? 'bg-primary text-white shadow-sm' : 'text-ink-600 hover:bg-surface hover:text-ink-900'}`}>
            {s.label}
            {'dummy' in s && <span className="ml-1.5 rounded bg-warn-soft px-1 text-[10px] font-semibold text-warn">dummy</span>}
          </button>
        ))}
      </div>
      <div key={section} className="pf-tab-in">
        {section === 'po-verify' && <VerifySettings />}
        {section === 'review-rules' && <ReviewRulesDummy />}
        {section === 'po-intake' && <IntakeSettings />}
      </div>
    </div>
  )
}

// ---- Users -------------------------------------------------------------------------------------------------------

type URow = { id: number; name: string; email: string; roles: string; team: string; facilities: string; status: string; addedBy: string; lastLogin: string; user: AdminUser }
const UCOLS: [string, keyof URow, ColKind][] = [['Name', 'name', 'text'], ['Email', 'email', 'mono'], ['Role', 'roles', 'text'], ['Team', 'team', 'text'], ['Facilities', 'facilities', 'mono'], ['Added by', 'addedBy', 'text'], ['Last sign-in', 'lastLogin', 'mono']]

function UsersTab() {
  const qc = useQueryClient()
  const users = useQuery({ queryKey: ['admin', 'users'], queryFn: ({ signal }) => listUsers(signal) })
  const options = useQuery({ queryKey: ['admin', 'user-options'], queryFn: ({ signal }) => getUserOptions(signal) })
  const [q, setQ] = useState('')
  const [edit, setEdit] = useState<AdminUser | 'new' | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  const roleLabel = (k: string) => options.data?.roles.find((r) => r.key === k)?.label ?? k
  const teamLabel = (k: string | null) => (k ? options.data?.teams.find((t) => t.key === k)?.label ?? k : '—')
  const rows: URow[] = useMemo(() => (users.data ?? [])
    .filter((u) => !q.trim() || [u.name, u.email, ...u.roles, u.team ?? ''].some((v) => v.toLowerCase().includes(q.trim().toLowerCase())))
    .map((u) => ({
      id: u.id, name: u.name, email: u.email, roles: u.roles.map(roleLabel).join(', ') || '—', team: teamLabel(u.team), facilities: u.facilities.join(', ') || '—',
      status: u.status, addedBy: u.addedBy ?? '—', lastLogin: u.lastLoginAt ? istDateTime(u.lastLoginAt) : 'Never', user: u,
    })), [users.data, options.data, q]) // eslint-disable-line react-hooks/exhaustive-deps
  const refresh = () => void qc.invalidateQueries({ queryKey: ['admin'] })

  const toggle = async (u: AdminUser) => {
    try {
      await updateUser(u.id, { status: u.status === 'active' ? 'inactive' : 'active' })
      setNotice({ tone: 'ok', text: `${u.email} switched ${u.status === 'active' ? 'off' : 'on'}.` })
      refresh()
    } catch (e) { setNotice({ tone: 'err', text: errText(e) }) }
  }
  const resend = async (u: AdminUser) => {
    try {
      await resendWelcome(u.id)
      setNotice({ tone: 'ok', text: ADMIN_TEXT.RESENT(u.email) })
    } catch (e) { setNotice({ tone: 'err', text: errText(e) }) }
    refresh()
  }

  return (
    <div className="space-y-3">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <div className="flex flex-wrap items-center gap-3">
        <label className="flex h-9 w-full max-w-[340px] items-center gap-2 rounded-[var(--radius)] border border-line bg-surface px-3">
          <Search className="size-4 text-ink-400" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, role, team…" className="w-full bg-transparent text-[13px] outline-none" />
        </label>
        <div className="ml-auto"><Button variant="primary" icon={<UserPlus className="size-4" />} onClick={() => setEdit('new')}>{ADMIN_TEXT.ADD_USER}</Button></div>
      </div>
      {users.isError ? <p className="text-[12.5px] text-crit">{errText(users.error)}</p> : (
        <DataGrid cols={UCOLS} rows={rows} rowKey={(r) => String(r.id)} onRowClick={(r) => setEdit(r.user)} pageSize={25}
          trailing={[
            { label: 'Status', render: (r) => <Badge tone={r.status === 'active' ? 'ok' : 'neutral'}>{r.status === 'active' ? 'Active' : 'Off'}</Badge> },
            { label: 'Welcome email', render: (r) => r.user.welcomeSentAt
              ? <span className="inline-flex items-center gap-1 text-[12px] text-ok"><Check className="size-3.5" />{istDateTime(r.user.welcomeSentAt)}</span>
              : r.user.welcomeError ? <span className="inline-flex items-center gap-1 text-[12px] text-crit" title={r.user.welcomeError}><AlertTriangle className="size-3.5" />{ADMIN_TEXT.EMAIL_NOT_SENT}</span>
              : <span className="text-[12px] text-ink-400">—</span> },
          ]}
          rowMenu={(r) => [
            { label: 'Edit', onClick: () => setEdit(r.user) },
            { label: r.user.status === 'active' ? 'Switch off' : 'Switch on', onClick: () => void toggle(r.user) },
            { label: 'Send welcome email', onClick: () => void resend(r.user) },
          ]} />
      )}
      {edit && options.data && (
        <UserDrawer user={edit === 'new' ? null : edit} options={options.data} onClose={() => setEdit(null)}
          onSaved={(text) => { setNotice({ tone: 'ok', text }); setEdit(null); refresh() }} />
      )}
    </div>
  )
}

function NoticeBar({ notice, onClose }: { notice: Notice; onClose: () => void }) {
  if (!notice) return null
  return (
    <div className={`pf-tab-in flex items-start gap-2 rounded-[var(--radius)] px-3 py-2 text-[12.5px] ${notice.tone === 'ok' ? 'bg-ok-soft text-ok' : 'bg-crit-soft text-crit'}`}>
      {notice.tone === 'ok' ? <Check className="mt-0.5 size-4 shrink-0" /> : <AlertTriangle className="mt-0.5 size-4 shrink-0" />}
      <span className="flex-1">{notice.text}</span>
      <button onClick={onClose}><X className="size-4" /></button>
    </div>
  )
}

function UserDrawer({ user, options, onClose, onSaved }: { user: AdminUser | null; options: UserOptions; onClose: () => void; onSaved: (text: string) => void }) {
  const [email, setEmail] = useState(user?.email ?? '')
  const [name, setName] = useState(user?.name ?? '')
  const [roles, setRoles] = useState<string[]>(user?.roles ?? [])
  const [team, setTeam] = useState<string>(user?.team ?? '')
  const [facilities, setFacilities] = useState<string[]>(user?.facilities ?? [])
  const [sendEmail, setSendEmail] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const scoped = options.facilityScopedTeams.includes(team)
  const roleByLabel = new Map(options.roles.map((r) => [r.label, r.key]))
  const domainOk = !email.trim() || email.trim().toLowerCase().endsWith(`@${options.emailDomain}`)

  const save = async () => {
    setBusy(true)
    setError(null)
    const body: UserBody = { name: name.trim() || undefined, roles, team: team || null, facilities: scoped ? facilities : [] }
    try {
      if (user) { await updateUser(user.id, body); onSaved(ADMIN_TEXT.SAVED) }
      else { await createUser({ ...body, email: email.trim(), sendEmail }); onSaved(ADMIN_TEXT.ADDED(email.trim(), sendEmail)) }
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <Drawer open onClose={onClose} title={user ? user.name : ADMIN_TEXT.ADD_USER} sub={user ? user.email : `Only @${options.emailDomain} addresses (they sign in with Google)`}
      footer={(close) => (
        <>
          {error && <span className="mr-auto flex items-center gap-1 text-[12px] text-crit"><AlertTriangle className="size-3.5 shrink-0" />{error}</span>}
          <Button onClick={close}>Cancel</Button>
          <Button variant="primary" onClick={save} disabled={busy || (!user && (!email.trim() || !domainOk))}>{busy ? 'Saving…' : user ? 'Save changes' : ADMIN_TEXT.ADD_USER}</Button>
        </>
      )}>
      <div className="divide-y divide-line">
        {!user && (
          <Field label="Email *">
            <input autoFocus value={email} onChange={(e) => setEmail(e.target.value)} placeholder={`name@${options.emailDomain}`} className={`${inputCls} ${domainOk ? '' : 'border-crit/60'}`} />
            {!domainOk && <div className="mt-1 text-[11.5px] text-crit">Must end with @{options.emailDomain}</div>}
          </Field>
        )}
        <Field label="Name"><input value={name} onChange={(e) => setName(e.target.value)} placeholder="From the email if empty" className={inputCls} /></Field>
        <Field label="Role">
          <MultiSelect value={roles.map((k) => options.roles.find((r) => r.key === k)?.label ?? k)} onChange={(labels) => setRoles(labels.map((l) => roleByLabel.get(l) ?? l))}
            options={options.roles.map((r) => r.label)} placeholder="Pick the role(s)" />
          <div className="mt-1 text-[11.5px] text-ink-400">The role decides which pages they can open, view or edit (Roles tab).</div>
        </Field>
        <Field label="PO Overview team">
          <SelectBox value={options.teams.find((t) => t.key === team)?.label ?? ''} options={options.teams.map((t) => t.label)}
            onChange={(l) => setTeam(options.teams.find((t) => t.label === l)?.key ?? '')} placeholder="No team" />
          <div className="mt-1 text-[11.5px] text-ink-400">Which PO Overview columns they edit. Admins / developers need no team.</div>
        </Field>
        {scoped && (
          <Field label="Facilities">
            <MultiSelect value={facilities} onChange={setFacilities} options={options.facilities.map((f) => f.code)} placeholder="Pick their warehouses" />
            <div className="mt-1 text-[11.5px] text-ink-400">They edit only these facilities' shipments (codes are case-sensitive).</div>
          </Field>
        )}
        {!user && (
          <Field label="Welcome email">
            <label className="flex items-center gap-2 pt-1.5 text-[13px]"><input type="checkbox" checked={sendEmail} onChange={(e) => setSendEmail(e.target.checked)} /> Send it now</label>
          </Field>
        )}
        {user?.welcomeError && (
          <div className="flex items-start gap-2 py-2 text-[12px] text-crit"><Mail className="mt-0.5 size-3.5 shrink-0" />Last welcome email failed: {user.welcomeError}</div>
        )}
      </div>
    </Drawer>
  )
}

// ---- Roles -------------------------------------------------------------------------------------------------------

function RolesTab() {
  const qc = useQueryClient()
  const roles = useQuery({ queryKey: ['admin', 'roles'], queryFn: ({ signal }) => listRoles(signal) })
  const pages = useQuery({ queryKey: ['admin', 'role-pages'], queryFn: ({ signal }) => getRolePages(signal) })
  const [sel, setSel] = useState<string | null>(null)
  const [notice, setNotice] = useState<Notice>(null)
  useEffect(() => { if (!sel && roles.data?.length) setSel(roles.data.find((r) => !r.isSystem)?.key ?? roles.data[0].key) }, [roles.data, sel])
  const role = roles.data?.find((r) => r.key === sel) ?? null

  return (
    <div className="space-y-3">
      <NoticeBar notice={notice} onClose={() => setNotice(null)} />
      <div className="grid gap-4 lg:grid-cols-[260px_1fr]">
        <div className="space-y-1.5">
          <p className="flex items-start gap-1.5 text-[11.5px] text-ink-400"><Info className="mt-0.5 size-3.5 shrink-0" />{ADMIN_TEXT.FIXED_ROLES}</p>
          <ul className="mt-2 space-y-1">
            {(roles.data ?? []).map((r) => (
              <li key={r.key}>
                <button onClick={() => setSel(r.key)}
                  className={`flex w-full items-center gap-2 rounded-[var(--radius)] border px-3 py-2 text-left text-[13px] transition-colors ${sel === r.key ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:bg-alt'}`}>
                  {r.isSystem ? <ShieldCheck className="size-4 text-primary" /> : <span className="size-4" />}
                  <span className="min-w-0 flex-1 truncate font-medium text-ink-900">{r.label}</span>
                  <span className="text-[11px] text-ink-400">{r.users} user{r.users === 1 ? '' : 's'}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
        {pages.data && role && (
          <RoleEditor key={role.key} role={role} pages={pages.data}
            onSaved={(r) => { setNotice({ tone: 'ok', text: `${r.label}: page access saved.` }); void qc.invalidateQueries({ queryKey: ['admin'] }) }} />
        )}
      </div>
    </div>
  )
}

function RoleEditor({ role, pages, onSaved }: { role: RoleItem; pages: RolePage[]; onSaved: (r: RoleItem) => void }) {
  const [grants, setGrants] = useState<Record<string, AccessLevel>>(() => Object.fromEntries(pages.map((p) => [p.slug, role?.grants[p.slug] ?? 'none'])))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const locked = role.isSystem
  const sections = useMemo(() => [...new Set(pages.map((p) => p.section))], [pages])

  // A section's level is copied to its pages (they can still be set one by one after).
  const set = (p: RolePage, level: AccessLevel) => setGrants((g) => {
    const next = { ...g, [p.slug]: level }
    if (p.isSection) for (const c of pages.filter((x) => x.section === p.section && !x.isSection)) next[c.slug] = level
    return next
  })

  const save = async () => {
    setBusy(true)
    setError(null)
    try {
      onSaved(await updateRole(role.key, { grants }))
    } catch (e) { setError(errText(e)) } finally { setBusy(false) }
  }

  return (
    <div className="rounded-[var(--radius-card)] border border-line bg-surface p-4">
      {locked && <div className="mb-3 flex items-center gap-2 rounded-[var(--radius)] bg-primary-soft px-3 py-2 text-[12.5px] text-primary"><Lock className="size-4" />{ADMIN_TEXT.SYSTEM_ROLE}</div>}
      <div>
        <div className="text-[15px] font-semibold text-ink-900">{role.label}</div>
        {role.description && <div className="mt-0.5 text-[12.5px] text-ink-600">{role.description}</div>}
        <div className="mt-0.5 text-[11.5px] text-ink-400">{role.users} user{role.users === 1 ? '' : 's'} have this role</div>
      </div>
      <div className="mt-4 overflow-hidden rounded-[var(--radius)] border border-line">
        <table className="w-full text-[13px]">
          <thead className="bg-alt"><tr><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600">Page</th><th className="px-3 py-2 text-left text-[11px] font-semibold uppercase tracking-wide text-ink-600">Access</th></tr></thead>
          <tbody>
            {sections.map((s) => pages.filter((p) => p.section === s).map((p, idx) => [
              // A group with no section page of its own (Special permissions) gets a title row.
              idx === 0 && !p.isSection && (
                <tr key={`${s}-title`} className="border-t border-line bg-canvas"><td colSpan={2} className="px-3 py-1.5 font-semibold text-ink-900">{s}</td></tr>
              ),
              p.isCapability ? (
                <tr key={p.slug} className="border-t border-line">
                  <td className="py-1.5 pl-8 pr-3 text-ink-600">
                    <div>{p.label}</div>
                    {p.description && <div className="text-[11px] text-ink-400">{p.description}</div>}
                  </td>
                  <td className="px-3 py-1.5">
                    {locked ? <span className="text-[12px] font-medium text-primary">On</span> : (
                      <span className="inline-flex items-center gap-2.5">
                        <Toggle on={grants[p.slug] === 'editor'} busy={false} onChange={(v) => set(p, v ? 'editor' : 'none')} />
                        <span className={`text-[12px] font-semibold ${grants[p.slug] === 'editor' ? 'text-primary' : 'text-ink-400'}`}>{grants[p.slug] === 'editor' ? 'On' : 'Off'}</span>
                      </span>
                    )}
                  </td>
                </tr>
              ) : (
              <tr key={p.slug} className={`border-t border-line ${p.isSection ? 'bg-canvas' : ''}`}>
                <td className={`px-3 py-1.5 ${p.isSection ? 'font-semibold text-ink-900' : 'pl-8 text-ink-600'}`}>{p.label}</td>
                <td className="px-3 py-1.5">
                  {locked ? <span className="text-[12px] font-medium text-primary">Edit</span> : (
                    <div className="inline-flex rounded-md border border-line bg-alt p-0.5">
                      {ACCESS_LEVELS.map((l) => (
                        <button key={l} type="button" onClick={() => set(p, l)}
                          className={`rounded px-2.5 py-1 text-[12px] font-medium transition-colors duration-150 ${grants[p.slug] === l ? (l === 'none' ? 'bg-surface text-ink-900 shadow-sm' : l === 'viewer' ? 'bg-info-soft text-info shadow-sm' : 'bg-ok-soft text-ok shadow-sm') : 'text-ink-600 hover:text-ink-900'}`}>
                          {ACCESS_LABEL[l]}
                        </button>
                      ))}
                    </div>
                  )}
                </td>
              </tr>
              ),
            ]))}
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11.5px] text-ink-400">{ADMIN_TEXT.NO_ADMIN_PAGE} Setting a section copies its level to its pages.</p>
      {!locked && (
        <div className="mt-3 flex items-center justify-end gap-2">
          {error && <span className="mr-auto flex items-center gap-1 text-[12px] text-crit"><AlertTriangle className="size-3.5" />{error}</span>}
          <Button variant="primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save page access'}</Button>
        </div>
      )}
    </div>
  )
}
