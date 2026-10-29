import { useEffect, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, ChevronRight, Loader2, RefreshCw } from 'lucide-react'
import { Badge } from '../../components/ui'
import { ApiError } from '../../api/client'
import { getPoIssuePos, getPoIssues, poIssuesKey, type ChannelIssues, type IssueGroup } from '../../api/poIssues'
import {
  ISSUE_ITEM_LABEL, ISSUE_KIND_LABEL, PO_ISSUES_DAYS, PO_ISSUES_DEFAULT_DAYS, PO_ISSUES_TEXT as T, PO_STATUS_LABEL, PO_STATUS_TONE,
} from '../../constants/poIssues'
import { istDateTime } from '../../lib/time'
import { PoIssuesByCategory } from './PoIssuesByCategory'
import { PATHS, URL_PARAM } from '../../constants/pages'
import { oneOf, useUrlParam } from '../../lib/urlState'

/*
 * PO Processing & Review -> PO issues (user, 2026-10-22: channel based; channels on the left with only "n of m with issues",
 * everything about the picked channel on the right, going INTO a level rather than expanding):
 *   left   every channel (most POs with issues first) + "6 of 23 with issues"
 *   right  the channel: its PO count + the kinds of problems (no status tags: user, 2026-10-22)  ->  a kind: every SKU / location / value /
 *          reason with its POs, typical difference, last seen  ->  an item: the POs behind it.
 *   A path at the top (Blinkit › SKU not mapped › 10149355) goes back up. Counted once per PO from what is stored.
 */

type View = { kind?: string; item?: string }
const MODES = ['category', 'channel'] as const
type Mode = (typeof MODES)[number]

const money = (n: number) => `${n > 0 ? '+' : ''}₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
const th = 'sticky top-0 z-10 border-b border-primary/20 bg-primary-soft px-3 py-2 text-left text-[11.5px] font-semibold text-primary whitespace-nowrap'
const td = 'border-b border-line/70 px-3 py-2 text-[12.5px]'

export function PoIssues() {
  // days and By category / By channel are in the address (?days=, ?view=), so a refresh keeps them
  const [daysText, setDaysText] = useUrlParam(PATHS.PO_REVIEW, URL_PARAM.DAYS, oneOf(PO_ISSUES_DAYS), String(PO_ISSUES_DEFAULT_DAYS))
  const days = Number(daysText)
  const setDays = (d: number) => setDaysText(String(d))
  // By category first (user, 2026-10-23); By channel kept.
  const [mode, setMode] = useUrlParam<Mode>(PATHS.PO_REVIEW, URL_PARAM.VIEW, oneOf(MODES), 'category')
  const q = useQuery({ queryKey: poIssuesKey(days), queryFn: ({ signal }) => getPoIssues(days, signal) })
  // Refresh = computed now on the server (not the shared answer), shown at once
  const queryClient = useQueryClient()
  const [refreshing, setRefreshing] = useState(false)
  const refresh = () => {
    setRefreshing(true)
    getPoIssues(days, undefined, true).then((d) => queryClient.setQueryData(poIssuesKey(days), d)).catch(() => undefined).finally(() => setRefreshing(false))
  }
  const [channel, setChannel] = useState<string | null>(null)
  const [view, setView] = useState<View>({})
  const channels = q.data?.channels ?? []
  // The channel with most issues is open first; a channel that has gone from the period falls back to it.
  useEffect(() => {
    if (channels.length && !channels.some((c) => c.channel === channel)) { setChannel(channels[0].channel); setView({}) }
  }, [channels, channel])
  const current = channels.find((c) => c.channel === channel)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-start justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface p-4">
        <div>
          <div className="text-[14px] font-semibold text-ink-900">{T.TITLE}</div>
          <p className="mt-1 max-w-3xl text-[12.5px] text-ink-600">{mode === 'category' ? T.SUB_CATEGORY : T.SUB}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
        {q.data && (
          <span className="text-[11.5px] text-ink-400" title={istDateTime(q.data.computedAt)}>{T.UPDATED(new Date(q.data.computedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }))}</span>
        )}
        <button type="button" onClick={refresh} disabled={refreshing}
          className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12.5px] font-semibold text-ink-600 hover:bg-alt hover:text-ink-900 disabled:opacity-50">
          <RefreshCw className={`size-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? T.REFRESHING : T.REFRESH}
        </button>
        <div className="flex items-center gap-1 rounded-[var(--radius)] bg-alt/70 p-1">
          {(['category', 'channel'] as const).map((m) => (
            <button key={m} type="button" onClick={() => setMode(m)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-150 ${mode === m ? 'bg-surface text-primary shadow-sm' : 'text-ink-600 hover:text-ink-900'}`}>
              {m === 'category' ? T.VIEW_CATEGORY : T.VIEW_CHANNEL}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1 rounded-[var(--radius)] bg-alt/70 p-1">
          {PO_ISSUES_DAYS.map((d) => (
            <button key={d} type="button" onClick={() => setDays(d)}
              className={`rounded-md px-3 py-1.5 text-[12.5px] font-semibold transition-colors duration-150 ${days === d ? 'bg-primary text-white shadow-sm' : 'text-ink-600 hover:bg-surface hover:text-ink-900'}`}>
              {T.DAYS(d)}
            </button>
          ))}
        </div>
        </div>
      </div>

      {q.error ? (
        <div className="flex items-center gap-2 rounded-[var(--radius)] bg-crit-soft px-4 py-3 text-[13px] text-crit"><AlertTriangle className="size-4" />{q.error instanceof ApiError ? q.error.message : String(q.error)}</div>
      ) : !q.data ? (
        <div className="flex items-center justify-center gap-2 rounded-[var(--radius)] border border-line bg-surface px-4 py-10 text-[13px] text-ink-600"><Loader2 className="size-4 animate-spin" />{T.LOADING}</div>
      ) : !channels.length ? (
        <div className="rounded-[var(--radius)] border border-line bg-surface px-4 py-10 text-center text-[13px] text-ink-600">{T.EMPTY}</div>
      ) : mode === 'category' ? (
        <div className={`transition-opacity duration-200 ${q.isFetching ? 'opacity-60' : ''}`}><PoIssuesByCategory channels={channels} days={days} /></div>
      ) : (
        <div className={`grid gap-3 transition-opacity duration-200 md:grid-cols-[240px_1fr] ${q.isFetching ? 'opacity-60' : ''}`}>
          {/* Left: the channels */}
          <div className="h-fit overflow-hidden rounded-[var(--radius-card)] border border-line bg-surface md:sticky md:top-3">
            {channels.map((c) => {
              const active = c.channel === channel
              return (
                <button key={c.channel} type="button" onClick={() => { setChannel(c.channel); setView({}) }}
                  className={`block w-full border-b border-line px-4 py-3 text-left transition-colors duration-150 last:border-b-0 ${active ? 'bg-primary-soft shadow-[inset_3px_0_0_var(--color-primary)]' : 'hover:bg-alt/60'}`}>
                  <div className={`text-[13.5px] font-semibold ${active ? 'text-primary' : 'text-ink-900'}`}>{c.channel}</div>
                  <div className={`mt-0.5 text-[12px] ${c.withIssues ? 'text-warn' : 'text-ok'}`}>{c.withIssues ? T.WITH_ISSUES(c.withIssues, c.pos) : T.NO_ISSUES}</div>
                </button>
              )
            })}
          </div>

          {/* Right: the picked channel, one level at a time */}
          {current && (
            <div className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface">
              <Path c={current} view={view} setView={setView} />
              <div key={`${current.channel}|${view.kind ?? ''}|${view.item ?? ''}`} className="pf-tab-in p-4">
                {view.kind && view.item ? <PoList channel={current.channel} kind={view.kind} item={view.item} days={days} />
                  : view.kind ? <KindItems g={current.groups.find((g) => g.kind === view.kind)} onItem={(item) => setView({ kind: view.kind, item })} />
                    : <ChannelOverview c={current} onKind={(kind) => setView({ kind })} />}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/** Blinkit › SKU not mapped › 10149355: each part goes back to that level. */
function Path({ c, view, setView }: { c: ChannelIssues; view: View; setView: (v: View) => void }) {
  const part = (label: string, onClick: (() => void) | null) => onClick
    ? <button type="button" onClick={onClick} className="font-semibold text-primary hover:underline">{label}</button>
    : <span className="font-semibold text-ink-900">{label}</span>
  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-line px-4 py-3 text-[13px]">
      {part(c.channel, view.kind ? () => setView({}) : null)}
      {view.kind && <><ChevronRight className="size-3.5 text-ink-400" />{part(ISSUE_KIND_LABEL[view.kind] ?? view.kind, view.item ? () => setView({ kind: view.kind }) : null)}</>}
      {view.item && <><ChevronRight className="size-3.5 text-ink-400" /><span className="max-w-[420px] truncate font-mono font-semibold text-ink-900" title={view.item}>{view.item}</span></>}
    </div>
  )
}

/** Level 1: where the channel's POs ended + the kinds of problems (click one to go in). */
function ChannelOverview({ c, onKind }: { c: ChannelIssues; onKind: (kind: string) => void }) {
  const share = c.pos ? Math.round((c.withIssues / c.pos) * 100) : 0
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-[13px] text-ink-600">{T.POS(c.pos)}</span>
        {c.withIssues > 0 && (
          <span className="ml-auto flex items-center gap-2 text-[12.5px]">
            <span className="h-1.5 w-28 overflow-hidden rounded-full bg-alt"><span className="block h-full rounded-full bg-warn" style={{ width: `${share}%` }} /></span>
            <span className="font-semibold text-warn">{T.WITH_ISSUES(c.withIssues, c.pos)}</span>
          </span>
        )}
      </div>
      {!c.groups.length ? (
        <div className="rounded-[var(--radius)] bg-ok-soft px-4 py-6 text-center text-[13px] text-ok">{T.NO_ISSUES}</div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {c.groups.map((g) => (
            <button key={g.kind} type="button" onClick={() => onKind(g.kind)}
              className="pf-press group flex items-center gap-3 rounded-[var(--radius)] border border-line px-4 py-3 text-left transition-colors duration-150 hover:border-primary/40 hover:bg-primary/5">
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-ink-900">{ISSUE_KIND_LABEL[g.kind] ?? g.kind}</div>
                <div className="mt-0.5 truncate text-[12px] text-ink-400">{g.items.slice(0, 3).map((i) => i.item).join(' · ')}</div>
              </div>
              <span className="flex flex-col items-end gap-1">
                <Badge tone={g.kind === 'REJECTED' || g.kind === 'SENT_BACK' ? 'crit' : 'warn'}>{T.POS(g.pos)}</Badge>
                {g.kind !== 'REJECTED' && g.kind !== 'SENT_BACK' && (
                  <span className={`text-[11px] font-semibold ${g.open ? 'text-crit' : 'text-ok'}`}>{g.open ? T.OPEN_OF(g.open, g.items.length) : T.ALL_FIXED}</span>
                )}
              </span>
              <ChevronRight className="size-4 text-ink-400 transition-transform duration-150 group-hover:translate-x-0.5" />
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

/** Level 2: every item of one kind (click a row to see its POs). */
function KindItems({ g, onItem }: { g: IssueGroup | undefined; onItem: (item: string) => void }) {
  const [hideFixed, setHideFixed] = useState(false)
  if (!g) return <div className="py-6 text-center text-[13px] text-ink-600">{T.EMPTY}</div>
  const rows = hideFixed ? g.items.filter((i) => i.state !== 'fixed') : g.items
  const hasDiff = g.items.some((i) => i.avgDiff !== null)
  const hasPep = g.items.some((i) => i.pepCode)
  const tone = (s: string) => (s === 'open' ? 'crit' : s === 'fixed' ? 'ok' : 'neutral')
  return (
    <div className="space-y-2">
    <div className="flex items-center justify-between gap-3 text-[12px] text-ink-600">
      <span>{T.STATE_HINT}</span>
      <label className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-ink-900">
        <input type="checkbox" checked={hideFixed} onChange={(e) => setHideFixed(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />{T.HIDE_FIXED}
      </label>
    </div>
    <div className="max-h-[560px] overflow-auto rounded-[var(--radius)] border border-line">
      <table className="min-w-full border-separate border-spacing-0">
        <thead>
          <tr>
            <th className={th}>{ISSUE_ITEM_LABEL[g.kind] ?? T.ITEM}</th>
            {hasPep && <th className={th}>{T.OUR_SKU}</th>}
            <th className={th}>{T.STATE}</th>
            <th className={`${th} text-right`}>{T.COUNT}</th>
            {hasDiff && <th className={`${th} text-right`}>{T.DIFF}</th>}
            <th className={th}>{T.LAST}</th>
            <th className={`${th} w-6`} />
          </tr>
        </thead>
        <tbody>
          {rows.map((it) => (
            <tr key={it.item} onClick={() => onItem(it.item)} className={`group cursor-pointer hover:bg-primary/5 ${it.state === 'fixed' ? 'opacity-70' : ''}`}>
              <td className={`${td} max-w-[380px] truncate font-mono`} title={it.item}>{it.item}</td>
              {hasPep && <td className={`${td} font-mono text-ink-600`}>{it.pepCode ?? '—'}</td>}
              <td className={td}>
                <Badge tone={tone(it.state)}>{T.STATE_LABEL[it.state] ?? it.state}</Badge>
                <div className="mt-0.5 max-w-[260px] truncate text-[11.5px] text-ink-600" title={it.note}>{it.note}</div>
              </td>
              <td className={`${td} tnum text-right font-semibold text-primary`}>{it.pos}</td>
              {hasDiff && <td className={`${td} tnum text-right ${it.avgDiff ? 'text-crit' : 'text-ink-400'}`}>{it.avgDiff === null ? '—' : money(it.avgDiff)}</td>}
              <td className={`${td} tnum text-ink-600`}>{istDateTime(it.lastSeen)}</td>
              <td className={td}><ChevronRight className="size-4 text-ink-400 transition-transform duration-150 group-hover:translate-x-0.5" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </div>
  )
}

/** Level 3: the POs behind one item. */
function PoList({ channel, kind, item, days }: { channel: string; kind: string; item: string; days: number }) {
  const q = useQuery({ queryKey: ['po-review', 'issues', 'pos', channel, kind, item, days], queryFn: ({ signal }) => getPoIssuePos(channel, kind, item, days, signal) })
  if (!q.data) return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-ink-400" /></div>
  return (
    <div className="max-h-[560px] overflow-auto rounded-[var(--radius)] border border-line">
      <table className="min-w-full border-separate border-spacing-0">
        <thead><tr>{[T.PO, T.STATUS, T.CAME_IN].map((h) => <th key={h} className={th}>{h}</th>)}</tr></thead>
        <tbody>
          {q.data.map((p) => (
            <tr key={p.uploadId} className="hover:bg-primary/5">
              <td className={`${td} font-mono`}>{p.poNumber ?? `#${p.uploadId}`}</td>
              <td className={td}><Badge tone={PO_STATUS_TONE[p.status] ?? 'neutral'}>{PO_STATUS_LABEL[p.status] ?? p.status}</Badge></td>
              <td className={`${td} tnum text-ink-600`}>{istDateTime(p.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
