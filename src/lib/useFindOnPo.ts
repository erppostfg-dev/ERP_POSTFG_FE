import { useCallback, useRef, useState } from 'react'
import type { ExternalFind } from '../components/FindBox'
import { VERIFY_TEXT } from '../constants/poVerify'
import { copyText } from './clipboard'
import { termsFor, type ValueKind } from './valueTerms'

/*
 * Click a value -> find it on the PO in the file viewer (Verify panel 2026-10-22, In Review panel 2026-11-05): the
 * value's spellings (lib/valueTerms) go to <FileViewer externalFind>, its count comes back through onFindResult and is
 * kept per value, so a value not on the PO stays red. One value may be looked for under several numbers (a line's
 * price as printed before tax OR with tax): any of them found counts. A DOUBLE click copies the value (user 2026-11-05:
 * to paste it into the Masters search).
 */

/** What a value's search found: a count, null = the file cannot be searched, 'pending' = still looking. */
export type Found = number | null | 'pending'

/** The hover text of a value: what its last search found (+ "copied" right after the click). */
export const foundTip = (f: Found | undefined, copied = false): string =>
  (f === 'pending' ? VERIFY_TEXT.SEARCHING : f === 0 ? VERIFY_TEXT.NOT_FOUND : f === null ? VERIFY_TEXT.CANNOT_SEARCH : typeof f === 'number' ? VERIFY_TEXT.FOUND(f) : VERIFY_TEXT.CLICK_HINT)
  + (copied ? VERIFY_TEXT.COPIED : '')

export function useFindOnPo() {
  const [find, setFind] = useState<ExternalFind | undefined>()
  const [active, setActive] = useState<string | null>(null)
  const [found, setFound] = useState<Map<string, Found>>(new Map())
  const [copied, setCopied] = useState<string | null>(null)
  const activeRef = useRef<string | null>(null)
  const seq = useRef(0)
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  /** Copy a value (double click); key = which cell, for the "copied" note. */
  const copy = useCallback((key: string, text: string) => {
    if (!text) return
    void copyText(text).then(() => {
      setCopied(key)
      clearTimeout(copiedTimer.current)
      copiedTimer.current = setTimeout(() => setCopied(null), 2000)
    }, () => undefined)
  }, [])

  /** Look for this value (or any of these values) on the PO; key = which cell asked. */
  const ask = useCallback((key: string, value: unknown, kind: ValueKind) => {
    const values = Array.isArray(value) ? value : [value]
    const terms = [...new Set(values.flatMap((v) => termsFor(v, kind)))]
    if (!terms.length) return
    activeRef.current = key
    setActive(key)
    setFound((m) => new Map(m).set(key, 'pending'))
    setFind({ terms, seq: ++seq.current })
  }, [])

  const onFindResult = useCallback((n: number | null) => {
    const key = activeRef.current
    if (key) setFound((m) => new Map(m).set(key, n))
  }, [])

  return { find, onFindResult, ask, copy, active, found, copied, activeFound: active ? found.get(active) : undefined }
}
