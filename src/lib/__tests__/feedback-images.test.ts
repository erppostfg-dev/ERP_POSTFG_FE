import { describe, expect, it } from 'vitest'
import { pickImages } from '../feedbackImages'

// Which images a Feedback item keeps before sending (lib/feedbackImages.ts); the server checks again.
const file = (name: string, type: string, bytes = 10) => new File([new Uint8Array(bytes)], name, { type })

describe('pickImages', () => {
  it('keeps images up to the room left and says why others were left out', () => {
    const r = pickImages([file('a.png', 'image/png'), file('b.jpg', 'image/jpeg'), file('c.png', 'image/png')], 2)
    expect(r.ok.map((f) => f.name)).toEqual(['a.png', 'b.jpg'])
    expect(r.note).toBe('At most 2 images')
  })
  it('leaves out files that are not images or bigger than 5 MB', () => {
    expect(pickImages([file('x.pdf', 'application/pdf')], 4)).toEqual({ ok: [], note: 'x.pdf is not an image' })
    expect(pickImages([file('big.png', 'image/png', 5 * 1024 * 1024 + 1)], 4).note).toBe('big.png is bigger than 5 MB')
  })
})
