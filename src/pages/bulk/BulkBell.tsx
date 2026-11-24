import { useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { markNoticesSeen, myNotices, noticesKey } from '../../api/notices'
import { NOTICES_REFRESH_MS } from '../../constants/notices'
import { BULK_TEXT } from '../../constants/bulkOrders'

/*
 * The Bulk Orders portal's bell (v2 piece 3, 2026-11-24): the same notices as POST_FG's bell (GET /notices), but only
 * what this person RECEIVED (order approved / rejected, approval needed ...): no Feedback, no sending, no page links
 * (the portal has none of POST_FG's pages). Opening it marks them seen.
 */

const when = (s: string) => new Date(s).toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })

export function BulkBell() {
  const qc = useQueryClient()
  const [open, setOpen] = useState(false)
  const box = useRef<HTMLDivElement>(null)
  const q = useQuery({ queryKey: noticesKey, queryFn: ({ signal }) => myNotices(signal), refetchInterval: NOTICES_REFRESH_MS })
  const received = (q.data?.items ?? []).filter((n) => !n.sent)
  const unread = q.data?.unread ?? 0
  const toggle = () => {
    const next = !open
    setOpen(next)
    if (next && unread > 0) void markNoticesSeen().then((d) => qc.setQueryData(noticesKey, d)).catch(() => undefined)
  }
  if (q.data && !q.data.enabled) return null
  return (
    <div ref={box} className="relative" onBlur={(e) => { if (!box.current?.contains(e.relatedTarget)) setOpen(false) }}>
      <button onClick={toggle} title={BULK_TEXT.BELL} className="relative rounded-md p-1.5 text-ink-400 hover:bg-alt hover:text-ink-900">
        <Bell className="size-4" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid min-w-4 place-items-center rounded-full bg-crit px-1 text-[10px] font-semibold text-white">{unread}</span>}
      </button>
      {open && (
        <div tabIndex={-1} className="absolute right-0 z-40 mt-1 w-80 max-w-[90vw] rounded-[var(--radius-card)] border border-line bg-surface p-2 shadow-lg">
          <div className="px-1 pb-1 text-[12px] font-semibold text-ink-900">{BULK_TEXT.BELL}</div>
          {received.length === 0
            ? <div className="px-1 py-3 text-[12px] text-ink-600">{BULK_TEXT.BELL_EMPTY}</div>
            : received.map((n) => (
              <div key={n.id} className={`rounded-md px-2 py-1.5 text-[12.5px] ${n.read ? 'text-ink-600' : 'bg-primary-soft text-ink-900'}`}>
                <div>{n.text}</div>
                <div className="mt-0.5 text-[11px] text-ink-400">{n.from.name} · {when(n.createdAt)}</div>
              </div>
            ))}
        </div>
      )}
    </div>
  )
}
