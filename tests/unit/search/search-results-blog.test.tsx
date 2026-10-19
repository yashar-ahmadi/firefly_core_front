import { render, screen, within } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SearchResults } from '@/features/search/results/search-results'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { searchResults } from './fixtures'

// The blog in the search results (content digest §7.1, Plan 5 Task 1): the posts group's
// «مشاهدهٔ همه» goes to the blog's archive of the group's own query (`/blog/?search=…`, never the
// raw input), post rows are never prefetched (ruling P5-R1: a post's page counts a view on every
// render; a content page counts none: its rows prefetch as usual), and the group is left out
// while the blog is switched off.

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))
vi.mock('@/lib/api/client', () => ({ bffFetch: () => new Promise(() => {}) }))
vi.mock('next/link', () => ({
  default: ({
    prefetch,
    href,
    children,
    ...props
  }: ComponentProps<'a'> & { prefetch?: boolean | null; href: string }) => (
    <a href={href} data-prefetch={prefetch === undefined ? 'auto' : String(prefetch)} {...props}>
      {children as ReactNode}
    </a>
  ),
}))

stubBrowserApis()

function show(results = searchResults(), blogEnabled?: boolean) {
  const { wrapper } = clientProviders()
  render(<SearchResults results={results} showOutOfStockLabel blogEnabled={blogEnabled} />, {
    wrapper,
  })
}

const posts = () => screen.queryByRole('region', { name: /^مطالب وبلاگ/ })

describe('the blog posts in the search results', () => {
  it('«مشاهدهٔ همه» goes to the blog’s archive of the group’s query', () => {
    show()
    const seeAll = within(posts()!).getByRole('link', { name: /^مشاهده\u{0654} همه/u })
    expect(seeAll).toHaveAttribute('href', `/blog/?search=${encodeURIComponent('گوشی')}`)
    expect(seeAll).toHaveAccessibleName('مشاهده\u{0654} همه\u{0654} مطالب وبلاگ')
  })

  it('uses the group’s own query, not the term as typed (ignored words are only stripped there)', () => {
    show(
      searchResults({
        query: 'خرید گوشی',
        blog_posts: { ...searchResults().blog_posts, listing_query: { search: 'گوشی' } },
      }),
    )
    expect(within(posts()!).getByRole('link', { name: /^مشاهده/ })).toHaveAttribute(
      'href',
      `/blog/?search=${encodeURIComponent('گوشی')}`,
    )
  })

  it('offers none when every match is shown, or without a query to list them by', () => {
    const { items } = searchResults().blog_posts
    show(
      searchResults({
        blog_posts: { count: items.length, items, listing_query: { search: 'گوشی' } },
      }),
    )
    expect(within(posts()!).queryByRole('link', { name: /^مشاهده/ })).toBeNull()
  })

  it('post rows are never prefetched (P5-R1)', () => {
    show()
    const post = within(posts()!).getByRole('link', { name: /بهترین گوشی/ })
    expect(post).toHaveAttribute('href', '/blog/best-phones-under-30m/')
    expect(post).toHaveAttribute('data-prefetch', 'false')
  })

  it('content page rows link to their page and prefetch as usual (a page counts no views)', () => {
    const results = searchResults()
    const persian = {
      ...results.pages.items[0]!,
      id: 10004,
      title: 'شرایط ارسال',
      slug: 'شرایط-ارسال',
    }
    show({
      ...results,
      pages: { ...results.pages, count: 2, items: [...results.pages.items, persian] },
    })
    const pages = screen.getByRole('region', { name: /^صفحه/ })
    const guide = within(pages).getByRole('link', { name: /راهنمای خرید گوشی/ })
    expect(guide).toHaveAttribute('href', '/page/phone-guide/')
    expect(guide).toHaveAttribute('data-prefetch', 'auto')
    expect(within(pages).getByRole('link', { name: /شرایط ارسال/ })).toHaveAttribute(
      'href',
      `/page/${encodeURIComponent('شرایط-ارسال')}/`,
    )
  })

  it('leaves the posts out while the blog is switched off', () => {
    show(searchResults(), false)
    expect(posts()).toBeNull()
    expect(screen.getByRole('region', { name: /^برندها/ })).toBeInTheDocument()
  })
})
