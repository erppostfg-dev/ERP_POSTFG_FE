import { useEffect, useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Download, Loader2 } from 'lucide-react'
import { Badge, Modal } from '../../components/ui'
import { getPoIssuePos, getPoIssues, poIssuesKey, type ChannelIssues, type IssueGroup, type IssueItem } from '../../api/poIssues'
import { ISSUE_ITEM_LABEL, ISSUE_KIND_LABEL, PO_ISSUES_TEXT as T, PO_STATUS_LABEL, PO_STATUS_TONE } from '../../constants/poIssues'
import { downloadExcel } from '../../lib/excelExport'
import { istDateTime } from '../../lib/time'

/*
 * PO Processing & Review -> PO issues -> By category (user, 2026-10-23; the default view): the kinds of problems across every
 * channel as tabs (most POs first); a kind -> one table per channel: the SKU / location / reason, how many POs had it
 * (times) and whether it is still a problem. Excel per channel or for all channels (one sheet each): the SKU and the
 * times only (+ "Now" when fixed ones are included); open ones by default. Same data as By channel, no extra call.
 */

const OUTCOMES = ['REJECTED', 'SENT_BACK']
const th = 'sticky top-0 z-10 border-b border-primary/20 bg-primary-soft px-3 py-2 text-left text-[11.5px] font-semibold text-primary whitespace-nowrap'
const td = 'border-b border-line/70 px-3 py-2 text-[12.5px]'
const tone = (s: string) => (s === 'open' ? 'crit' : s === 'fixed' ? 'ok' : 'neutral')

interface Category { kind: string; pos: number; open: number }

export function PoIssuesByCategory({ channels, days }: { channels: ChannelIssues[]; days: number }) {
  // Every kind seen in any channel, most POs first.
  const categories = useMemo<Category[]>(() => {
    const by = new Map<string, Category>()
    for (const c of channels) for (const g of c.groups) {
      const v = by.get(g.kind) ?? { kind: g.kind, pos: 0, open: 0 }
      by.set(g.kind, { ...v, pos: v.pos + g.pos, open: v.open + g.open })
    }
    return [...by.values()].sort((a, b) => b.pos - a.pos)
  }, [channels])
  const [kind, setKind] = useState<string | null>(null)
  useEffect(() => {
    if (categories.length && !categories.some((c) => c.kind === kind)) setKind(categories[0].kind)
  }, [categories, kind])
  const [withFixed, setWithFixed] = useState(false)
  const [open, setOpen] = useState<{ channel: string; item: string } | null>(null)
  const [note, setNote] = useState<string | null>(null)
  // download state (hooks before the early return below)
  const queryClient = useQueryClient()
  const [downloading, setDownloading] = useState(false)
  useEffect(() => setNote(null), [kind, withFixed])

  if (!categories.length) return <div className="rounded-[var(--radius)] bg-ok-soft px-4 py-8 text-center text-[13px] text-ok">{T.NO_ISSUES}</div>
  const current = categories.find((c) => c.kind === kind) ?? categories[0]
  const label = ISSUE_KIND_LABEL[current.kind] ?? current.kind
  const itemLabel = ISSUE_ITEM_LABEL[current.kind] ?? T.ITEM
  const outcome = OUTCOMES.includes(current.kind)
  const perChannel = channels
    .map((c) => ({ channel: c.channel, g: c.groups.find((g) => g.kind === current.kind) }))
    .filter((x): x is { channel: string; g: IssueGroup } => !!x.g)
    .sort((a, b) => b.g.pos - a.g.pos)

  // Excel: the item and how many times (+ "Now" when the fixed ones are in). Open ones only unless ticked.
  const sheetOf = (channel: string, items: IssueItem[]) => {
    const rows = items.filter((i) => withFixed || outcome || i.state !== 'fixed')
    return {
      name: channel,
      header: withFixed && !outcome ? [itemLabel, T.TIMES, T.STATE] : [itemLabel, T.TIMES],
      rows: rows.map((i) => (withFixed && !outcome ? [i.item, i.pos, T.STATE_LABEL[i.state] ?? i.state] : [i.item, i.pos])),
    }
  }
  // Never a stale file (user, 2026-10-29): every download asks the server for the numbers NOW (fresh=1), builds the
  // file from that answer and puts it on the screen too, so the screen and the file match.
  const download = async (who: string, onlyChannel: string | null) => {
    setDownloading(true)
    setNote(T.DOWNLOAD_FRESH)
    try {
      const fresh = await getPoIssues(days, undefined, true)
      queryClient.setQueryData(poIssuesKey(days), fresh)
      const list = fresh.channels
        .filter((c) => onlyChannel === null || c.channel === onlyChannel)
        .map((c) => ({ channel: c.channel, g: c.groups.find((g) => g.kind === current.kind) }))
        .filter((x): x is { channel: string; g: IssueGroup } => !!x.g)
        .sort((a, b) => b.g.pos - a.g.pos)
      const sheets = list.map((x) => sheetOf(x.channel, x.g.items)).filter((s) => s.rows.length)
      if (!sheets.length) { setNote(T.EXCEL_NONE); return }
      setNote(null)
      await downloadExcel(T.EXCEL_FILE(label, who, days), sheets)
    } catch (e) {
      setNote(T.DOWNLOAD_FAILED(e instanceof Error ? e.message : String(e)))
    } finally {
      setDownloading(false)
    }
  }

  return (
    <div className="space-y-3">
      {/* Categories */}
      <div className="flex flex-wrap gap-2">
        {categories.map((c) => {
          const active = c.kind === current.kind
          return (
            <button key={c.kind} type="button" onClick={() => setKind(c.kind)}
              className={`pf-press rounded-[var(--radius)] border px-3.5 py-2 text-left transition-colors duration-150 ${active ? 'border-primary bg-primary-soft' : 'border-line bg-surface hover:border-primary/40 hover:bg-primary/5'}`}>
              <div className={`text-[13px] font-semibold ${active ? 'text-primary' : 'text-ink-900'}`}>{ISSUE_KIND_LABEL[c.kind] ?? c.kind}</div>
              <div className="mt-0.5 text-[11.5px] text-ink-600">{OUTCOMES.includes(c.kind) ? T.POS(c.pos) : T.CATEGORY_COUNT(c.pos, c.open)}</div>
            </button>
          )
        })}
      </div>

      {/* Download all + include fixed */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-[var(--radius-card)] border border-line bg-surface px-4 py-2.5">
        <div className="text-[13.5px] font-semibold text-ink-900">{label}</div>
        <div className="flex items-center gap-4">
          {!outcome && (
            <label className="inline-flex cursor-pointer items-center gap-1.5 text-[12.5px] font-semibold text-ink-900">
              <input type="checkbox" checked={withFixed} onChange={(e) => setWithFixed(e.target.checked)} className="size-4 accent-[var(--color-primary)]" />{T.EXCEL_INCLUDE_FIXED}
            </label>
          )}
          <button type="button" onClick={() => void download(T.ALL_CHANNELS, null)} disabled={downloading}
            className="pf-press inline-flex h-8 items-center gap-1.5 rounded-[var(--radius)] bg-primary px-3 text-[12.5px] font-semibold text-white hover:opacity-90">
            <Download className="size-3.5" />{T.EXCEL_ALL}
          </button>
        </div>
      </div>

      {note && <div className="pf-tab-in rounded-[var(--radius)] bg-warn-soft px-4 py-2 text-[12.5px] text-warn">{note}</div>}

      {/* One table per channel */}
      <div key={current.kind} className="pf-tab-in grid gap-3 xl:grid-cols-2">
        {perChannel.map(({ channel, g }) => (
          <div key={channel} className="min-w-0 rounded-[var(--radius-card)] border border-line bg-surface">
            <div className="flex items-center gap-3 border-b border-line px-4 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="text-[13.5px] font-semibold text-ink-900">{channel}</div>
                <div className="text-[11.5px] text-ink-600">{outcome ? T.POS(g.pos) : T.CHANNEL_HEAD(g.pos, g.open, g.items.length)}</div>
              </div>
              <button type="button" onClick={() => void download(channel, channel)} disabled={downloading}
                className="pf-press inline-flex h-7 items-center gap-1 rounded-[var(--radius)] border border-primary/40 px-2.5 text-[12px] font-semibold text-primary hover:bg-primary-soft">
                <Download className="size-3.5" />{T.EXCEL}
              </button>
            </div>
            <div className="max-h-[360px] overflow-auto">
              <table className="min-w-full border-separate border-spacing-0">
                <thead>
                  <tr>
                    <th className={th}>{itemLabel}</th>
                    <th className={`${th} text-right`}>{T.TIMES}</th>
                    {!outcome && <th className={th}>{T.STATE}</th>}
                  </tr>
                </thead>
                <tbody>
                  {g.items.map((it) => (
                    <tr key={it.item} onClick={() => setOpen({ channel, item: it.item })} className={`cursor-pointer hover:bg-primary/5 ${it.state === 'fixed' ? 'opacity-70' : ''}`}>
                      <td className={`${td} max-w-[320px] truncate font-mono`} title={it.item}>{it.item}</td>
                      <td className={`${td} tnum text-right font-semibold text-primary`}>{it.pos}</td>
                      {!outcome && <td className={td}><Badge tone={tone(it.state)}>{T.STATE_LABEL[it.state] ?? it.state}</Badge></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      <Modal open={!!open} onClose={() => setOpen(null)} wide title={open ? `${open.channel} · ${label}` : ''} sub={open?.item}>
        {open && <ItemPos channel={open.channel} kind={current.kind} item={open.item} days={days} />}
      </Modal>
    </div>
  )
}

/** The POs behind one item (same call as By channel). */
function ItemPos({ channel, kind, item, days }: { channel: string; kind: string; item: string; days: number }) {
  const q = useQuery({ queryKey: ['po-review', 'issues', 'pos', channel, kind, item, days], queryFn: ({ signal }) => getPoIssuePos(channel, kind, item, days, signal) })
  if (!q.data) return <div className="flex justify-center py-8"><Loader2 className="size-5 animate-spin text-ink-400" /></div>
  return (
    <div className="max-h-[420px] overflow-auto rounded-[var(--radius)] border border-line">
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
