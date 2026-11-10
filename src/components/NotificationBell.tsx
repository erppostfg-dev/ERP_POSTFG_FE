import { useEffect, useRef, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Megaphone, Send } from 'lucide-react'
import { useNavigate } from 'react-router'
import {
  feedbackNotifications, feedbackNotificationsKey, readFeedbackNotifications, type FeedbackNotification, type FeedbackNotifications,
} from '../api/feedback'
import { FEEDBACK_BELL_REFRESH_MS, FEEDBACK_BELL_TEXT as T } from '../constants/feedback'
import { markNoticesSeen, myNotices, noticesKey, type MyNotices } from '../api/notices'
import { NOTICE_BELL_OUT_MS, NOTICE_REVEAL_OUT_MS, NOTICE_TOAST_MS, NOTICES_REFRESH_MS, NOTICES_TEXT as NT } from '../constants/notices'
import { NoticeRow, NoticeSendForm } from './NoticesPanel'
import { useLeaving } from '../lib/useLeaving'
import { PATHS, URL_PARAM } from '../constants/pages'
import { istDateTime } from '../lib/time'

/*
 * The bell in the top bar (2026-11-06, user: "if they are assigned or someone replied in the thread they get a
 * notification at the top icon with 1, 2"). The red count = unread notifications (9+ above 9). The list: newest 30;
 * a click opens the item on the Feedback page (?item=id), which marks its notifications read. Asks again every 30 s
 * and when the tab comes back into focus.
 * Notices (2026-11-10): short one-way notes people send (kept 2 days) sit ABOVE Feedback's in the same panel, with
 * "Send notice" on top. Opening the bell marks every notice read (no read receipts); the ones new at that moment stay
 * tinted while the panel is open. A new notice while the panel is closed pops up under the bell for a few seconds.
 */

const line = (n: FeedbackNotification) =>
  n.kind === 'assigned' ? T.ASSIGNED(n.by.name) : n.kind === 'added' ? T.ADDED(n.by.name) : T.COMMENT(n.by.name)

export function NotificationBell() {
  // the panel opens with a drop + fade and closes the same way (index.css pf-bell-in / -out)
  const panel = useLeaving(NOTICE_BELL_OUT_MS)
  const open = panel.shown && !panel.leaving
  const setOpen = (v: boolean) => (v ? panel.show() : panel.hide())
  const sendBox = useLeaving(NOTICE_REVEAL_OUT_MS)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const bell = useQuery({
    queryKey: feedbackNotificationsKey, queryFn: ({ signal }) => feedbackNotifications(signal),
    refetchInterval: FEEDBACK_BELL_REFRESH_MS, refetchOnWindowFocus: true,
  })
  const notices = useQuery({
    queryKey: noticesKey, queryFn: ({ signal }) => myNotices(signal),
    refetchInterval: NOTICES_REFRESH_MS, refetchOnWindowFocus: true,
  })
  const nb = notices.data
  const unread = (bell.data?.unread ?? 0) + (nb?.unread ?? 0)
  const items = bell.data?.items ?? []
  // the notices that were new when the panel opened (they stay tinted; the server already counts them read)
  const [fresh, setFresh] = useState<Set<string>>(new Set())
  const saveNotices = (b: MyNotices) => queryClient.setQueryData(noticesKey, b)
  const toggle = () => {
    if (open) return setOpen(false)
    setOpen(true)
    setToast(null)
    if (nb?.unread) {
      setFresh(new Set(nb.items.filter((n) => !n.read).map((n) => n.id)))
      markNoticesSeen().then(saveNotices).catch(() => undefined)
    } else setFresh(new Set())
  }

  // a new unread notice while the panel is closed: show it under the bell for a few seconds (not on first load)
  const [toast, setToast] = useState<{ from: string; text: string } | null>(null)
  const newest = useRef<string | null | undefined>(undefined)
  useEffect(() => {
    if (!nb) return
    const top = nb.items.find((n) => !n.sent && !n.read)
    if (newest.current !== undefined && top && top.id !== newest.current && !open) setToast({ from: top.from.name, text: top.text })
    newest.current = top?.id ?? newest.current ?? null
  }, [nb, open])
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(() => setToast(null), NOTICE_TOAST_MS)
    return () => clearTimeout(t)
  }, [toast])

  // outside click / Esc closes it (re-attached each render, as usePopover does, so it always sees the current state)
  useEffect(() => {
    if (!open) return
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false) }
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  })

  const save = (b: FeedbackNotifications) => queryClient.setQueryData(feedbackNotificationsKey, b)
  const openItem = (n: FeedbackNotification) => {
    setOpen(false)
    if (!n.read) readFeedbackNotifications({ itemId: n.itemId }).then(save).catch(() => undefined)
    void navigate(`${PATHS.FEEDBACK}?${URL_PARAM.ITEM}=${encodeURIComponent(n.itemId)}`)
  }

  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={toggle} aria-label={unread ? `${T.TITLE}: ${T.UNREAD(unread)}` : T.TITLE} title={T.TITLE}
        className={`relative flex size-8 items-center justify-center rounded-full text-ink-600 hover:bg-alt hover:text-ink-900 ${nb?.unread && !open ? 'pf-attn' : ''}`}>
        <Bell className="size-4" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-crit px-1 text-[10px] font-bold leading-none text-white tabular-nums">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {toast && !open && (
        <button type="button" onClick={toggle}
          className="pf-tab-in absolute right-0 top-10 z-50 w-72 max-w-[calc(100vw-2rem)] rounded-[var(--radius-card)] border border-primary/30 bg-surface px-3 py-2 text-left shadow-lg">
          <span className="flex items-center gap-1.5 text-[12px] font-semibold text-primary"><Megaphone className="size-3.5" />{NT.NEW_FROM(toast.from)}</span>
          <span className="mt-0.5 line-clamp-2 block text-[12.5px] text-ink-900">{toast.text}</span>
        </button>
      )}
      {panel.shown && (
        <div className={`${panel.leaving ? 'pf-bell-out' : 'pf-bell-in'} absolute right-0 top-10 z-50 w-96 max-w-[calc(100vw-2rem)] rounded-[var(--radius-card)] border border-line bg-surface shadow-lg`}>
          <div className="flex items-center justify-between gap-2 border-b border-line px-3 py-2">
            <span className="text-[13px] font-semibold text-ink-900">{T.TITLE}{unread > 0 && <span className="ml-1.5 text-[11.5px] font-medium text-ink-400">{T.UNREAD(unread)}</span>}</span>
            {nb?.enabled && !sendBox.shown && (
              <button type="button" onClick={sendBox.show}
                className="pf-press inline-flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[11.5px] font-semibold text-white hover:opacity-90"><Send className="size-3" />{NT.SEND}</button>
            )}
          </div>
          {sendBox.shown && nb && (
            <div className={sendBox.leaving ? 'pf-reveal-out' : 'pf-reveal'}>
              <div><NoticeSendForm canSendEveryone={nb.canSendEveryone} onCancel={sendBox.hide} onSent={(b) => { saveNotices(b); sendBox.hide() }} /></div>
            </div>
          )}
          <div className="max-h-[28rem] overflow-y-auto">
            {!!nb?.items.length && (
              <>
                <div className="sticky top-0 z-10 border-b border-line bg-alt px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">{NT.SECTION}</div>
                {nb.items.map((n) => (
                  <NoticeRow key={n.id} n={n} fresh={fresh.has(n.id)} onSent={saveNotices} onOpenLink={(link) => { setOpen(false); void navigate(link) }} />
                ))}
              </>
            )}
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-line bg-alt px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-ink-400">
              {NT.FEEDBACK_SECTION}
              {(bell.data?.unread ?? 0) > 0 && (
                <button type="button" onClick={() => void readFeedbackNotifications({}).then(save).catch(() => undefined)}
                  className="text-[11px] font-semibold normal-case tracking-normal text-primary hover:underline">{T.READ_ALL}</button>
              )}
            </div>
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
