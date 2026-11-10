/*
 * Notices (2026-11-10, user: "I add a person and a message, they get a notification and it stays 2 days; not a chat").
 * Shown in the top-bar bell above Feedback's notifications. POST_FG constants/notices.ts.
 */
export const NOTICES_ENDPOINT = '/notices'
/** Same rhythm as the Feedback bell (the server answers from memory: no DB query per ask). */
export const NOTICES_REFRESH_MS = 30_000
export const NOTICE_TEXT_MAX = 500
/** A new notice pops up under the bell this long. */
export const NOTICE_TOAST_MS = 6_000
/** Closing animations (index.css): the bell panel (pf-bell-out) and the Send / Reply boxes (pf-reveal-out). */
export const NOTICE_BELL_OUT_MS = 160
export const NOTICE_REVEAL_OUT_MS = 180

export const NOTICES_TEXT = {
  SECTION: 'Notices',
  FEEDBACK_SECTION: 'Feedback',
  SEND: 'Send notice',
  SEND_TITLE: 'Send a notice',
  TO: 'To',
  PICK: 'Pick a person…',
  EVERYONE: 'Everyone',
  EVERYONE_SUB: 'all people in POST FG',
  SEARCH: 'Search a name or email…',
  NO_MATCH: 'No one matches',
  LOADING: 'Loading people…',
  CHANGE: 'Pick someone else',
  MESSAGE: 'Message',
  PLACEHOLDER: 'Short note. It shows in their bell for 2 days, then it is gone.',
  LINK_PAGE: 'Add a link to this page',
  SENDING: 'Sending…',
  SENT: 'Sent',
  CANCEL: 'Cancel',
  REPLY: 'Reply',
  REPLY_TO: (name: string) => `Reply to ${name}`,
  REPLY_PLACEHOLDER: 'Your reply (goes to them only)',
  OPEN_LINK: 'Open page',
  YOU_TO: (to: string) => `You → ${to}`,
  FROM_TO_ALL: (from: string) => `${from} → everyone`,
  RE: (quote: string) => `Re: ${quote}`,
  GONE_IN: (h: number) => (h >= 24 ? `gone in ${Math.round(h / 24)} day${Math.round(h / 24) === 1 ? '' : 's'}` : h >= 1 ? `gone in ${h} h` : 'gone soon'),
  COUNT: (n: number, max: number) => `${n} / ${max}`,
  OFF: 'Notices are switched off by the admin.',
  NEW_FROM: (name: string) => `Notice from ${name}`,
  SETTINGS_TITLE: 'Notices in the bell',
  SETTINGS_SUB: 'People send a short notice to one person; admins and developers can also send to everyone. Notices show in the bell and are deleted after 2 days (no history, no read receipts). Replies go to the sender only. OFF hides "Send notice" and the notices for everyone.',
  SAVED: (on: boolean) => `Notices switched ${on ? 'ON' : 'OFF'} for everyone.`,
} as const
