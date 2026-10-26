import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { inventoryFromSheet35, parseCsv } from '../sheet35'
import { cachedKeys, getCached, putCached, resetCacheForTests } from '../snapshotCache'

/*
 * Inventory Calculation from the Daily Snapshot (user, 2026-10-26): Sheet35(2) worked out in the browser, and the
 * browser's cache of the snapshot files (fake-indexeddb). `npm test`.
 */

const HEADER = 'Split2 SKU,SKU Name,Final Location,Channel Name,Channel type,Stock Type,Consider?,Final Units,Found in Sheet35 Master'
const csv = (...rows: string[]) => `﻿${[HEADER, ...rows].join('\r\n')}\r\n`

describe('Sheet35(2) -> inventory lines', () => {
  it('parses quoted CSV', () => {
    expect(parseCsv('a,"b, ""c"""\r\n1,2\n')).toEqual([['a', 'b, "c"'], ['1', '2']])
  })

  it('puts SOH and in-transit side by side per SKU x channel x type x location', () => {
    const { lines, hidden } = inventoryFromSheet35(csv(
      'SKU1,Face Wash,Mumbai,Amazon,B2C,SOH,Yes,10,Yes',
      'SKU1,Face Wash,Mumbai,Amazon,B2C,Intransit,Yes,4,Yes',
      'SKU1,Face Wash,Mumbai,Amazon,B2C,SOH,Yes,2.5,Yes',
      'SKU1,Face Wash,Gurgaon,Amazon,B2C,Intransit,Yes,3,Yes',
    ))
    expect(hidden).toBe(0)
    expect(lines.map((l) => [l.sku, l.location, l.soh, l.inTransit, l.available])).toEqual([
      ['SKU1', 'Mumbai', 12.5, 4, 16.5],
      ['SKU1', 'Gurgaon', 0, 3, 3],
    ])
  })

  it('hides Consider? = No, tags SKUs not in the master, drops empty lines', () => {
    const { lines, hidden } = inventoryFromSheet35(csv(
      'SKU1,A,Mumbai,D2C,D2C,SOH,No,50,Yes',
      'SKU2,,Mumbai,D2C,D2C,SOH,Yes,5,No',
      'SKU3,C,Mumbai,D2C,D2C,SOH,Yes,0,Yes',
    ))
    expect(hidden).toBe(1)
    expect(lines).toHaveLength(1)
    expect(lines[0]).toMatchObject({ sku: 'SKU2', notInMaster: true, soh: 5 })
  })

  it('says which column is missing', () => {
    expect(() => inventoryFromSheet35('SKU Code,Final Units\r\nx,1\r\n')).toThrow(/Split2 SKU/)
  })
})

describe('browser cache', () => {
  beforeEach(() => {
    // a fresh IndexedDB for each test
    globalThis.indexedDB = new IDBFactory()
    resetCacheForTests()
  })

  it('keeps a file by its S3 key with its ETag', async () => {
    expect(await getCached('k1')).toBeNull()
    await putCached('k1', 'e1', 'a,b\n')
    expect(await getCached('k1')).toEqual({ etag: 'e1', text: 'a,b\n' })
  })

  it('drops the least recently used past 18 files', async () => {
    for (let i = 0; i < 20; i++) {
      await putCached(`k${i}`, 'e', 'x')
      await new Promise((r) => setTimeout(r, 2))
    }
    const keys = await cachedKeys()
    expect(keys).toHaveLength(18)
    expect(keys).not.toContain('k0')
    expect(keys).not.toContain('k1')
  })
})

describe('snapshot download', () => {
  beforeEach(() => {
    globalThis.indexedDB = new IDBFactory()
    resetCacheForTests()
    vi.resetModules()
  })

  it('reads a current cached file without the network, and revalidates a stale one with If-None-Match', async () => {
    const getSnapshotFile = vi.fn()
    vi.doMock('../../api/intransit', () => ({ getSnapshot: vi.fn(), getSnapshotFile }))
    const { snapshotText } = await import('../../pages/dp/useInventorySnapshot')
    getSnapshotFile.mockResolvedValueOnce({ text: 'first', etag: 'e1' })
    expect(await snapshotText('key', 'e1')).toBe('first')
    expect(getSnapshotFile).toHaveBeenCalledTimes(1)
    // second visit: same ETag -> no request
    expect(await snapshotText('key', 'e1')).toBe('first')
    expect(getSnapshotFile).toHaveBeenCalledTimes(1)
    // the manifest names another ETag: asked with the cached one; 304 -> the cached text
    getSnapshotFile.mockResolvedValueOnce('not-modified')
    expect(await snapshotText('key', 'e2')).toBe('first')
    expect(getSnapshotFile).toHaveBeenLastCalledWith('key', 'e1', undefined)
  })
})
