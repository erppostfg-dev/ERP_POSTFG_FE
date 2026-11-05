import { useMemo, useState } from 'react'
import { Activity, AlertTriangle, Check, Database, RefreshCw, Server, ShieldCheck, X } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'
import { Badge, Button } from '../../components/ui'
import { ApiError } from '../../api/client'
import {
  getMonitorAccess, getMonitorOverview, getMonitorPeak,
  type AlertRow, type HealthPoint, type MetricSeries, type MonitorPart,
} from '../../api/admin'
import { MONITOR_TEXT as T, MONITOR_WINDOWS, type MonitorWindow } from '../../constants/admin'
import { istDateTime } from '../../lib/time'

/*
 * Admin > Monitor (2026-11-05, user: "errors and alerts, load on each API, database, which API was at the peak of server
 * disk / RAM / DB"; developers only). Reads the server's own CloudWatch (the EC2 role; on a laptop it says so): a strip
 * of "now" values, graphs over 1 h / 24 h / 7 d (click a point -> what was running then: APIs by load, jobs, alerts),
 * warnings + errors by code and the newest ones, and which CloudWatch reads the role is allowed.
 */

const COLORS = { a: '#4f46e5', b: '#d97706', c: '#16a34a', d: '#dc2626' }
const errText = (e: unknown) => (e instanceof ApiError ? e.message : String(e))
const hhmm = (iso: string) => istDateTime(iso).slice(11)
const last = <V,>(xs: V[] | null | undefined) => (xs && xs.length ? xs[xs.length - 1] : undefined)
const maxOf = (xs: (number | null)[]) => xs.reduce<number>((m, v) => (v != null && v > m ? v : m), 0)

/** Metric series (one or several, e.g. a disk per mount) -> rows by time with one column per id (the max per time). */
const byTime = (series: MetricSeries[], ids: string[]) => {
  const rows = new Map<string, Record<string, number | string>>()
  for (const s of series) {
    if (!ids.includes(s.id) && !ids.some((id) => s.id.startsWith(id))) continue
    const key = ids.find((id) => s.id === id || s.id.startsWith(id))!
    for (const p of s.points) {
      const row = rows.get(p.t) ?? { t: p.t }
      row[key] = Math.max(Number(row[key] ?? 0), Math.round(p.v * 10) / 10)
      rows.set(p.t, row)
    }
  }
  return [...rows.values()].sort((x, y) => String(x.t).localeCompare(String(y.t)))
}

function PartError({ part }: { part: MonitorPart<unknown> }) {
  if (part.ok) return null
  return <p className="flex items-start gap-1.5 text-[12px] text-crit"><AlertTriangle className="mt-0.5 size-3.5 shrink-0" />{T.PART_FAILED}: {part.error}</p>
}

type LineDef = { key: string; label: string; color: string }
function Chart({ title, rows, lines, onPick }: { title: string; rows: Record<string, unknown>[]; lines: LineDef[]; onPick?: (t: string) => void }) {
  return (
    <section className="rounded-[var(--radius-card)] border border-line p-3">
      <h4 className="mb-1 text-[12px] font-semibold text-ink-700">{title}</h4>
      {rows.length === 0 ? <p className="py-10 text-center text-[12px] text-ink-400">{T.NO_DATA}</p> : (
        <div className="h-40">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={rows} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}
              onClick={(s) => { const t = s?.activeLabel; if (onPick && typeof t === 'string') onPick(t) }}
              style={{ cursor: onPick ? 'pointer' : undefined }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" vertical={false} />
              <XAxis dataKey="t" tickFormatter={hhmm} fontSize={10} minTickGap={28} />
              <YAxis fontSize={10} />
              <Tooltip labelFormatter={(t) => (typeof t === 'string' ? istDateTime(t) : '')} contentStyle={{ fontSize: 12, borderRadius: 8, border: '1px solid #e5e7eb' }} />
              {lines.map((l) => <Line key={l.key} dataKey={l.key} name={l.label} stroke={l.color} dot={false} strokeWidth={1.6} isAnimationActive={false} connectNulls />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  )
}

function Tile({ label, value, tone = 'neutral' }: { label: string; value: string; tone?: 'ok' | 'warn' | 'crit' | 'neutral' }) {
  const color = tone === 'crit' ? 'text-crit' : tone === 'warn' ? 'text-warn' : tone === 'ok' ? 'text-ok' : 'text-ink-900'
  return (
    <div className="min-w-0 rounded-[var(--radius-card)] border border-line px-3 py-2">
      <div className="truncate text-[11px] text-ink-500">{label}</div>
      <div className={`font-mono text-[17px] font-semibold ${color}`}>{value}</div>
    </div>
  )
}
const pctTone = (v: number | undefined) => (v == null ? 'neutral' : v >= 90 ? 'crit' : v >= 75 ? 'warn' : 'ok')

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
      {q.isError && <p className="text-[12px] text-crit">{errText(q.error)}</p>}
      {!d ? (!q.isError && <p className="text-[12px] text-ink-400">Loading…</p>) : (
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
  const [peakAt, setPeakAt] = useState<string | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const access = useQuery({ queryKey: ['admin', 'monitor', 'access'], queryFn: ({ signal }) => getMonitorAccess(signal), staleTime: 5 * 60_000 })
  const q = useQuery({ queryKey: ['admin', 'monitor', win], queryFn: ({ signal }) => getMonitorOverview(win, signal), refetchInterval: 5 * 60_000, staleTime: 60_000 })
  const d = q.data
  const health: HealthPoint[] = useMemo(() => d?.health.data ?? [], [d])
  const serverRows = useMemo(() => byTime(d?.metrics.data?.server ?? [], ['mem', 'disk', 'cpu']), [d])
  const dbRows = useMemo(() => byTime(d?.metrics.data?.database ?? [], ['dbcpu', 'dbconn']), [d])
  const pick = (t: string) => setPeakAt(t)

  if (access.isError) return <p className="text-[12.5px] text-crit">{errText(access.error)}</p>
  if (access.data && !access.data.onServer) {
    return <div className="space-y-2 text-[13px]"><p className="text-[12.5px] text-ink-600">{T.SUB}</p><p className="rounded-[var(--radius-card)] border border-line bg-alt p-4 text-ink-700">{T.NOT_ON_SERVER}</p></div>
  }

  const missing = access.data?.checks.filter((c) => !c.ok) ?? []
  const lastBeat = last(health)
  const lastServer = last(serverRows)
  const lastDb = last(dbRows)
  const errors5xx = health.reduce((s, p) => s + (p.errors5xx ?? 0), 0)
  const alertTotal = (d?.alertCounts.data ?? []).reduce((s, c) => s + c.count, 0)
  const alerts = (d?.alerts.data ?? []).filter((a) => !code || a.code === code)

  return (
    <div className="space-y-4 text-[13px]">
      <p className="text-[12.5px] text-ink-600">{T.SUB}</p>

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-[var(--radius-control)] border border-line">
          {MONITOR_WINDOWS.map((w) => (
            <button key={w} type="button" onClick={() => { setWin(w); setPeakAt(null) }}
              className={`px-3 py-1.5 text-[12px] ${w === win ? 'bg-primary text-white' : 'bg-surface text-ink-700 hover:bg-alt'}`}>{T.WINDOW[w]}</button>
          ))}
        </div>
        <Button onClick={() => void q.refetch()} disabled={q.isFetching}><RefreshCw className={`size-3.5 ${q.isFetching ? 'animate-spin' : ''}`} />{T.REFRESH}</Button>
        {access.data?.instanceId && <span className="flex items-center gap-1 font-mono text-[11.5px] text-ink-500"><Server className="size-3.5" />{access.data.instanceId} · {access.data.logGroup}</span>}
      </div>

      {access.data && (
        <details className="rounded-[var(--radius-card)] border border-line p-3" open={missing.length > 0}>
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
        </details>
      )}

      {q.isError && <p className="text-[12.5px] text-crit">{errText(q.error)}</p>}
      {!d ? (!q.isError && <p className="text-[12.5px] text-ink-400">Loading…</p>) : (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-7">
            <Tile label={T.NOW.APP_MEMORY} value={lastBeat?.rssMb != null ? `${lastBeat.rssMb} MB` : '–'} />
            <Tile label={T.NOW.SERVER_RAM} value={lastServer?.mem != null ? `${lastServer.mem}%` : '–'} tone={pctTone(lastServer?.mem as number | undefined)} />
            <Tile label={T.NOW.CPU} value={lastServer?.cpu != null ? `${lastServer.cpu}%` : '–'} tone={pctTone(lastServer?.cpu as number | undefined)} />
            <Tile label={T.NOW.DISK} value={lastServer?.disk != null ? `${lastServer.disk}%` : '–'} tone={pctTone(lastServer?.disk as number | undefined)} />
            <Tile label={T.NOW.DB_CPU} value={lastDb?.dbcpu != null ? `${lastDb.dbcpu}%` : '–'} tone={pctTone(lastDb?.dbcpu as number | undefined)} />
            <Tile label={T.NOW.ERRORS} value={String(errors5xx)} tone={errors5xx ? 'crit' : 'ok'} />
            <Tile label={T.NOW.ALERTS} value={String(alertTotal)} tone={alertTotal ? 'warn' : 'ok'} />
          </div>

          <p className="flex items-center gap-1.5 text-[12px] text-ink-500"><Activity className="size-3.5" />{T.CLICK_HINT}</p>
          <PartError part={d.health} />
          <PartError part={d.metrics} />
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            <Chart title={T.CHARTS.APP_MEMORY} rows={health} onPick={pick} lines={[{ key: 'rssMb', label: 'RSS MB', color: COLORS.a }, { key: 'heapUsedMb', label: 'Heap MB', color: COLORS.c }]} />
            <Chart title={T.CHARTS.SERVER} rows={serverRows} onPick={pick} lines={[{ key: 'mem', label: 'RAM %', color: COLORS.a }, { key: 'disk', label: 'Disk %', color: COLORS.b }, { key: 'cpu', label: 'CPU %', color: COLORS.c }]} />
            <Chart title={T.CHARTS.REQUESTS} rows={health} onPick={pick} lines={[{ key: 'requests', label: 'Requests', color: COLORS.a }, { key: 'errors5xx', label: '5xx', color: COLORS.d }, { key: 'slow', label: 'Slow', color: COLORS.b }]} />
            <Chart title={T.CHARTS.LATENCY} rows={health} onPick={pick} lines={[{ key: 'avgMs', label: 'Avg ms', color: COLORS.a }, { key: 'maxMs', label: 'Max ms', color: COLORS.d }]} />
            <Chart title={T.CHARTS.LOOP} rows={health} onPick={pick} lines={[{ key: 'loopP99Ms', label: 'p99 ms', color: COLORS.a }, { key: 'loopMaxMs', label: 'Max ms', color: COLORS.d }]} />
            <Chart title={T.CHARTS.POOL} rows={health} onPick={pick} lines={[{ key: 'dbPoolMaxWaiting', label: 'Waiting (max)', color: COLORS.d }, { key: 'dbPoolFree', label: 'Free', color: COLORS.c }]} />
            <Chart title={T.CHARTS.DATABASE} rows={dbRows} onPick={pick} lines={[{ key: 'dbcpu', label: 'CPU %', color: COLORS.a }, { key: 'dbconn', label: 'Connections', color: COLORS.b }]} />
          </div>
          {health.length > 0 && <p className="text-[11.5px] text-ink-400">Peak app memory {maxOf(health.map((p) => p.rssMb))} MB · peak event-loop delay {maxOf(health.map((p) => p.loopMaxMs))} ms · most DB waits {maxOf(health.map((p) => p.dbPoolMaxWaiting))}</p>}

          {peakAt && <Peak at={peakAt} onClose={() => setPeakAt(null)} />}

          <section className="space-y-2">
            <h3 className="flex items-center gap-2 font-semibold text-ink-900"><AlertTriangle className="size-4 text-warn" />{T.ALERTS}
              {d.alerts.data && <span className="text-[11.5px] font-normal text-ink-400">{T.ALERT_NEWEST(d.alerts.data.length)}</span>}</h3>
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
          </section>

          <section className="space-y-1.5">
            <h3 className="flex items-center gap-2 font-semibold text-ink-900"><Database className="size-4 text-primary" />{T.ALARMS}</h3>
            <PartError part={d.alarms} />
            {d.alarms.data && (d.alarms.data.length === 0 ? <p className="text-[12px] text-ink-400">{T.ALARMS_NONE}</p> : (
              <ul className="space-y-1 text-[12px]">{d.alarms.data.map((a) => (
                <li key={a.name}><Badge tone={a.state === 'ALARM' ? 'crit' : a.state === 'OK' ? 'ok' : 'neutral'}>{a.state}</Badge> <span className="font-mono">{a.name}</span> <span className="text-ink-500">{a.reason}</span></li>
              ))}</ul>
            ))}
          </section>
        </>
      )}
    </div>
  )
}
