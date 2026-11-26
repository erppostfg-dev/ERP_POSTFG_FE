import { ERROR_TEXT, OUTSIDE_TEXT, PLAIN_MESSAGE_MAX } from '../constants/errors'

/*
 * One rule for every error a person sees (2026-11-26). The API client cleans each failure with plainMessage();
 * screens use errorText(e) (also lists the field problems a 400 carries). Raw text stays for Report a problem.
 */

// Text that is not written for people: HTML / scripts, stack traces, SQL / driver errors, network codes, JSON,
// "HTTP_502" style codes, a lone CODE_LIKE_THIS, an address of our API.
const TECHNICAL: RegExp[] = [
  /<\s*(!doctype|html|head|body|script|div|span|p|title|h1|pre)\b/i,
  /\n\s+at\s+\S+/, /\bat\s+[\w$.<>]+\s+\(.*:\d+:\d+\)/,
  /\b(ER_[A-Z_]+|SQLSTATE|QueryFailedError|sqlMessage|ECONNREFUSED|ECONNRESET|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|EPIPE|ERR_[A-Z_]+)\b/,
  /\b(SELECT|INSERT|UPDATE|DELETE)\b[\s\S]*\b(FROM|INTO|SET|WHERE)\b/,
  /\b(TypeError|ReferenceError|SyntaxError|RangeError):/, /Cannot read propert(y|ies) of/, /is not a function/, /undefined|\[object Object\]/,
  /^\s*[[{][\s\S]*[\]}]\s*$/,
  // a bare HTTP reason phrase (a proxy's answer, or res.statusText)
  /^(OK|Bad Request|Unauthori[sz]ed|Forbidden|Not Found|Method Not Allowed|Request Time-?out|Conflict|Gone|Payload Too Large|Request Entity Too Large|Unprocessable (Entity|Content)|Too Many Requests|Internal Server Error|Not Implemented|Bad Gateway|Service Unavailable|Gateway Time-?out)$/i, /\bHTTP_\d{3}\b/, /^[A-Z][A-Z0-9]*(_[A-Z0-9]+)+$/, /\/services\/rest\//, /\/api\/v1\//,
]

/** true when the text should not be shown to a person as it is. */
export const isTechnical = (text: string | null | undefined): boolean => {
  const t = (text ?? '').trim()
  if (!t) return true
  if (t.length > PLAIN_MESSAGE_MAX) return true
  return TECHNICAL.some((re) => re.test(t))
}

/** The plain sentence for a failure of this kind (status 0 = no connection). */
export const messageForStatus = (status: number): string => {
  if (status === 0) return ERROR_TEXT.NETWORK
  if (status === 401) return ERROR_TEXT.SIGNED_OUT
  if (status === 403) return ERROR_TEXT.NO_ACCESS
  if (status === 404) return ERROR_TEXT.NOT_FOUND
  if (status === 409) return ERROR_TEXT.CONFLICT
  if (status === 413) return ERROR_TEXT.TOO_BIG
  if (status === 429) return ERROR_TEXT.TOO_MANY
  if (status === 400 || status === 422) return ERROR_TEXT.INVALID
  if (status === 502 || status === 503 || status === 504) return ERROR_TEXT.BUSY
  if (status >= 500) return ERROR_TEXT.SERVER
  return ERROR_TEXT.UNKNOWN
}

/** What a person reads for a failed request: our own message when it is plain, else the sentence of its kind. */
export const plainMessage = (status: number, message: string | null | undefined): string =>
  isTechnical(message) ? messageForStatus(status) : (message ?? '').trim()

interface ErrorLike { status?: unknown; message?: unknown; details?: unknown }

/** Field problems of a 400 ({ field?, message }[]) as one line; empty when there are none or they are technical. */
const detailLines = (details: unknown): string => {
  if (!Array.isArray(details)) return ''
  const lines = details
    .map((d) => (d && typeof d === 'object' && typeof (d as { message?: unknown }).message === 'string' ? (d as { message: string }).message : ''))
    .filter((m) => m && !isTechnical(m))
  return [...new Set(lines)].join(' · ')
}

/** The one line any screen shows for an error (ApiError, Error, string or anything thrown). */
export const errorText = (e: unknown): string => {
  if (e === null || e === undefined) return ERROR_TEXT.UNKNOWN
  if (typeof e === 'string') return isTechnical(e) ? ERROR_TEXT.UNKNOWN : e.trim()
  const x = e as ErrorLike
  const fields = detailLines(x.details)
  if (fields) return fields
  const status = typeof x.status === 'number' ? x.status : -1
  const msg = typeof x.message === 'string' ? x.message : ''
  if (!isTechnical(msg)) return msg.trim()
  return status >= 0 ? messageForStatus(status) : ERROR_TEXT.UNKNOWN
}

// Stored failures of outside services, by what the raw text says.
const OUTSIDE_RULES: [RegExp, (who: string) => string][] = [
  [/\b(401|invalid_grant|unauthori[sz]ed|bad credentials|login|sign[- ]?in)\b/i, OUTSIDE_TEXT.LOGIN],
  [/\b403\b|access denied|forbidden|not authori[sz]ed/i, OUTSIDE_TEXT.REFUSED],
  [/\b429\b|too many requests|throttl|rate limit/i, OUTSIDE_TEXT.BUSY],
  [/timed? ?out|ETIMEDOUT|did not answer/i, OUTSIDE_TEXT.TIMEOUT],
  [/ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|could not be reached|network/i, OUTSIDE_TEXT.UNREACHABLE],
]

/**
 * A failure stored from an outside service (e.g. the Uniware sync's last error), as a short reason for the screen.
 * A plain message we wrote ourselves is kept; a raw answer (HTML page, codes) becomes "Uniware refused access" etc.
 */
export const outsideErrorText = (who: string, raw: string | null | undefined): string => {
  const t = (raw ?? '').trim()
  if (!t) return ''
  if (!isTechnical(t) && !/\b(401|403|429|5\d\d)\b/.test(t)) return t
  for (const [re, text] of OUTSIDE_RULES) if (re.test(t)) return text(who)
  return OUTSIDE_TEXT.FAILED(who)
}
