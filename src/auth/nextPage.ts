/*
 * The page someone asked for before signing in (2026-11-02: the in-transit mail links to a build's input files): kept
 * in this tab's sessionStorage across the Google sign-in round trip, then opened instead of the home page. Only a path
 * of this app is kept (one leading "/", never "//host"), so a link can never send someone to another site.
 */

const KEY = 'postfg:next'
const LOGIN = /^\/login(\/|\?|$)/

/** A path inside this app (no other origin, not the login page itself), or null. */
export const safeNext = (path: string | null | undefined): string | null =>
  path && path.startsWith('/') && !path.startsWith('//') && !path.includes('\\') && !LOGIN.test(path) ? path : null

export const rememberNext = (path: string): void => {
  const p = safeNext(path)
  if (!p || p === '/') return
  try {
    sessionStorage.setItem(KEY, p)
  } catch {
    // storage blocked: sign-in goes to the home page as before
  }
}

/** The remembered page (forgotten once read), or null. */
export const takeNext = (): string | null => {
  try {
    const p = sessionStorage.getItem(KEY)
    sessionStorage.removeItem(KEY)
    return safeNext(p)
  } catch {
    return null
  }
}
