/*
 * What people read when something fails (2026-11-26, user: "show users a proper message, not codes and gibberish").
 * Our own backend messages are written for people and are shown as they are; anything technical (HTML pages, stack
 * traces, SQL, codes, JSON, very long text) is replaced by the plain sentence of its kind below. The raw text is kept
 * for Report a problem and the developers' error list, never shown on the page.
 */

export const ERROR_TEXT = {
  NETWORK: "Can't reach the server. Check your internet connection and try again.",
  SIGNED_OUT: 'Your session has ended. Please sign in again.',
  NO_ACCESS: "You don't have access to this. Ask an admin if you need it.",
  NOT_FOUND: "We couldn't find this. It may have been removed or changed. Refresh the page and try again.",
  CONFLICT: 'Someone else changed this at the same time. Refresh the page and try again.',
  TOO_BIG: 'The file is too big. Try a smaller file.',
  TOO_MANY: 'Too many requests at once. Please wait a moment and try again.',
  INVALID: 'Some details are not right. Please check the form and try again.',
  SERVER: 'Something went wrong on our side. Please try again in a minute. If it keeps happening, use Report a problem.',
  BUSY: 'The server is busy or restarting. Please try again in a minute.',
  UNKNOWN: 'Something went wrong. Please try again. If it keeps happening, use Report a problem.',
} as const

/** A failure stored from an outside service (Uniware, Gmail, OCR, robots ...), shown as a short reason. */
export const OUTSIDE_TEXT = {
  REFUSED: (who: string) => `${who} refused access`,
  LOGIN: (who: string) => `${who} sign-in failed`,
  UNREACHABLE: (who: string) => `${who} could not be reached`,
  TIMEOUT: (who: string) => `${who} did not answer in time`,
  BUSY: (who: string) => `${who} is busy (too many requests)`,
  FAILED: (who: string) => `${who} answered with an error`,
} as const

/** Names of the outside services, as people know them. */
export const OUTSIDE_SERVICE = {
  UNIWARE: 'Uniware',
  GMAIL: 'Gmail',
  OCR: 'The PO reader',
  AMAZON: 'Amazon',
  FLIPKART: 'Flipkart',
  MYNTRA: 'Myntra',
  PEPIMS: 'PEPIMS',
} as const

export const ERROR_NOTE = {
  RETRY: 'Try again',
  COPY: 'Copy details',
  COPIED: 'Copied',
  DETAILS: 'Technical details',
} as const

/** Longer than this, a message is not one we wrote for people. */
export const PLAIN_MESSAGE_MAX = 300
