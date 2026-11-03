import { describe, expect, it, vi } from 'vitest'

/* 2026-11-03: dev passed 500 processed POs; one call for all of them was refused (the server takes 500 per call) and the
   Check column vanished. getVerifyStates now asks in batches and merges them. */
const calls: string[] = []
vi.mock('../../api/client', () => ({
  api: (url: string) => {
    calls.push(url)
    const ids = decodeURIComponent(url.split('uploadIds=')[1] ?? '').split(',').filter(Boolean)
    return Promise.resolve({ required: ids.includes('450'), items: ids.map((id) => ({ uploadId: id, state: 'to_verify', required: true, by: null, at: null, remark: null })) })
  },
}))

describe('getVerifyStates', () => {
  it('asks for 503 POs in batches of 400, keeps every state, required when any batch says so', async () => {
    const { getVerifyStates } = await import('../../api/poVerify')
    const ids = Array.from({ length: 503 }, (_, i) => String(i + 1))
    const out = await getVerifyStates(ids)
    expect(calls).toHaveLength(2)
    expect(calls.map((c) => decodeURIComponent(c.split('uploadIds=')[1]).split(',').length)).toEqual([400, 103])
    expect(out.items.map((i) => i.uploadId)).toEqual(ids)
    expect(out.required).toBe(true)
  })
})
