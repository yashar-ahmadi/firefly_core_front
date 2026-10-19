import { describe, expect, it, vi } from 'vitest'
import { sanitizeOperatorHtml } from '@/lib/html/sanitize'

vi.mock('server-only', () => ({}))

// `wideImages` (a content page's `full_width` layout, content digest §3.2): on phones a picture
// keeps its own width and scrolls sideways in its own box. Like a table's, that box is a
// focusable, labelled region, so the keyboard can scroll it too. A picture inside a link is left
// alone: a focusable region inside a link would nest one interactive element in another (the link
// takes the focus, and the content's own box scrolls).

const API = 'https://api.shop.ir/'

function dom(html: string, wideImages = true): HTMLElement {
  const container = document.createElement('div')
  container.innerHTML = sanitizeOperatorHtml(html, API, { wideImages })
  return container
}

const regions = (container: HTMLElement) => [...container.querySelectorAll('[role="region"]')]

describe('sanitizeOperatorHtml: wideImages', () => {
  it('wraps each picture in a focusable, labelled scroll region', () => {
    const container = dom('<p><img src="/media/chart.png" alt="جدول اندازه"></p><img src="/a.png">')
    const wraps = regions(container)
    expect(wraps).toHaveLength(2)
    for (const wrap of wraps) {
      expect(wrap.tagName).toBe('SPAN')
      expect(wrap).toHaveClass('image-wrap')
      expect(wrap).toHaveAttribute('tabindex', '0')
      expect(wrap).toHaveAttribute('aria-label', 'تصویر')
      expect(wrap.children).toHaveLength(1)
      expect(wrap.firstElementChild?.tagName).toBe('IMG')
    }
    // A span is phrasing content: the paragraph holding the picture stays one paragraph.
    expect(container.querySelector('p > .image-wrap > img')).toHaveAttribute(
      'src',
      'https://api.shop.ir/media/chart.png',
    )
  })

  it('leaves a picture inside a link alone, and wraps the one after it', () => {
    const container = dom(
      '<p><a href="/media/big.png"><span><img src="/media/big.png"></span></a><img src="/media/b.png"></p>',
    )
    expect(container.querySelector('a [role="region"]')).toBeNull()
    expect(container.querySelector('a img')).not.toBeNull()
    const [wrap, ...rest] = regions(container)
    expect(rest).toEqual([])
    expect(wrap?.querySelector('img')).toHaveAttribute('src', 'https://api.shop.ir/media/b.png')
  })

  it('wraps only real pictures: no region for an «<img» in text or a dropped picture', () => {
    const container = dom(
      '<p title="<img src=x>">&lt;img src="/a.png"&gt; متن</p><img src="javascript:alert(1)">',
    )
    expect(regions(container)).toEqual([])
    expect(container.querySelector('p')?.textContent).toBe('<img src="/a.png"> متن')
  })

  it('wraps nothing without the option (every other layout and content)', () => {
    expect(regions(dom('<p><img src="/media/a.png"></p>', false))).toEqual([])
  })
})
