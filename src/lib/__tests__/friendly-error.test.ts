import { describe, expect, it } from 'vitest'
import { ApiError } from '../../api/client'
import { ERROR_TEXT } from '../../constants/errors'
import { errorText, isTechnical, outsideErrorText, plainMessage } from '../friendlyError'

// 2026-11-26 (user): people read a proper sentence, never codes or raw server text.
describe('friendly errors: what a person reads', () => {
  it('keeps our own plain backend messages as they are', () => {
    expect(plainMessage(409, 'This PO is already approved.')).toBe('This PO is already approved.')
    expect(plainMessage(400, 'Remark is required (at least 10 letters).')).toBe('Remark is required (at least 10 letters).')
  })

  it('replaces technical text by the sentence of its kind', () => {
    // the Uniware 403 page the prod sync stored on 26 Nov
    const uniware = '403 from /services/rest/v1/oms/saleorder/get: <script type="text/javascript"> if(window.top !== window.self){ } </script>'
    expect(isTechnical(uniware)).toBe(true)
    expect(plainMessage(502, '<html><body><h1>502 Bad Gateway</h1></body></html>')).toBe(ERROR_TEXT.BUSY)
    expect(plainMessage(502, 'Bad Gateway')).toBe(ERROR_TEXT.BUSY)
    expect(plainMessage(500, "TypeError: Cannot read properties of undefined (reading 'id')")).toBe(ERROR_TEXT.SERVER)
    expect(plainMessage(500, "ER_DUP_ENTRY: Duplicate entry 'x' for key 'uq'")).toBe(ERROR_TEXT.SERVER)
    expect(plainMessage(500, 'connect ECONNREFUSED 10.0.0.1:3306')).toBe(ERROR_TEXT.SERVER)
    expect(plainMessage(404, 'No route GET /api/v1/po-review/xyz')).toBe(ERROR_TEXT.NOT_FOUND)
    expect(plainMessage(429, 'HTTP_429')).toBe(ERROR_TEXT.TOO_MANY)
    expect(plainMessage(403, 'FORBIDDEN_PAGE')).toBe(ERROR_TEXT.NO_ACCESS)
    expect(plainMessage(500, '{"error":"boom"}')).toBe(ERROR_TEXT.SERVER)
    expect(plainMessage(500, 'x'.repeat(400))).toBe(ERROR_TEXT.SERVER)
    expect(plainMessage(503, '')).toBe(ERROR_TEXT.BUSY)
  })

  it('ApiError cleans its own message and keeps the raw text aside', () => {
    const e = new ApiError(502, 'HTTP_502', '<html>502 Bad Gateway</html>')
    expect(e.message).toBe(ERROR_TEXT.BUSY)
    expect(e.rawMessage).toBe('<html>502 Bad Gateway</html>')
    expect(new ApiError(0, 'NETWORK_ERROR', 'Cannot reach the server').message).toBe(ERROR_TEXT.NETWORK)
    expect(new ApiError(409, 'ALREADY_DONE', 'Already approved by Ankit.').message).toBe('Already approved by Ankit.')
  })

  it('errorText: field problems first, then the message; never [object Object] or a stack', () => {
    const fields = new ApiError(400, 'VALIDATION', 'Invalid body', [{ field: 'qty', message: 'Qty must be at least 1' }, { field: 'x', message: 'ER_BAD_FIELD_ERROR' }])
    expect(errorText(fields)).toBe('Qty must be at least 1')
    expect(errorText(new Error('Something we wrote'))).toBe('Something we wrote')
    expect(errorText(new TypeError("Cannot read properties of null (reading 'x')"))).toBe(ERROR_TEXT.UNKNOWN)
    expect(errorText({})).toBe(ERROR_TEXT.UNKNOWN)
    expect(errorText(null)).toBe(ERROR_TEXT.UNKNOWN)
    expect(errorText('[object Object]')).toBe(ERROR_TEXT.UNKNOWN)
  })

  it('outside services: a short reason instead of their raw answer', () => {
    expect(outsideErrorText('Uniware', '403 from /services/rest/v1/oms/saleorder/get: <script>..</script>')).toBe('Uniware refused access')
    expect(outsideErrorText('Uniware', 'Uniware answered 429 (too many requests): the rest next time')).toBe('Uniware is busy (too many requests)')
    expect(outsideErrorText('Myntra', 'connect ETIMEDOUT 1.2.3.4:443')).toBe('Myntra did not answer in time')
    expect(outsideErrorText('Uniware', 'no PO could be read from Uniware')).toBe('no PO could be read from Uniware')
    expect(outsideErrorText('Uniware', '')).toBe('')
  })
})
