import { describe, expect, it } from 'vitest'
import { readingMinutes } from '@/features/blog/reading-time'

// A post's reading time (the API gives none): its words ÷ 200, rounded up, at least a minute.

const words = (count: number) => `<p>${Array.from({ length: count }, () => 'واژه').join(' ')}</p>`

describe('readingMinutes', () => {
  it.each([
    [0, 1],
    [1, 1],
    [200, 1],
    [201, 2],
    [1000, 5],
  ])('%i words: %i minute(s)', (count, minutes) => {
    expect(readingMinutes(words(count))).toBe(minutes)
  })

  it('counts the text only: tags, entities and spacing are no words', () => {
    const html = `<h2 id="x">عنوان</h2>\n<p>یک&nbsp;دو <strong>سه</strong></p><img src="/a.jpg" alt="تصویر">`
    expect(readingMinutes(html.repeat(50))).toBe(1)
    expect(readingMinutes(html.repeat(51))).toBe(2)
  })

  it('no content is a minute', () => {
    expect(readingMinutes(null)).toBe(1)
    expect(readingMinutes('')).toBe(1)
  })
})
