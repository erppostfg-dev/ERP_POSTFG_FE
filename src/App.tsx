import { useEffect, useRef, useState } from 'react'
import type { ComponentType, ReactNode } from 'react'
import { Navigate, Route, Routes, useLocation, useNavigate } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { BadgeCheck, ChevronDown, ChevronsLeft, ChevronsRight, Database, LineChart, LogOut, Search, Truck } from 'lucide-react'
import Analytics from './pages/Analytics'
import Masters from './pages/Masters'
import Approvals from './pages/Approvals'
import POOverview from './pages/ops/POOverview'
import POProcessing from './pages/ops/POProcessing'
import POWorking from './pages/ops/POWorking'
import ShortSkus from './pages/ops/ShortSkus'
import InventoryCalc from './pages/dp/InventoryCalc'
import DrrAging from './pages/dp/DrrAging'
import DPAnalytics from './pages/dp/DPAnalytics'
import IntransitStock from './pages/dp/IntransitStock'
import { APPROVALS, CHANNEL_PRIORITY_DEFAULT } from './lib/ops'
import { useAuth, type User } from './auth/AuthContext'
import { FullPageMessage } from './auth/RequireAuth'
import { ACCESS, ROLE_LABEL, TEAM_LABEL, UI_TEXT } from './constants/auth'
import { DummyDataStrip } from './components/DummyData'
import { HOME_PATH, MASTER_TAB_BY_PATH, NAV_GROUPS, PATHS, RAIL_PAGES, isDummyPage, type NavGroup } from './constants/pages'
import { SIDEBAR_COLLAPSED_KEY } from './constants/ui'

/** The sidebar choice survives a reload (browser storage; private windows may refuse it, then it just isn't kept). */
const readCollapsed = (): boolean => {
  try { return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1' } catch { return false }
}
const saveCollapsed = (v: boolean) => {
  try { localStorage.setItem(SIDEBAR_COLLAPSED_KEY, v ? '1' : '0') } catch { /* not kept */ }
}

const GROUP_ICONS: Record<string, ComponentType<{ className?: string }>> = {
  [PATHS.MASTERS]: Database,
  [PATHS.OPERATIONS]: Truck,
  [PATHS.PLANNING]: LineChart,
  [PATHS.APPROVALS]: BadgeCheck,
}

const BRANDS = ['All', 'mCaffeine', 'Hyphen'] as const
const pending = APPROVALS.filter((a) => a.status === 'Pending').length

/** The group a path belongs to, and its item (groups with children). */
const findRoute = (pathname: string) => {
  for (const g of NAV_GROUPS) {
    if (pathname === g.key || pathname.startsWith(`${g.key}/`)) return { group: g, item: g.items.find((it) => it.path === pathname) }
  }
  return null
}

export default function App() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const auth = useAuth()
  const [open, setOpen] = useState<Record<string, boolean>>({ [PATHS.MASTERS]: false, [PATHS.OPERATIONS]: true, [PATHS.PLANNING]: true, [PATHS.APPROVALS]: false })
  // collapsed = the person's saved choice; a RAIL_PAGES page (PO Overview) opens with the rail unless the person
  // expanded it there (openHere, reset on every page switch); peek = the rail is hovered, so it shows wide over the
  // page. Width changes animate (duration-300).
  const [collapsed, setCollapsedState] = useState(readCollapsed)
  const [openHere, setOpenHere] = useState(false)
  const [peek, setPeek] = useState(false)
  const railPage = RAIL_PAGES.has(pathname)
  const railed = collapsed || (railPage && !openHere)
  const wide = !railed || peek
  const toggleSidebar = () => {
    setPeek(false)
    if (railed) { setCollapsedState(false); saveCollapsed(false); if (railPage) setOpenHere(true) }
    else if (railPage) setOpenHere(false)
    else { setCollapsedState(true); saveCollapsed(true) }
  }
  const queryClient = useQueryClient()
  const [prio, setPrio] = useState<Record<string, number>>(CHANNEL_PRIORITY_DEFAULT)
  const [brand, setBrand] = useState<(typeof BRANDS)[number]>('All')

  // Sidebar shows only what the user may see: access "none" hides a page, and a group with nothing visible hides too.
  const canSee = (path: string) => auth.accessFor(path) !== ACCESS.NONE
  const groups: NavGroup[] = NAV_GROUPS.map((g) => ({ ...g, items: g.items.filter((it) => canSee(it.path)) })).filter((g) =>
    g.items.length > 0 || (NAV_GROUPS.find((n) => n.key === g.key)!.items.length === 0 && canSee(g.key)),
  )
  const firstPath = (g: NavGroup) => g.items[0]?.path ?? g.key

  const current = findRoute(pathname)
  const viewOnly = current !== null && auth.accessFor(current.item?.path ?? current.group.key) === ACCESS.VIEWER
  const dummy = current !== null && isDummyPage(current.item?.path ?? current.group.key)

  const pages: [string, ReactNode][] = [
    ...Object.entries(MASTER_TAB_BY_PATH).map(([path, tab]): [string, ReactNode] => [path, <Masters tab={tab} />]),
    [PATHS.PO_OVERVIEW, <POOverview />],
    [PATHS.PO_REVIEW, <POProcessing />],
    [PATHS.PO_WORKING, <POWorking prio={prio} setPrio={setPrio} />],
    [PATHS.SKUS_SHORT, <ShortSkus priority={prio} />],
    [PATHS.OPS_ANALYTICS, <Analytics go={() => navigate(PATHS.INVENTORY)} />],
    [PATHS.INVENTORY, <InventoryCalc />],
    [PATHS.INTRANSIT_STOCK, <IntransitStock />],
    [PATHS.DRR_AGING, <DrrAging />],
    [PATHS.PLANNING_ANALYTICS, <DPAnalytics />],
    [PATHS.APPROVALS, <Approvals />],
  ]

  // Pages stay alive once opened (hidden when not shown), so switching back keeps their filters, tabs and scroll;
  // their cached data older than the cache's stale time is refreshed quietly when they are shown again.
  const [visited, setVisited] = useState<string[]>([])
  useEffect(() => {
    if (pages.some(([p]) => p === pathname)) setVisited((v) => (v.includes(pathname) ? v : [...v, pathname]))
    setOpenHere(false)
    void queryClient.refetchQueries({ type: 'active', stale: true })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])
  const isPage = pages.some(([p]) => p === pathname)

  return (
    <div className={`grid h-full grid-cols-1 transition-[grid-template-columns] duration-300 ease-in-out ${railed ? 'md:grid-cols-[68px_1fr]' : 'md:grid-cols-[248px_1fr]'}`}>
      {/* Left nav rail: a 68px rail when collapsed (or while a table wants the full view); hovering it opens it over
          the page (peek). The panel's width animates; its labels are clipped while it moves. */}
      <aside className="relative hidden min-h-0 md:block" onMouseEnter={() => railed && setPeek(true)} onMouseLeave={() => setPeek(false)}>
      <div className={`absolute inset-y-0 left-0 z-40 flex min-h-0 flex-col overflow-hidden whitespace-nowrap border-r border-line bg-surface transition-[width,box-shadow] duration-300 ease-in-out ${wide ? 'w-[248px]' : 'w-[68px]'} ${peek ? 'shadow-xl' : ''}`}>
        <div className={`flex gap-2.5 px-4 py-4 ${wide ? 'items-center' : 'flex-col items-center px-0'}`}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded-md bg-primary text-[13px] font-bold text-white">PF</div>
          {wide && (
            <div className="leading-tight">
              <div className="font-serif text-[15px] font-medium text-ink-900">Post FG</div>
              <div className="text-[10px] uppercase tracking-widest text-ink-400">ERP</div>
            </div>
          )}
          {/* One button, always visible: collapse when open; expand (keep open) on the rail and while peeking. */}
          <button onClick={toggleSidebar} className={`rounded-md p-1 text-ink-400 hover:bg-alt hover:text-ink-900 ${wide ? 'ml-auto' : ''}`} title={railed ? 'Expand (keep open)' : 'Collapse'}>
            {railed ? <ChevronsRight className="size-4" /> : <ChevronsLeft className="size-4" />}
          </button>
        </div>

        <nav className="mt-1 min-h-0 flex-1 overflow-y-auto px-2.5 pb-4">
          {groups.map((g) => {
            const activeGroup = current?.group.key === g.key
            const Icon = GROUP_ICONS[g.key]
            const leaf = g.items.length === 0
            return (
              <div key={g.key} className="mb-0.5">
                <button
                  onClick={() => {
                    if (leaf || !wide) navigate(firstPath(g))
                    else setOpen({ ...open, [g.key]: !open[g.key] })
                  }}
                  title={g.label}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-[13px] font-medium transition-colors ${
                    activeGroup && (leaf || !wide) ? 'bg-primary text-white' : activeGroup ? 'text-primary' : 'text-ink-900 hover:bg-alt'
                  }`}
                >
                  <Icon className="size-4 shrink-0" />
                  {wide && <span className="flex-1 text-left">{g.label}{leaf && isDummyPage(g.key) && <DummyDot />}</span>}
                  {wide && leaf && pending > 0 && <span className={`tnum rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-none ${activeGroup ? 'bg-white/20 text-white' : 'bg-crit-soft text-crit'}`}>{pending}</span>}
                  {wide && !leaf && <ChevronDown className={`size-3.5 text-ink-400 transition-transform ${open[g.key] ? '' : '-rotate-90'}`} />}
                </button>
                {wide && !leaf && open[g.key] && (
                  <div className="my-1 ml-[21px] border-l border-line pl-3">
                    {g.items.map((it) => {
                      const on = pathname === it.path
                      return (
                        <button
                          key={it.path}
                          onClick={() => navigate(it.path)}
                          className={`relative block w-full truncate rounded-md px-2.5 py-1.5 text-left text-[13px] transition-colors ${on ? 'bg-primary-soft font-medium text-primary' : 'text-ink-600 hover:bg-alt hover:text-ink-900'}`}
                        >
                          {on && <span className="absolute -left-[13px] top-1.5 bottom-1.5 w-0.5 rounded-full bg-primary" />}
                          {it.label}
                          {isDummyPage(it.path) && <DummyDot />}
                        </button>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </nav>

        <div className="border-t border-line px-3 py-3">
          <div className="flex items-center gap-1.5 px-1 text-[11px] text-ink-600">
            <span className="size-1.5 rounded-full bg-ok" /> {wide && 'Uniware connected'}
          </div>
        </div>
      </div>
      </aside>

      {/* Main */}
      <div className="flex min-h-0 min-w-0 flex-col">
        <header className="flex items-center gap-3 border-b border-line bg-surface px-5 py-3">
          <select value={pathname} onChange={(e) => navigate(e.target.value)} className="rounded-md border border-line px-2 py-1.5 text-xs md:hidden">
            {groups.map((g) => g.items.length ? (
              <optgroup key={g.key} label={g.label}>{g.items.map((it) => <option key={it.path} value={it.path}>{it.label}</option>)}</optgroup>
            ) : <option key={g.key} value={g.key}>{g.label}</option>)}
          </select>

          {current && (
            <div className="hidden items-center gap-1.5 text-[12px] text-ink-400 md:flex">
              <span>{current.group.label}</span>
              {current.item && <><span>/</span><span className="font-medium text-ink-900">{current.item.label}</span></>}
              {viewOnly && <span className="ml-2 rounded-full bg-warn-soft px-2 py-0.5 text-[10px] font-semibold text-warn">{UI_TEXT.VIEW_ONLY}</span>}
            </div>
          )}

          <label className="relative ml-4 hidden lg:block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-ink-400" />
            <input placeholder="Search PO number, SKU, channel…" className="w-72 rounded-md border border-line bg-canvas py-1.5 pl-8 pr-3 text-xs outline-none focus:border-primary" />
          </label>

          <div className="ml-auto flex items-center gap-3">
            {/* Who am I: the team when the person has one (e.g. "Warehouse"), else their role(s) (e.g. "Admin") */}
            {auth.status === 'signedIn' && (
              <span className="hidden whitespace-nowrap rounded-full bg-primary-soft px-2.5 py-1 text-[11px] font-semibold text-primary sm:inline" title={auth.user.email}>
                {auth.user.team ? TEAM_LABEL[auth.user.team] ?? auth.user.team : auth.user.roles.map((r) => ROLE_LABEL[r] ?? r).join(' · ')}
              </span>
            )}
            <div className="hidden items-center gap-1 rounded-md border border-line p-0.5 text-[11px] sm:flex">
              <span className="px-1.5 text-ink-400">Brand</span>
              {BRANDS.map((b) => (
                <button key={b} onClick={() => setBrand(b)} className={`rounded px-2 py-1 font-semibold transition-colors ${brand === b ? 'bg-primary text-white' : 'text-ink-600 hover:text-ink-900'}`}>{b}</button>
              ))}
            </div>
            {auth.status === 'signedIn' && <UserMenu user={auth.user} onLogout={auth.logout} />}
          </div>
        </header>

        <main className={`min-w-0 flex-1 overflow-y-auto p-5 lg:p-6 ${dummy ? 'dummy-data bg-canvas' : ''}`}>
          <div className="mx-auto max-w-[1440px]">
            {dummy && <DummyDataStrip />}
            {/* Every page opened so far stays mounted; only the current one is shown. */}
            {pages.filter(([path]) => visited.includes(path)).map(([path, element]) => (
              <div key={path} hidden={path !== pathname}>{canSee(path) ? element : <FullPageMessage text={UI_TEXT.NO_ACCESS} />}</div>
            ))}
            {/* Redirects and "not found" only: the pages themselves are rendered above. */}
            <Routes>
              <Route index element={<Navigate to={HOME_PATH} replace />} />
              {NAV_GROUPS.filter((g) => g.items.length > 0).map((g) => (
                <Route key={g.key} path={g.key} element={<Navigate to={g.items[0].path} replace />} />
              ))}
              {pages.map(([path]) => <Route key={path} path={path} element={null} />)}
              <Route path="*" element={isPage ? null : <FullPageMessage text={UI_TEXT.NOT_FOUND} />} />
            </Routes>
          </div>
        </main>
      </div>
    </div>
  )
}

function UserMenu({ user, onLogout }: { user: User; onLogout: () => Promise<void> }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const initials =
    user.name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toUpperCase()).join('') || user.email[0]!.toUpperCase()

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', close)
    return () => document.removeEventListener('mousedown', close)
  }, [open])

  return (
    <div ref={ref} className="relative">
      <button onClick={() => setOpen((o) => !o)} title={user.email} className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-[12px] font-semibold text-primary">
        {initials}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-64 rounded-[var(--radius-card)] border border-line bg-surface p-3 shadow-lg">
          <div className="text-[13px] font-medium text-ink-900">{user.name}</div>
          <div className="truncate text-[12px] text-ink-600">{user.email}</div>
          <div className="mt-2 flex flex-wrap gap-1">
            {user.roles.map((r) => (
              <span key={r} className="rounded-full bg-alt px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-ink-600">{r}</span>
            ))}
          </div>
          <button onClick={onLogout} className="mt-3 flex w-full items-center gap-2 rounded-md border border-line px-3 py-1.5 text-[12px] font-semibold text-ink-900 hover:bg-alt">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      )}
    </div>
  )
}

function DummyDot() {
  return <span title="Dummy data (dev)" className="ml-1.5 inline-block size-1.5 rounded-full bg-amber-400 align-middle" />
}
