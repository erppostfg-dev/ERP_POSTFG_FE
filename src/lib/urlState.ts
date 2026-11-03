import { useCallback, useEffect, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'

/*
 * A page's tab (or view) kept in the address (2026-10-29, user: "when I refresh on PO issues it goes back to
 * Processed"): /operations/po-review?tab=issues survives a refresh and can be shared as a link.
 * Pages stay mounted when hidden (App.tsx), so the hook also remembers the value itself: only the page that is on
 * screen (`path`) reads or writes the address, and coming back to a page through the sidebar (no ?tab=) puts its
 * remembered value back in the address. The default value is left out of the address. Writes replace the history
 * entry, so Back leaves the page instead of stepping through its tabs.
 */

/** The query string with `key` set to `value` (null = removed), '' when nothing is left. */
export const withParam = (search: string, key: string, value: string | null): string => {
  const p = new URLSearchParams(search)
  if (value === null) p.delete(key)
  else p.set(key, value)
  const s = p.toString()
  return s ? `?${s}` : ''
}

/**
 * [value, setValue] for one query parameter of the page at `path`. `isValid` checks a value from the address (an
 * unknown one shows `fallback`); it may change between renders (e.g. once the teams are loaded).
 */
export function useUrlParam<T extends string>(path: string, key: string, isValid: (v: string) => boolean, fallback: T): [T, (v: T) => void] {
  const { pathname, search } = useLocation()
  const navigate = useNavigate()
  const here = pathname === path
  const inUrl = here ? new URLSearchParams(search).get(key) : null
  const [remembered, setRemembered] = useState<string>(inUrl ?? fallback)

  // Write against the address as it is NOW (window.location), not this render's copy: several of these hooks on one
  // page may write in the same moment and must not undo each other.
  const write = useCallback((value: string) => {
    const next = withParam(window.location.search, key, value === fallback ? null : value)
    if (next !== window.location.search) void navigate({ pathname: path, search: next }, { replace: true })
  }, [key, fallback, navigate, path])

  // The address CHANGED on this page (a link, Back / Forward): it wins. Only on a change: the router updates the
  // address a moment after a click (in a transition), and comparing "differs" in that gap undid the click (Processed,
  // the default, could never be picked again: user 2026-10-29).
  const lastInUrl = useRef(inUrl)
  useEffect(() => {
    if (inUrl === lastInUrl.current) return
    lastInUrl.current = inUrl
    if (here && inUrl !== null) setRemembered(inUrl)
  }, [here, inUrl])
  // Back on this page without the parameter (sidebar): put the remembered value back in the address.
  useEffect(() => { if (here && inUrl === null && remembered !== fallback) write(remembered) }, [here, inUrl, remembered, fallback, write])

  const raw = remembered
  const value = (isValid(raw) ? raw : fallback) as T
  const setValue = useCallback((v: T) => {
    setRemembered(v)
    write(v)
  }, [write])
  return [value, setValue]
}

/** isValid for a fixed list of values. */
export const oneOf = (values: readonly (string | number)[]) => (v: string) => values.map(String).includes(v)
