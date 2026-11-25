import { describe, expect, it } from 'vitest'
import { inUniwareOf, outsideFilterDef } from '../uniwareOutside'

describe('uniware outside (2026-11-25)', () => {
  it('a row with a finding filters as Yes, without as No', () => {
    expect(inUniwareOf({ id: '1', code: 'sf_1', channel: 'BLINKIT_B2B', status: 'PROCESSING', createdAt: null, firstSeenAt: '2026-11-25T10:00:00Z', kind: 'review', actions: ['reject', 'dismiss'], more: 0 })).toBe('Yes')
    expect(inUniwareOf(null)).toBe('No')
    expect(inUniwareOf(undefined)).toBe('No')
    expect(outsideFilterDef.options).toEqual(['Yes', 'No'])
  })
})
