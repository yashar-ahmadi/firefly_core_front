import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { Highlight, matchRanges } from '@/features/search/highlight'

const ZWJ = '\u{200D}'

/** The highlighted pieces of `text`, ZWJ joiners removed. */
function marked(text: string, query: string): string[] {
  const { container } = render(<Highlight text={text} query={query} />)
  return [...container.querySelectorAll('mark')].map((mark) =>
    (mark.textContent ?? '').replaceAll(ZWJ, ''),
  )
}

function slices(text: string, query: string): string[] {
  return matchRanges(text, query).map(([start, end]) => text.slice(start, end))
}

describe('matchRanges', () => {
  it('finds the query in the text, digits folded both ways', () => {
    expect(slices('شارژر دیواری سامسونگ ۲۵ وات', '25')).toEqual(['۲۵'])
    expect(slices('کابل 25 سانتی', '۲۵')).toEqual(['25'])
  })

  it('reads Arabic letters, case, kashida and ZWNJ like the search does', () => {
    expect(slices('کیف دوشی زنانه', '\u{0643}\u{064A}\u{0641}')).toEqual(['کیف'])
    expect(slices('تبلت سامسونگ گلکسی Tab A9', 'tab a9')).toEqual(['Tab', 'A9'])
    expect(slices('ریمل می\u{200C}بلین', 'میبلین')).toEqual(['می\u{200C}بلین'])
    expect(slices('گـوشی', 'گوشی')).toEqual(['گـوشی'])
  })

  it('marks every word of the query, in any order, every time it appears', () => {
    expect(slices('گوشی موبایل سامسونگ گلکسی A56', 'گلکسی سامسونگ')).toEqual(['سامسونگ', 'گلکسی'])
    expect(slices('سام سام', 'سام')).toEqual(['سام', 'سام'])
  })

  it('merges overlapping matches and finds nothing for an empty query', () => {
    expect(slices('سامسونگ', 'سام امس')).toEqual(['سامس'])
    expect(matchRanges('سامسونگ', '  ')).toEqual([])
    expect(matchRanges('سامسونگ', 'اپل')).toEqual([])
  })
})

describe('Highlight', () => {
  it('wraps the matches in <mark> and keeps every character of the text', () => {
    const text = 'گوشی موبایل سامسونگ گلکسی A56'
    const { container } = render(<Highlight text={text} query="سامسونگ a56" />)
    expect(container.textContent?.replaceAll(ZWJ, '')).toBe(text)
    expect(marked(text, 'سامسونگ a56')).toEqual(['سامسونگ', 'A56'])
  })

  it('renders plain text when nothing matches', () => {
    const { container } = render(<Highlight text="هدفون" query="سام" />)
    expect(container.innerHTML).toBe('هدفون')
  })

  it('keeps joined letters joined across a mark boundary (a ZWJ on both sides)', () => {
    const { container } = render(<Highlight text="سامسونگ" query="سام" />)
    const mark = container.querySelector('mark')!
    // «م» joins the «س» after it: each side keeps its joining form.
    expect(mark.textContent).toBe(`سام${ZWJ}`)
    expect(mark.nextSibling?.textContent).toBe(`${ZWJ}سونگ`)
  })

  it('adds no joiner where the letters do not join (after «ا», «د», «ر», «و»…) or at a space', () => {
    const { container } = render(<Highlight text="سامسونگ" query="سا" />)
    expect(container.textContent).toBe('سامسونگ')
    const words = render(<Highlight text="گوشی سامسونگ" query="سامسونگ" />)
    expect(words.container.textContent).toBe('گوشی سامسونگ')
  })

  it('isolates nothing: the marks carry no direction of their own', () => {
    const { container } = render(<Highlight text="سامسونگ Galaxy A56" query="galaxy" />)
    const mark = container.querySelector('mark')!
    expect(mark).not.toHaveAttribute('dir')
    expect(mark.textContent).toBe('Galaxy')
  })
})
