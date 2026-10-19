import { act, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PostToc } from '@/features/blog/components/post-toc'
import { tocEntries } from '@/features/blog/post-toc-entries'
import { sanitizeOperatorHtml } from '@/lib/html/sanitize'
import { stubBrowserApis } from '../support/dom-stubs'
import { FakeIntersectionObserver, intersect, resetIntersections } from '../support/intersection'
import { postDetailFixture } from './post-fixtures'

vi.mock('server-only', () => ({}))

// The post's table of contents (blog digest §1.5): built from the API's `headings`, whose ids are
// the ones on the content's headings; `#` + the id encoded, the heading found with
// getElementById (Persian ids, ids starting with a digit: never a CSS selector).

stubBrowserApis()
vi.stubGlobal('IntersectionObserver', FakeIntersectionObserver)

const post = postDetailFixture()
const H2 = 'چرا-بودجه-۳۰-میلیونی'
const H3 = 'باتری'

/** The post's content as the page renders it (the API's heading ids kept), in the document. */
function mountContent() {
  const article = document.createElement('article')
  article.innerHTML = sanitizeOperatorHtml(post.content!, 'https://api.shop.ir', {
    headingIds: new Set(post.headings.map((heading) => heading.id)),
  })
  document.body.append(article)
  return article
}

beforeEach(() => resetIntersections())
afterEach(() => document.querySelectorAll('article').forEach((node) => node.remove()))

describe('tocEntries', () => {
  it('extracts the h2 and h3 headings of the fixture, with ids its content carries', () => {
    const entries = tocEntries(post.headings)
    expect(entries).toEqual([
      { id: H2, text: 'چرا بودجه ۳۰ میلیونی؟', number: '1', depth: 0 },
      { id: 'معیارهای-انتخاب-ما', text: 'معیارهای انتخاب ما', number: '2', depth: 0 },
      { id: H3, text: 'باتری', number: '2-1', depth: 1 },
    ])
    mountContent()
    for (const entry of entries) {
      expect(document.getElementById(entry.id)?.tagName, entry.id).toMatch(/^H[23]$/)
    }
  })

  it('leaves out h4 to h6, an empty id, and a repeated id (it would jump to the first)', () => {
    const entries = tocEntries([
      { text: 'مقدمه', id: 'intro', level: 1, number: '1' },
      { text: 'جزئیات', id: 'detail', level: 4, number: '1-1-1-1' },
      { text: '؟!', id: '', level: 2, number: '1-1' },
      { text: 'نکته', id: 'note', level: 2, number: '1-2' },
      { text: 'نکته', id: 'note', level: 3, number: '1-2-1' },
    ])
    // An h1 in the content is shown as an h2 (the page has its own h1): the top level.
    expect(entries.map(({ id, depth }) => [id, depth])).toEqual([
      ['intro', 0],
      ['note', 0],
    ])
  })
})

describe('PostToc', () => {
  it('is a labelled nav of `#`-encoded links, numbered as the API numbers them', () => {
    render(<PostToc headings={post.headings} />)
    const nav = screen.getByRole('navigation', { name: 'فهرست مطالب' })
    const links = within(nav).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      `#${encodeURIComponent(H2)}`,
      `#${encodeURIComponent('معیارهای-انتخاب-ما')}`,
      `#${encodeURIComponent(H3)}`,
    ])
    expect(links[2]).toHaveTextContent('۲-۱')
    expect(links[2]).toHaveTextContent('باتری')
  })

  it('needs two entries at least', () => {
    const { container } = render(<PostToc headings={post.headings.slice(0, 1)} />)
    expect(container).toBeEmptyDOMElement()
  })

  it('folds on phones behind a button that says whether it is open', async () => {
    render(<PostToc headings={post.headings} />)
    const toggle = screen.getByRole('button', { name: 'فهرست مطالب' })
    const list = document.getElementById(toggle.getAttribute('aria-controls')!)!
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    expect(list).toHaveClass('max-lg:hidden')
    await userEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(list).not.toHaveClass('max-lg:hidden')
  })

  it('a press scrolls to the heading found by its id, focuses it and puts the hash in the URL', async () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => {})
    mountContent()
    render(<PostToc headings={post.headings} />)
    await userEvent.click(screen.getByRole('link', { name: /باتری/ }))
    const heading = document.getElementById(H3)!
    expect(scrollTo).toHaveBeenCalledOnce()
    expect(heading).toHaveFocus()
    expect(heading).toHaveAttribute('tabindex', '-1')
    expect(window.location.hash).toBe(`#${encodeURIComponent(H3)}`)
    scrollTo.mockRestore()
  })

  it('marks the section being read: the last heading above the reading line', () => {
    const article = mountContent()
    render(<PostToc headings={post.headings} />)
    const tops: Record<string, number> = { [H2]: -400, 'معیارهای-انتخاب-ما': 120, [H3]: 900 }
    for (const heading of article.querySelectorAll<HTMLElement>('h2, h3')) {
      heading.getBoundingClientRect = () => ({ top: tops[heading.id] ?? 0 }) as DOMRect
    }
    act(() => intersect())
    const current = screen.getByRole('link', { current: true })
    expect(current).toHaveAccessibleName(/معیارهای انتخاب ما/)
    expect(
      screen.getAllByRole('link').filter((link) => link.hasAttribute('aria-current')),
    ).toHaveLength(1)
  })
})
