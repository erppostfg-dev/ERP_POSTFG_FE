import { describe, expect, it } from 'vitest'
import { isMovedHost } from '../moved'

// 2026-11-26 go-live: "POST_FG has moved" shows ONLY on the test server's address.
describe('isMovedHost', () => {
  it('true on the dev server', () => {
    expect(isMovedHost('dev.erp.mcaffeine.com')).toBe(true)
    expect(isMovedHost('DEV.ERP.MCAFFEINE.COM')).toBe(true)
  })
  it('false on prod, a laptop and anything else', () => {
    expect(isMovedHost('erp.mcaffeine.com')).toBe(false)
    expect(isMovedHost('localhost')).toBe(false)
    expect(isMovedHost('192-168-30-160.nip.io')).toBe(false)
    expect(isMovedHost('')).toBe(false)
  })
})
