import { Fragment, useMemo, useState, type ReactNode } from 'react'
import { Activity, AlertTriangle, Check, ChevronDown, ChevronRight, Globe, RefreshCw, Server, ShieldCheck, Users, Workflow, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button } from '../../components/ui'
import { ErrorNote } from '../../components/ErrorNote'
import {
  getMonitorAccess, getMonitorErrors, getMonitorOverview, getMonitorPeak, getRequestLines,
  type AlertRow, type ErrorGroup, type ErrorKind, type HealthPoint, type MonitorPart,
} from '../../api/admin'
import { MONITOR_TEXT as T, MONITOR_WINDOWS, type MonitorWindow } from '../../constants/admin'
import { istDateTime } from '../../lib/time'

/*
 * Admin > Monitor (2026-11-05; rebuilt 2026-11-26, user: "only POST_FG dev / prod, why do I need other dbs and cpus;
 * show it in a proper structure"). Developers only. From the server's own CloudWatch (the EC2 role):
 *   1. header: which POST_FG (DEV / PROD + its database), window, refresh
 *   2. tiles: errors people saw, failed in the background, browser errors, requests, slow requests
 *   3. Errors: three lists (people saw / background jobs / browser), one row per problem with its count; a row opens
 *      the raw error, why, how to fix and the full log of that request
 *   4. App health: POST_FG's own requests, response time, memory, database connections (click = what was running)
 *   5. folded: every warning, and the AWS access of the server role (open by itself when a read is missing)
 */

const COLORS = { a: '#4f46e5', b: '#d97706', c: '#16a34a', d: '#dc2626' }
const hhmm = (iso: string) => istDateTime(iso).slice(11)
const sum = (xs: (number | null)[]) => xs.reduce<number>((s, v) => s + (v ?? 0), 0)
const KINDS: ErrorKind[] = ['server', 'background', 'browser']
const KIND_ICON = { server: Users, background: Workflow, browser: Globe } as const

function PartError({ part }: { part: MonitorPart<unknown> }) {
  if (part.ok) return null
  return <p className="flex items-start gap-1.5 text-[12px] text-crit"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{T.PART_FAILED}: {part.error}</p>
}

function Card({ title, sub, icon, children, right }: { title: string; sub?: string; icon?: ReactNode; children: ReactNode; right?: ReactNode }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line bg-surface">
      <header className="flex flex-wrap items-start gap-2 border-b border-line px-4 py-3">
        <div className="min-w-0 flex-1">
          <h3 className="flex items-center gap-2 text-[14px] font-semibold text-ink-900">{icon}{title}</h3>
          {sub && <p className="mt-0.5 text-[12px] text-ink-500">{sub}</p>}
        </div>
        {right}
      </header>
      <div className="p-4">{children}</div>
    </section>
  )
}

type LineDef = { key: string; label: string; color: string }
function Chart({ title, rows, lines, onPick }: { title: string; rows: Record<string, unknown>[]; lines: LineDef[]; onPick?: (t: string) => void }) {
  return (
    <div className="rounded-[var(--radius-card)] border border-line p-3">
      <h4 className="mb-1 text-[12px] font-semibold text-ink-700">{title}</h4>
      {rows.length === 0 ? <p className="py-10 text-center text-[12px] text-ink-400">{T.NO_DATA}</p> : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
              onClick={(s) => { const t = s?.activeLabel; if (onPick && typeof t === 'string') onPick(t) }}
              style={{ cursor: onPick ? 'pointer' : undefined }}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-line)" vertical={false} />
              <XAxis dataKey="t" tickFormatter={hhmm} fontSize={10} minTickGap={28} />
              <YAxis fontSize={10} />
              <Tooltip labelFormatter={(t) => (typeof t === 'string' ? istDateTime(t) : '')} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid var(--color-line)' }} />
              {lines.map((l) => <Line key={l.key} dataKey={l.key} name={l.label} stroke={l.color} dot={false} strokeWidth={1.6} isAnimationActive={false} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  )
}

function Tile({ label, value, tone = 'neutral', icon }: { label: string; value: string; tone?: 'ok' | 'warn' | 'crit' | 'neutral'; icon: ReactNode }) {
  const color = tone === 'crit' ? 'text-crit' : tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-ink-900'
  const ring = tone === 'crit' ? 'border-crit/30 bg-crit-soft' : tone === 'warn' ? 'border-warn/30 bg-warn-soft' : 'border-line bg-surface'
  return (
    <div className={`min-w-0 rounded-[var(--radius-card)] border px-3 py-2.5 ${ring}`}>
      <div className="flex items-center gap-1.5 truncate text-[11.5px] text-ink-500">{icon}{label}</div>
      <div className={`mt-0.5 font-mono text-[20px] font-semibold leading-7 ${color}`}>{value}</div>
    </div>
  )
}

function RequestLog({ id }: { id: string }) {
  const q = useQuery({ queryKey: ['admin', 'monitor', 'request', id], queryFn: ({ signal }) => getRequestLines(id, signal), staleTime: 60_000 })
  if (q.isError) return <ErrorNote error={q.error} onRetry={() => void q.refetch()} />
  if (!q.data) return <p className="text-[12px] text-ink-400">{T.LOADING}</p>
  if (!q.data.lines.length) return <p className="text-[12px] text-ink-400">{T.DETAIL.LOG_EMPTY}</p>
  return (
    <ol className="max-h-80 space-y-1 overflow-auto rounded-md border border-line bg-alt p-2 font-mono text-[11.5px]">
      {q.data.lines.map((l, i) => (
        <li key={`${l.t}-${i}`} className="break-words">
          <span className="text-ink-400">{hhmm(l.t)}</span>{' '}
          <span className={l.level === 'error' ? 'text-crit' : l.level === 'warn' ? 'text-warn' : 'text-ink-500'}>{l.code}</span>{' '}
          <span className="text-ink-800">{l.msg}</span>
          {l.reason && <div className="pl-14 text-ink-500">{l.reason}</div>}
          {Object.keys(l.fields).length > 0 && <div className="pl-14 text-ink-400">{JSON.stringify(l.fields)}</div>}
        </li>
      ))}
    </ol>
  )
}

function ErrorDetail({ g }: { g: ErrorGroup }) {
  const [showLog, setShowLog] = useState(false)
  const id = g.requestId || g.jobId
  const row = (label: string, value: ReactNode) => (
    <div className="grid grid-cols-[110px_1fr] gap-2"><dt className="text-ink-500">{label}</dt><dd className="min-w-0 break-words text-ink-800">{value}</dd></div>
  )
  return (
    <div className="space-y-3 bg-alt/60 px-4 py-3 text-[12px]">
      <dl className="space-y-1.5">
        {g.error && row(T.DETAIL.ERROR, <span className="font-mono text-[11.5px]">{g.error}</span>)}
        {g.reason && row(T.DETAIL.REASON, g.reason)}
        {g.fix && row(T.DETAIL.FIX, <span className="font-medium text-ok">{g.fix}</span>)}
        {g.status !== null && row(T.DETAIL.STATUS, <span className="font-mono">{g.status}</span>)}
        {row(T.DETAIL.FIRST, istDateTime(g.first))}
        {g.requestId && row(T.DETAIL.REQUEST, <span className="font-mono">{g.requestId}</span>)}
        {g.jobId && row(T.DETAIL.JOB, <span className="font-mono">{g.jobId}</span>)}
      </dl>
      {id && (showLog ? <RequestLog id={id} /> : (
        <button type="button" onClick={() => setShowLog(true)} className="text-[12px] font-semibold text-primary hover:underline">{T.DETAIL.SHOW_LOG}</button>
      ))}
    </div>
  )
}

function ErrorTable({ part }: { part: MonitorPart<ErrorGroup[]> }) {
  const [open, setOpen] = useState<string | null>(null)
  if (!part.ok) return <PartError part={part} />
  const rows = part.data ?? []
  if (!rows.length) return <p className="py-6 text-center text-[12.5px] text-ink-400">{T.NO_ERRORS}</p>
  return (
    <div className="overflow-auto rounded-[var(--radius-card)] border border-line">
      <table className="w-full text-[12.5px]">
        <thead className="bg-alt text-left text-[11.5px] text-ink-500">
          <tr>{[T.COLS.WHAT, T.COLS.WHERE, T.COLS.TIMES, T.COLS.PEOPLE, T.COLS.LAST, T.COLS.WHO].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((g) => {
            const key = `${g.what}|${g.where}`
            const isOpen = open === key
            const serious = g.level === 'error' || (g.status ?? 0) >= 500
            return (
              <Fragment key={key}>
                <tr onClick={() => setOpen(isOpen ? null : key)} className={`cursor-pointer border-t border-line align-top hover:bg-alt/60 ${isOpen ? 'bg-alt/60' : ''}`}>
                  <td className="px-3 py-2">
                    <div className="flex items-start gap-1.5">
                      {isOpen ? <ChevronDown className="mt-0.5 size-3.5 shrink-0 text-ink-400" /> : <ChevronRight className="mt-0.5 size-3.5 shrink-0 text-ink-400" />}
                      <div className="min-w-0">
                        <Badge tone={serious ? 'crit' : 'warn'}>{g.what || '—'}</Badge>
                        {g.error && <div className="mt-0.5 line-clamp-2 break-words text-ink-600">{g.error}</div>}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-2 font-mono text-[11.5px] text-ink-700">{g.where || '—'}</td>
                  <td className="px-3 py-2 font-mono font-semibold">{g.count}</td>
                  <td className="px-3 py-2 font-mono">{g.people || '—'}</td>
                  <td className="whitespace-nowrap px-3 py-2 text-ink-600">{istDateTime(g.last)}</td>
                  <td className="px-3 py-2 text-ink-600">{g.lastUser ? <span title={g.lastUser.email}>{g.lastUser.name}</span> : '—'}</td>
                </tr>
                {isOpen && <tr><td colSpan={6} className="p-0"><ErrorDetail g={g} /></td></tr>}
              </Fragment>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function AlertList({ rows }: { rows: AlertRow[] }) {
  if (!rows.length) return <p className="text-[12px] text-ink-400">{T.ALERT_NONE}</p>
  return (
    <div className="max-h-96 overflow-auto rounded-[var(--radius-card)] border border-line">
      <table className="w-full text-[12px]">
        <tbody>
          {rows.map((a, i) => (
            <tr key={`${a.t}-${i}`} className="border-b border-line align-top last:border-0">
              <td className="whitespace-nowrap px-2 py-1.5 font-mono text-ink-500">{istDateTime(a.t)}</td>
              <td className="px-2 py-1.5"><Badge tone={a.level === 'error' ? 'crit' : 'warn'}>{a.code}</Badge></td>
              <td className="px-2 py-1.5 text-ink-800">
                <div className="break-words">{a.msg}</div>
                {a.reason && <div className="text-ink-500">{a.reason}</div>}
                {(a.requestId || a.jobId) && <div className="font-mono text-[11px] text-ink-400">{a.requestId || a.jobId}</div>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Peak({ at, onClose }: { at: string; onClose: () => void }) {
  const q = useQuery({ queryKey: ['admin', 'monitor', 'peak', at], queryFn: ({ signal }) => getMonitorPeak(at, signal), staleTime: 60_000 })
  const d = q.data
  return (
    <section className="space-y-3 rounded-[var(--radius-card)] border border-primary/40 bg-primary-soft/40 p-4">
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <h3 className="font-semibold text-ink-900">{T.PEAK(istDateTime(at))}</h3>
          <p className="text-[12px] text-ink-500">{T.PEAK_SUB}</p>
        </div>
        <Button variant="ghost" onClick={onClose} aria-label={T.CLOSE}><X className="size-4" /></Button>
      </div>
      <ErrorNote error={q.error} onRetry={() => void q.refetch()} />
      {!d ? (!q.isError && <p className="text-[12px] text-ink-400">{T.LOADING}</p>) : (
        <div className="grid gap-3 lg:grid-cols-2">
          <div className="space-y-1.5">
            <h4 className="text-[12px] font-semibold text-ink-700">{T.PEAK_APIS}</h4>
            <PartError part={d.apis} />
            {d.apis.data && (d.apis.data.length === 0 ? <p className="text-[12px] text-ink-400">{T.PEAK_NONE}</p> : (
              <div className="overflow-auto rounded-[var(--radius-card)] border border-line bg-surface">
                <table className="w-full text-[12px]">
                  <thead><tr className="text-left text-ink-500">{['API', 'Calls', 'Avg ms', 'Max ms', 'DB queries', 'KB'].map((h) => <th key={h} className="px-2 py-1 font-medium">{h}</th>)}</tr></thead>
                  <tbody>{d.apis.data.map((a) => (
                    <tr key={`${a.method} ${a.path}`} className="border-t border-line">
                      <td className="px-2 py-1 font-mono">{a.method} {a.path}</td>
                      <td className="px-2 py-1 font-mono">{a.calls}</td><td className="px-2 py-1 font-mono">{a.avgMs}</td>
                      <td className={`px-2 py-1 font-mono ${a.maxMs >= 2000 ? 'text-crit' : ''}`}>{a.maxMs}</td>
                      <td className="px-2 py-1 font-mono">{a.dbQueries}</td><td className="px-2 py-1 font-mono">{a.kb}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            ))}
          </div>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <h4 className="text-[12px] font-semibold text-ink-700">{T.PEAK_RUNNING}</h4>
              <PartError part={d.health} />
              {d.health.data && (d.health.data.running.length
                ? <ul className="space-y-0.5 font-mono text-[11.5px] text-ink-700">{d.health.data.running.map((r) => <li key={r} className="break-all">{r}</li>)}</ul>
                : <p className="text-[12px] text-ink-400">{T.PEAK_NONE}</p>)}
            </div>
            <div className="space-y-1.5">
              <h4 className="text-[12px] font-semibold text-ink-700">{T.PEAK_JOBS}</h4>
              <PartError part={d.jobs} />
              {d.jobs.data && (d.jobs.data.length ? (
                <ul className="space-y-1 text-[12px]">{d.jobs.data.map((j) => (
                  <li key={j.jobId}><span className="font-mono text-ink-800">{j.source} {j.jobId}</span> <span className="text-ink-500">· {j.lines} lines · {hhmm(j.from)}–{hhmm(j.to)} · {j.firstMsg}</span></li>
                ))}</ul>
              ) : <p className="text-[12px] text-ink-400">{T.PEAK_NONE}</p>)}
            </div>
          </div>
          <div className="space-y-1.5 lg:col-span-2">
            <h4 className="text-[12px] font-semibold text-ink-700">{T.PEAK_ALERTS}</h4>
            <PartError part={d.alerts} />
            {d.alerts.data && <AlertList rows={d.alerts.data} />}
          </div>
        </div>
      )}
    </section>
  )
}

export function MonitorTab() {
  const [win, setWin] = useState<MonitorWindow>('24h')
  const [kind, setKind] = useState<ErrorKind>('server')
  const [peakAt, setPeakAt] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const access = useQuery({ queryKey: ['admin', 'monitor', 'access'], queryFn: ({ signal }) => getMonitorAccess(signal), staleTime: 5 * 60_000 })
  const q = useQuery({ queryKey: ['admin', 'monitor', win], queryFn: ({ signal }) => getMonitorOverview(win, signal), refetchInterval: 5 * 60_000, staleTime: 60_000 })
  const errs = useQuery({ queryKey: ['admin', 'monitor', 'errors', win], queryFn: ({ signal }) => getMonitorErrors(win, signal), refetchInterval: 5 * 60_000, staleTime: 60_000 })
  const d = q.data
  const e = errs.data
  const health: HealthPoint[] = useMemo(() => d?.health.data ?? [], [d])

  if (access.isError) return <ErrorNote error={access.error} onRetry={() => void access.refetch()} />
  if (access.data && !access.data.onServer) {
    return <div className="space-y-2 text-[13px]"><p className="text-[12.5px] text-ink-600">{T.SUB}</p><p className="rounded-[var(--radius-card)] border border-line bg-alt p-4 text-ink-700">{T.NOT_ON_SERVER}</p></div>
  }

  const env = access.data?.env ?? d?.env ?? e?.env
  const envLabel = env ? T.ENV(env.database) : ''
  const isProd = envLabel === 'PROD'
  const missing = access.data?.checks.filter((c) => !c.ok) ?? []
  const requests = sum(health.map((p) => p.requests))
  const slow = sum(health.map((p) => p.slow))
  const totals = e?.totals ?? { server: 0, background: 0, browser: 0 }
  const alerts = (d?.alerts.data ?? []).filter((a) => !code || a.code === code)
  const refresh = () => { void q.refetch(); void errs.refetch() }
  const busy = q.isFetching || errs.isFetching

  return (
    <div className="space-y-4 text-[13px]">
      {/* 1. which POST_FG + window */}
      <div className="flex flex-wrap items-center gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
        <div className="flex min-w-0 items-center gap-2">
          <Server className="size-4 text-primary" />
          <span className="font-semibold text-ink-900">{T.APP}</span>
          {env && <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tracking-wide ${isProd ? 'bg-crit text-white' : 'bg-primary text-white'}`}>{envLabel}</span>}
          {env && <span className="truncate font-mono text-[11.5px] text-ink-500">{env.database}</span>}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <div className="inline-flex overflow-hidden rounded-[var(--radius-control)] border border-line">
            {MONITOR_WINDOWS.map((w) => (
              <button key={w} type="button" onClick={() => { setWin(w); setPeakAt(null) }}
                className={`px-3 py-1.5 text-[12px] ${w === win ? 'bg-primary text-white' : 'bg-surface text-ink-700 hover:bg-alt'}`}>{T.WINDOW[w]}</button>
            ))}
          </div>
          <Button onClick={refresh} disabled={busy}><RefreshCw className={`size-3.5 ${busy ? 'animate-spin' : ''}`} />{T.REFRESH}</Button>
        </div>
        <p className="basis-full text-[12px] text-ink-500">{T.SUB}{d && <span className="text-ink-400"> · {T.UPDATED(istDateTime(d.to))}</span>}</p>
      </div>

      {/* 2. tiles */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
        <Tile icon={<Users className="size-3.5" />} label={T.TILES.SERVER} value={e ? String(totals.server) : '–'} tone={totals.server ? 'crit' : 'ok'} />
        <Tile icon={<Workflow className="size-3.5" />} label={T.TILES.BACKGROUND} value={e ? String(totals.background) : '–'} tone={totals.background ? 'crit' : 'ok'} />
        <Tile icon={<Globe className="size-3.5" />} label={T.TILES.BROWSER} value={e ? String(totals.browser) : '–'} tone={totals.browser ? 'warn' : 'ok'} />
        <Tile icon={<Activity className="size-3.5" />} label={T.TILES.REQUESTS} value={d ? requests.toLocaleString('en-IN') : '–'} />
        <Tile icon={<Activity className="size-3.5" />} label={T.TILES.SLOW} value={d ? String(slow) : '–'} tone={slow ? 'warn' : 'ok'} />
      </div>

      {/* 3. errors */}
      <Card title={T.ERRORS} sub={T.ERRORS_SUB} icon={<AlertTriangle className="size-4 text-crit" />}>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {KINDS.map((k) => {
            const Icon = KIND_ICON[k]
            const n = totals[k]
            return (
              <button key={k} type="button" onClick={() => setKind(k)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-[12px] font-medium ${k === kind ? 'border-primary bg-primary-soft text-primary' : 'border-line text-ink-700 hover:bg-alt'}`}>
                <Icon className="size-3.5" />{T.KINDS[k]}
                <span className={`rounded-full px-1.5 font-mono text-[11px] ${n ? 'bg-crit text-white' : 'bg-alt text-ink-500'}`}>{e ? n : '·'}</span>
              </button>
            )
          })}
        </div>
        <p className="mb-2 text-[12px] text-ink-500">{T.KIND_HINT[kind]}</p>
        <ErrorNote error={errs.error} onRetry={() => void errs.refetch()} />
        {e ? <ErrorTable key={`${kind}-${win}`} part={e[kind]} /> : (!errs.isError && <p className="text-[12px] text-ink-400">{T.LOADING}</p>)}
      </Card>

      {/* 4. app health */}
      <Card title={T.HEALTH} sub={T.HEALTH_SUB} icon={<Activity className="size-4 text-primary" />}>
        <ErrorNote error={q.error} onRetry={() => void q.refetch()} />
        {d && (
          <div className="space-y-3">
            <PartError part={d.health} />
            <div className="grid gap-3 md:grid-cols-2">
              <Chart title={T.CHARTS.REQUESTS} rows={health} onPick={setPeakAt} lines={[{ key: 'requests', label: 'Requests', color: COLORS.a }, { key: 'errors5xx', label: 'Errors', color: COLORS.d }, { key: 'slow', label: 'Slow', color: COLORS.b }]} />
              <Chart title={T.CHARTS.LATENCY} rows={health} onPick={setPeakAt} lines={[{ key: 'avgMs', label: 'Avg ms', color: COLORS.a }, { key: 'maxMs', label: 'Max ms', color: COLORS.d }]} />
              <Chart title={T.CHARTS.APP_MEMORY} rows={health} onPick={setPeakAt} lines={[{ key: 'rssMb', label: 'Memory MB', color: COLORS.a }, { key: 'heapUsedMb', label: 'Heap MB', color: COLORS.c }]} />
              <Chart title={T.CHARTS.POOL} rows={health} onPick={setPeakAt} lines={[{ key: 'dbPoolMaxWaiting', label: 'Waiting (max)', color: COLORS.d }, { key: 'dbPoolFree', label: 'Free', color: COLORS.c }]} />
            </div>
            {peakAt && <Peak at={peakAt} onClose={() => setPeakAt(null)} />}
          </div>
        )}
      </Card>

      {/* 5. folded: every warning + AWS access */}
      {d && (
        <details className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3">
          <summary className="cursor-pointer font-semibold text-ink-900">{T.ALERTS}{d.alerts.data && <span className="ml-2 text-[11.5px] font-normal text-ink-400">{T.ALERT_NEWEST(d.alerts.data.length)}</span>}</summary>
          <div className="mt-3 space-y-2">
            <PartError part={d.alertCounts} />
            {d.alertCounts.data && d.alertCounts.data.length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                <button type="button" onClick={() => setCode(null)} className={`rounded-full border px-2.5 py-0.5 text-[11.5px] ${code ? 'border-line text-ink-600' : 'border-primary bg-primary-soft text-primary'}`}>{T.ALERT_ALL}</button>
                {d.alertCounts.data.map((c) => (
                  <button key={`${c.code}-${c.level}`} type="button" onClick={() => setCode(code === c.code ? null : c.code)} title={`last ${istDateTime(c.last)}`}
                    className={`rounded-full border px-2.5 py-0.5 font-mono text-[11.5px] ${code === c.code ? 'border-primary bg-primary-soft text-primary' : c.level === 'error' ? 'border-crit/40 text-crit' : 'border-warn/40 text-warn'}`}>
                    {c.code} · {c.count}
                  </button>
                ))}
              </div>
            )}
            <PartError part={d.alerts} />
            {d.alerts.data && <AlertList rows={alerts} />}
          </div>
        </details>
      )}

      {access.data && (
        <details className="rounded-[var(--radius-card)] border border-line bg-surface px-4 py-3" open={missing.length > 0}>
          <summary className="flex cursor-pointer items-center gap-2 font-semibold text-ink-900">
            <ShieldCheck className="size-4 text-primary" />{T.ACCESS}
            {missing.length ? <Badge tone="warn">{T.ACCESS_MISSING(missing.length)}</Badge> : <Badge tone="ok">{T.ACCESS_OK}</Badge>}
          </summary>
          <ul className="mt-2 space-y-1 text-[12px]">
            {access.data.checks.map((c) => (
              <li key={c.action} className="flex items-start gap-1.5">
                {c.ok ? <Check className="mt-0.5 size-3.5 text-ok" /> : <X className="mt-0.5 size-3.5 text-crit" />}
                <span className="font-mono">{c.action}</span>{c.error && <span className="break-all text-ink-500">{c.error}</span>}
              </li>
            ))}
          </ul>
          <p className="mt-2 font-mono text-[11px] text-ink-400">{access.data.instanceId} · {access.data.logGroup}</p>
        </details>
      )}
    </div>
  )
}
