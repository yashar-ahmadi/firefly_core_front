import { act, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostToc } from '@/features/blog/components/post-toc'
import type { ContentHeading } from '@/lib/api/types/blog-post'
import { stubBrowserApis } from '../support/dom-stubs'
import { LayoutIntersectionObserver, placeAt, relayout } from '../support/layout-intersection'

// The table of contents marks the section being read (`aria-current`) after any way of moving
// through the post: a scroll passes each heading across the reading line, but a jump (End, Home,
// a scrollbar drag, an instant scroll) moves them from one side of it to the other at once, past
// the viewport's edge. The observer's geometry is simulated: it calls back only for a heading
// whose side of its band changed, as a browser does.

stubBrowserApis()

const HEADINGS: ContentHeading[] = [
  { text: 'مقدمه', id: 'intro', level: 2, number: '1' },
  { text: 'باتری', id: 'battery', level: 2, number: '2' },
  { text: 'دوربین', id: 'camera', level: 2, number: '3' },
]

/** Each heading's top while the page is at its top; `offset` is how far it has been scrolled. */
const TOPS: Record<string, number> = { intro: 400, battery: 1600, camera: 2800 }
let offset = 0

function mountHeadings() {
  const article = document.createElement('article')
  for (const { id, text } of HEADINGS) {
    const heading = document.createElement('h2')
    heading.id = id
    heading.textContent = text
    placeAt(heading, () => TOPS[id]! - offset)
    article.append(heading)
  }
  document.body.append(article)
}

/** Moves the page at once (no heading crosses the viewport on the way): a jump. */
function jumpTo(scrollY: number) {
  offset = scrollY
  act(() => relayout())
}

const current = () =>
  screen
    .queryAllByRole('link')
    .filter((link) => link.getAttribute('aria-current') === 'true')
    .map((link) => link.getAttribute('href'))

beforeEach(() => {
  offset = 0
  vi.stubGlobal('IntersectionObserver', LayoutIntersectionObserver)
})

afterEach(() => {
  document.querySelectorAll('article').forEach((node) => node.remove())
  vi.unstubAllGlobals()
  stubBrowserApis()
})

describe('PostToc: the section being read after a jump', () => {
  it('nothing is marked before the first heading reaches the reading line', () => {
    mountHeadings()
    render(<PostToc headings={HEADINGS} />)
    expect(current()).toEqual([])
  })

  it('End (a jump past every heading) marks the last section', () => {
    mountHeadings()
    render(<PostToc headings={HEADINGS} />)
    jumpTo(5000)
    expect(current()).toEqual(['#camera'])
  })

  it('a scrollbar drag into the middle, then Home: the middle section, then none', () => {
    mountHeadings()
    render(<PostToc headings={HEADINGS} />)
    // Both first headings end above the viewport: neither crossed into view on the way.
    jumpTo(2000)
    expect(current()).toEqual(['#battery'])
    jumpTo(0)
    expect(current()).toEqual([])
  })
})
