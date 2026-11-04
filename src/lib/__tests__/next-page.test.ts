import { describe, expect, it } from 'vitest'
import { safeNext } from '../../auth/nextPage'

/* The page opened after sign-in (the in-transit mail's link, 2026-11-02): only a path of this app. */

describe('safeNext', () => {
  it('keeps a path of this app with its query', () => {
    expect(safeNext('/planning/intransit-stock?run=12&get=inputs')).toBe('/planning/intransit-stock?run=12&get=inputs')
  })

  it('never another site, the login page itself, or nothing', () => {
    for (const p of ['//evil.example/x', 'https://evil.example', '/\\evil.example', 'planning', '/login', '/login?error=X', '', null, undefined]) {
      expect(safeNext(p)).toBeNull()
    }
  })
})
