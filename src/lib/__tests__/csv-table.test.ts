import 'fake-indexeddb/auto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { pageOf, parseTable } from '../csvTableCore'

/*
 * The table viewer worked out in the browser (user, 2026-10-27): the whole file read once, kept by its ETag, paged and
 * searched here. `npm test`.
 */

const CSV = '﻿SKU,Name,Qty\r\nA1,"Face Wash, 100g",3\r\n\r\nB2,Coffee Scrub,5\r\nC3,face serum,7\r\n'

describe('table pages and search', () => {
  it('skips blank lines and pages the rows', () => {
    const t = parseTable(CSV)
    expect(t.header).toEqual(['SKU', 'Name', 'Qty'])
    expect(t.body).toHaveLength(3)
    expect(pageOf(t, 1, 1, '')).toEqual({ rows: [['B2', 'Coffee Scrub', '5']], total: 3 })
  })

  it('searches every column, any case', () => {
    expect(pageOf(parseTable(CSV), 0, 10, 'FACE')).toEqual({ rows: [['A1', 'Face Wash, 100g', '3'], ['C3', 'face serum', '7']], total: 2 })
  })
})

describe('tablePage', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    vi.resetModules()
  })

  it('downloads once, then reads this browser\'s copy when the server answers 304', async () => {
    const calls: (string | null)[] = []
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init: RequestInit) => {
      const sent = (init.headers as Record<string, string>)['If-None-Match'] ?? null
      calls.push(sent)
      if (sent === '"v1"') return new Response(null, { status: 304 })
      return new Response(new TextEncoder().encode(CSV), { status: 200, headers: { ETag: '"v1"', 'X-File-Size': '99', 'Last-Modified': 'Tue, 27 Oct 2026 10:00:00 GMT' } })
    }))
    const target = { kind: 'sheet' as const, runId: '7', name: 'Sheet35(2)' }

    const first = await (await import('../csvTable')).tablePage(target, { offset: 0, limit: 2, q: '' })
    expect(first).toMatchObject({ columns: ['SKU', 'Name', 'Qty'], totalRows: 3, total: 3, size: 99 })
    expect(first.rows).toHaveLength(2)

    // a new visit (fresh module state): the server is only asked whether the file changed
    vi.resetModules()
    const again = await (await import('../csvTable')).tablePage(target, { offset: 0, limit: 10, q: 'scrub' })
    expect(again.rows).toEqual([['B2', 'Coffee Scrub', '5']])
    expect(again.size).toBe(99)
    expect(calls).toEqual([null, '"v1"'])
  })
})
