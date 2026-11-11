import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Box, CheckCheck, LogOut, MapPin } from 'lucide-react'
import { api, ApiError, apiUrl } from '../../api/client'
import { listBulkOrders, type BulkRights } from '../../api/bulkOrders'
import { ACCESS, AUTH_ENDPOINTS, ERROR_CODE, LOGIN_ERROR_FALLBACK, LOGIN_ERROR_MESSAGES, type AccessLevel } from '../../constants/auth'
import { BULK_ENDPOINT, BULK_PAGE, BULK_STATUS, BULK_TEXT, BULK_TYPES } from '../../constants/bulkOrders'
import BulkOrders from './BulkOrders'
import BulkLocations from './BulkLocations'

/*
 * The Bulk Orders portal (2026-11-11): its own app (src/bulk-main.tsx). Same Google login as POST_FG (the sign-in
 * returns here: /auth/google?app=bulk); what the person may do comes from GET /auth/me's /bulk-orders pages.
 */

type Me = { user: { id: string; name: string; email: string; roleLabels?: Record<string, string>; roles: string[] }; access: Record<string, AccessLevel> }

const rightsOf = (access: Record<string, AccessLevel>): BulkRights => ({
  view: BULK_TYPES.filter((t) => [ACCESS.VIEWER, ACCESS.EDITOR].includes(access[BULK_PAGE.TYPE[t]] as 'viewer' | 'editor')),
  create: BULK_TYPES.filter((t) => access[BULK_PAGE.TYPE[t]] === ACCESS.EDITOR),
  approve: access[BULK_PAGE.APPROVE] === ACCESS.EDITOR,
})

type Page = 'orders' | 'approvals' | 'locations'

function SignIn({ error }: { error?: string }) {
  return (
    <div className="flex min-h-full items-center justify-center bg-canvas p-6">
      <div className="w-full max-w-sm rounded-[var(--radius-card)] border border-line bg-surface p-7 text-center shadow-sm">
        <div className="mx-auto mb-4 grid size-11 place-items-center rounded-xl bg-primary text-sm font-bold text-white">PF</div>
        <h1 className="font-serif text-[24px] font-medium text-ink-900">{BULK_TEXT.SIGN_IN_TITLE}</h1>
        <p className="mt-1 text-[13px] text-ink-600">{BULK_TEXT.SIGN_IN_SUB}</p>
        {error && <p className="mt-4 rounded-md bg-crit-soft px-3 py-2 text-[12px] text-crit">{LOGIN_ERROR_MESSAGES[error] ?? LOGIN_ERROR_FALLBACK}</p>}
        <a href={apiUrl(BULK_ENDPOINT.GOOGLE)} className="mt-6 inline-flex w-full items-center justify-center rounded-md bg-primary px-4 py-2.5 text-[13px] font-semibold text-white hover:opacity-90">
          {BULK_TEXT.SIGN_IN}
        </a>
      </div>
    </div>
  )
}

export default function BulkApp() {
  const qc = useQueryClient()
  const urlError = new URLSearchParams(window.location.search).get('error') ?? undefined
  const me = useQuery({ queryKey: ['bulk', 'me'], queryFn: () => api<Me>(AUTH_ENDPOINTS.ME), retry: false })
  const [page, setPage] = useState<Page>('orders')
  const approver = me.data ? rightsOf(me.data.access).approve : false
  // the Approvals badge: how many wait (one count query, refreshed with the lists)
  const waiting = useQuery({
    queryKey: ['bulk', 'orders', 'count', 'approvals'],
    queryFn: () => listBulkOrders({ status: BULK_STATUS.PENDING, pageSize: 1 }).then((r) => r.meta.total),
    enabled: approver,
  })

  // the ?error= of a refused sign-in is shown once, then dropped from the address
  useEffect(() => {
    if (urlError) window.history.replaceState(null, '', window.location.pathname)
  }, [urlError])

  if (me.isPending) return <div className="grid min-h-full place-items-center text-[13px] text-ink-600">{BULK_TEXT.LOADING}</div>
  if (me.isError) {
    const code = me.error instanceof ApiError ? me.error.code : ERROR_CODE.NETWORK
    return <SignIn error={urlError ?? (code === ERROR_CODE.UNAUTHENTICATED ? undefined : code)} />
  }

  const { user, access } = me.data
  const rights = rightsOf(access)
  const signOut = async () => {
    try {
      await api(AUTH_ENDPOINTS.LOGOUT, { method: 'POST' })
    } finally {
      qc.clear()
      void me.refetch()
    }
  }
  const roleLabel = Object.values(user.roleLabels ?? {}).join(', ') || user.roles.join(', ')

  if (!rights.view.length) {
    return (
      <div className="grid min-h-full place-items-center p-6">
        <div className="max-w-md text-center">
          <h1 className="font-serif text-[22px] text-ink-900">{BULK_TEXT.NO_ACCESS_TITLE}</h1>
          <p className="mt-2 text-[13px] text-ink-600">{BULK_TEXT.NO_ACCESS}</p>
          <p className="mt-2 text-[12px] text-ink-400">{user.email}</p>
          <button onClick={() => void signOut()} className="mt-5 text-[13px] font-semibold text-primary">{BULK_TEXT.SIGN_OUT}</button>
        </div>
      </div>
    )
  }

  const nav: { key: Page; label: string; icon: React.ReactNode; count?: number }[] = [
    { key: 'orders', label: BULK_TEXT.NAV_ORDERS, icon: <Box className="size-4" /> },
    ...(rights.approve ? [{ key: 'approvals' as const, label: BULK_TEXT.NAV_APPROVALS, icon: <CheckCheck className="size-4" />, count: waiting.data }] : []),
    { key: 'locations', label: BULK_TEXT.NAV_LOCATIONS, icon: <MapPin className="size-4" /> },
  ]
  const titles: Record<Page, string> = { orders: BULK_TEXT.ORDERS_TITLE, approvals: BULK_TEXT.APPROVALS_TITLE, locations: BULK_TEXT.LOCATIONS_TITLE }
  const initials = user.name.split(/\s+/).map((w) => w[0]).slice(0, 2).join('').toUpperCase()

  return (
    <div className="flex h-full min-h-0">
      <aside className="hidden w-56 shrink-0 flex-col border-r border-line bg-surface md:flex">
        <div className="flex items-center gap-2.5 px-4 py-4">
          <div className="grid size-9 place-items-center rounded-lg bg-primary text-xs font-bold text-white">PF</div>
          <div className="leading-tight">
            <div className="text-[14px] font-semibold text-ink-900">{BULK_TEXT.BRAND}</div>
            <div className="text-[11px] text-ink-600">{BULK_TEXT.APP}</div>
          </div>
        </div>
        <nav className="flex flex-col gap-0.5 px-2">
          {nav.map((n) => (
            <button key={n.key} onClick={() => setPage(n.key)}
              className={`flex items-center gap-2 rounded-md px-3 py-2 text-left text-[13px] ${page === n.key ? 'bg-primary-soft font-semibold text-primary' : 'text-ink-600 hover:bg-alt hover:text-ink-900'}`}>
              {n.icon}{n.label}
              {!!n.count && <span className="ml-auto rounded-full bg-warn px-1.5 text-[11px] font-semibold text-white">{n.count}</span>}
            </button>
          ))}
        </nav>
      </aside>

      <main className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center justify-between gap-3 border-b border-line bg-surface px-4 py-2.5 md:px-6">
          <div className="flex gap-1 md:hidden">
            {nav.map((n) => (
              <button key={n.key} onClick={() => setPage(n.key)} className={`rounded-md px-2.5 py-1.5 text-[12px] ${page === n.key ? 'bg-primary-soft font-semibold text-primary' : 'text-ink-600'}`}>{n.label}</button>
            ))}
          </div>
          <div className="hidden text-[12px] text-ink-600 md:block">{BULK_TEXT.APP} <span className="text-ink-400">/</span> <strong className="text-ink-900">{titles[page]}</strong></div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="grid size-8 place-items-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">{initials}</span>
              <span className="hidden leading-tight sm:block">
                <span className="block text-[12px] font-semibold text-ink-900">{user.name}</span>
                <span className="block text-[11px] text-ink-600">{roleLabel}</span>
              </span>
            </div>
            <button onClick={() => void signOut()} title={BULK_TEXT.SIGN_OUT} className="rounded-md p-1.5 text-ink-400 hover:bg-alt hover:text-ink-900"><LogOut className="size-4" /></button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-5 md:px-6">
          {page === 'locations' ? <BulkLocations rights={rights} /> : <BulkOrders key={page} rights={rights} mode={page} />}
        </div>
      </main>
    </div>
  )
}
