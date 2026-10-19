import { render, screen, within } from '@testing-library/react'
import type { ComponentProps, ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { SearchResults } from '@/features/search/results/search-results'
import { stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { searchResults } from './fixtures'

// The blog in the search results (content digest §7.1, Plan 5 Task 1): the posts group's
// «مشاهدهٔ همه» goes to the blog's archive of the group's own query (`/blog/?search=…`, never the
// raw input), post rows are prefetched like the others now that the blog exists (pages stay off
// until theirs does), and the group is left out while the blog is switched off.

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

  it('post rows are prefetched as Next decides; content pages are not yet', () => {
    show()
    const post = within(posts()!).getByRole('link', { name: /بهترین گوشی/ })
    expect(post).toHaveAttribute('href', '/blog/best-phones-under-30m/')
    expect(post).toHaveAttribute('data-prefetch', 'auto')
    const pages = screen.getByRole('region', { name: /^صفحه/ })
    expect(within(pages).getByRole('link', { name: /راهنمای خرید گوشی/ })).toHaveAttribute(
      'data-prefetch',
      'false',
    )
  })

  it('leaves the posts out while the blog is switched off', () => {
    show(searchResults(), false)
    expect(posts()).toBeNull()
    expect(screen.getByRole('region', { name: /^برندها/ })).toBeInTheDocument()
  })
})
