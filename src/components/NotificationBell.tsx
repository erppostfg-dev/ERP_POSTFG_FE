import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell } from 'lucide-react'
import { useNavigate } from 'react-router'
import {
  feedbackNotifications, feedbackNotificationsKey, readFeedbackNotifications, type FeedbackNotification, type FeedbackNotifications,
} from '../api/feedback'
import { FEEDBACK_BELL_REFRESH_MS, FEEDBACK_BELL_TEXT as T } from '../constants/feedback'
import { PATHS, URL_PARAM } from '../constants/pages'
import { istDateTime } from '../lib/time'

/*
 * The bell in the top bar (2026-11-06, user: "if they are assigned or someone replied in the thread they get a
 * notification at the top icon with 1, 2"). The red count = unread notifications (9+ above 9). The list: newest 30;
 * a click opens the item on the Feedback page (?item=id), which marks its notifications read. Asks again every 30 s
 * and when the tab comes back into focus.
 */

const line = (n: FeedbackNotification) =>
  n.kind === 'assigned' ? T.ASSIGNED(n.by.name) : n.kind === 'added' ? T.ADDED(n.by.name) : T.COMMENT(n.by.name)

export function NotificationBell() {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const bell = useQuery({
    queryKey: feedbackNotificationsKey, queryFn: ({ signal }) => feedbackNotifications(signal),
    refetchInterval: FEEDBACK_BELL_REFRESH_MS, refetchOnWindowFocus: true,
  })
  const unread = bell.data?.unread ?? 0
  const items = bell.data?.items ?? []

  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [open])

  const save = (b: FeedbackNotifications) => queryClient.setQueryData(feedbackNotificationsKey, b)
  const openItem = (n: FeedbackNotification) => {
    setOpen(false)
    if (!n.read) readFeedbackNotifications({ itemId: n.itemId }).then(save).catch(() => undefined)
    void navigate(`${PATHS.FEEDBACK}?${URL_PARAM.ITEM}=${encodeURIComponent(n.itemId)}`)
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-label={unread ? `${T.TITLE}: ${T.UNREAD(unread)}` : T.TITLE} title={T.TITLE}
        className="relative flex size-8 items-center justify-center rounded-full text-ink-600 hover:bg-alt hover:text-ink-900">
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crit px-1 text-[10px] font-bold leading-none text-white tabular-nums">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {open && (
        <div className="absolute right-0 top-10 z-50 w-80 max-w-[calc(100vw-2rem)] rounded-[var(--radius-card)] border border-line bg-surface shadow-lg">
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <span className="text-[13px] font-semibold text-ink-900">{T.TITLE}{unread > 0 && <span className="ml-1.5 text-[11.5px] font-medium text-ink-400">{T.UNREAD(unread)}</span>}</span>
            {unread > 0 && (
              <button type="button" onClick={() => void readFeedbackNotifications({}).then(save).catch(() => undefined)}
                className="text-[11.5px] font-semibold text-primary hover:underline">{T.READ_ALL}</button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {!items.length && <div className="px-3 py-6 text-center text-[12.5px] text-ink-400">{T.EMPTY}</div>}
            {items.map((n) => (
              <button key={n.id} type="button" onClick={() => openItem(n)}
                className={`flex w-full gap-2 border-b border-line px-3 py-2 text-left last:border-b-0 hover:bg-alt ${n.read ? '' : 'bg-primary-soft/40'}`}>
                <span className={`mt-1.5 size-1.5 shrink-0 rounded-full ${n.read ? 'bg-transparent' : 'bg-primary'}`} />
                <span className="min-w-0 flex-1">
                  <span className="block text-[12.5px] text-ink-900"><span className="font-semibold">{line(n)}</span> · #{n.itemId} {n.itemTitle}</span>
                  {n.text && <span className="mt-0.5 line-clamp-2 block text-[12px] text-ink-600">{n.text}</span>}
                  <span className="mt-0.5 block text-[11px] text-ink-400">{istDateTime(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
          <button type="button" onClick={() => { setOpen(false); void navigate(PATHS.FEEDBACK) }}
            className="w-full border-t border-line px-3 py-2 text-[12px] font-semibold text-primary hover:bg-alt">{T.OPEN_ALL}</button>
        </div>
      )}
    </div>
  )
}
