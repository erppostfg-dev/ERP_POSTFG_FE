import { api } from './client'
import { NOTICES_ENDPOINT } from '../constants/notices'

/* Notices (2026-11-10, POST_FG /notices): one-way notes in the bell, kept 2 days. Types = POST_FG notices.service. */
export interface NoticePerson { id: number; name: string; email: string }
export interface Notice {
  id: string; from: NoticePerson
  /** 'everyone' or the person it went to. */
  to: 'everyone' | NoticePerson
  text: string; link: string | null
  /** A reply: the start of the notice it answers. */
  replyQuote: string | null
  /** I sent it; otherwise I received it. */
  sent: boolean
  /** Received, sent to me alone: I may reply (to the sender only). */
  canReply: boolean
  read: boolean; createdAt: string; expiresAt: string
}
export interface MyNotices { enabled: boolean; canSendEveryone: boolean; unread: number; items: Notice[] }
export type NoticeSend = { to: number | 'everyone'; text: string; link?: string } | { replyToId: string; text: string; link?: string }

export const noticesKey = ['notices', 'mine'] as const
export const noticePeopleKey = ['notices', 'people'] as const
export const noticeSettingsKey = ['notices', 'settings'] as const
export const myNotices = (signal?: AbortSignal) => api<MyNotices>(NOTICES_ENDPOINT, { signal })
export const sendNotice = (body: NoticeSend) => api<MyNotices>(NOTICES_ENDPOINT, { method: 'POST', body: JSON.stringify(body) })
/** Opened the bell: everything received so far counts as read. */
export const markNoticesSeen = () => api<MyNotices>(`${NOTICES_ENDPOINT}/seen`, { method: 'POST', body: '{}' })
export const noticePeople = (signal?: AbortSignal) => api<NoticePerson[]>(`${NOTICES_ENDPOINT}/people`, { signal })
/** Admin / developer: the ON / OFF switch. */
export const noticeSettings = (signal?: AbortSignal) => api<{ enabled: boolean }>(`${NOTICES_ENDPOINT}/settings`, { signal })
export const saveNoticeSettings = (enabled: boolean) => api<{ enabled: boolean }>(`${NOTICES_ENDPOINT}/settings`, { method: 'PUT', body: JSON.stringify({ enabled }) })
