import { describe, expect, it } from 'vitest'
import { oneOf, withParam } from '../urlState'

// The address part of "keep the tab on refresh" (lib/urlState.ts).
describe('withParam', () => {
  it('sets a value and keeps the other parameters', () => {
    expect(withParam('?view=channel', 'tab', 'issues')).toBe('?view=channel&tab=issues')
    expect(withParam('', 'tab', 'review')).toBe('?tab=review')
  })
  it('replaces a value that is there', () => {
    expect(withParam('?tab=review&days=90', 'tab', 'issues')).toBe('?tab=issues&days=90')
  })
  it('removes a parameter (the default) and leaves no lone "?"', () => {
    expect(withParam('?tab=review', 'tab', null)).toBe('')
    expect(withParam('?tab=review&days=90', 'tab', null)).toBe('?days=90')
  })
})

describe('oneOf', () => {
  it('accepts only the listed values (numbers compared as text)', () => {
    const tab = oneOf(['processed', 'review'])
    expect(tab('review')).toBe(true)
    expect(tab('nope')).toBe(false)
    expect(oneOf([7, 30])('30')).toBe(true)
    expect(oneOf([7, 30])('31')).toBe(false)
  })
})
