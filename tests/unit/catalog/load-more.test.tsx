import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoadMore, type LoadMoreProps } from '@/features/catalog/components/listing/load-more'
import { ApiError } from '@/lib/api/errors'
import type { ProductCard } from '@/lib/api/types/catalog'
import type { Paginated } from '@/lib/api/types/common'
import { clientProviders } from '../support/providers'
import { cardFixture } from './card-fixtures'

const bff = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: bff.fetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(window.location.search),
}))

function card(id: number): ProductCard {
  return cardFixture({ id, slug: `p-${id}`, name: `کالای ${id}` })
}

function listPage(ids: number[], page: number, totalPages = 3): Paginated<ProductCard> {
  return {
    count: 60,
    total_pages: totalPages,
    current_page: page,
    page_size: 24,
    next: null,
    previous: null,
    results: ids.map(card),
  }
}

const PROPS: LoadMoreProps = {
  apiQuery: { category: 'mobile-phone', brand: ['apple'], sort: 'sale' },
  urlQuery: { brand: ['apple'] },
  basePath: '/product-category/digital/mobile-phone/',
  page: 1,
  totalPages: 3,
  initialIds: [1, 2, 3],
  showOutOfStockLabel: true,
}

function renderLoadMore(props: Partial<LoadMoreProps> = {}) {
  const { wrapper } = clientProviders()
  render(<LoadMore {...PROPS} {...props} />, { wrapper })
  return userEvent.setup()
}

let replaceState: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  bff.fetch.mockReset()
  window.history.replaceState(null, '', '/product-category/digital/mobile-phone/?brand=apple')
  replaceState = vi.spyOn(window.history, 'replaceState')
})

afterEach(() => {
  replaceState.mockRestore()
})

describe('LoadMore', () => {
  it('fetches the next page of the same API query through the BFF', async () => {
    bff.fetch.mockResolvedValue({ data: listPage([4, 5], 2), msg: '', status: 200 })
    const user = renderLoadMore()
    await user.click(screen.getByRole('button', { name: 'نمایش بیشتر' }))
    expect(bff.fetch).toHaveBeenCalledExactlyOnceWith('product/list', {
      query: { brand: 'apple', category: 'mobile-phone', page: '2', sort: 'sale' },
      signal: expect.any(AbortSignal),
    })
  })

  it('appends the new cards without repeating any, and focuses the first new one', async () => {
    bff.fetch.mockResolvedValue({ data: listPage([3, 4, 5, 4], 2), msg: '', status: 200 })
    const user = renderLoadMore()
    await user.click(screen.getByRole('button', { name: 'نمایش بیشتر' }))
    const appended = await screen.findByRole('list', { name: 'صفحهٔ ۲' })
    const names = within(appended)
      .getAllByRole('article')
      .map((article) => within(article).getByRole('heading').textContent)
    expect(names).toEqual(['کالای 4', 'کالای 5'])
    await waitFor(() =>
      expect(document.activeElement).toBe(within(appended).getByRole('link', { name: 'کالای 4' })),
    )
  })

  it('records the last page shown in the URL with history.replaceState, keeping the filters', async () => {
    bff.fetch.mockResolvedValue({ data: listPage([4], 2), msg: '', status: 200 })
    const user = renderLoadMore()
    await user.click(screen.getByRole('button', { name: 'نمایش بیشتر' }))
    await screen.findByRole('list', { name: 'صفحهٔ ۲' })
    expect(replaceState).toHaveBeenCalledExactlyOnceWith(
      null,
      '',
      '/product-category/digital/mobile-phone/?brand=apple&page=2',
    )
    // The pager follows: page 2 is current, «next» leads to page 3.
    const pager = screen.getByRole('navigation', { name: 'صفحه‌بندی' })
    expect(within(pager).getByRole('link', { name: 'صفحه بعدی' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/?brand=apple&page=3',
    )
  })

  it('hides the button after the last page', async () => {
    bff.fetch.mockResolvedValue({ data: listPage([4], 3), msg: '', status: 200 })
    const user = renderLoadMore({ page: 2 })
    await user.click(screen.getByRole('button', { name: 'نمایش بیشتر' }))
    await screen.findByRole('list', { name: 'صفحهٔ ۳' })
    expect(screen.queryByRole('button', { name: 'نمایش بیشتر' })).toBeNull()
  })

  it('shows no button and real page links when there is one page left to show', () => {
    renderLoadMore({ page: 3 })
    expect(screen.queryByRole('button', { name: 'نمایش بیشتر' })).toBeNull()
    expect(screen.getByRole('link', { name: 'صفحه قبلی' })).toHaveAttribute(
      'href',
      '/product-category/digital/mobile-phone/?brand=apple&page=2',
    )
  })

  it('keeps the button for another try when the request fails, and leaves the URL alone', async () => {
    bff.fetch.mockRejectedValueOnce(new ApiError({ status: 0, code: 'network_error' }))
    const user = renderLoadMore()
    await user.click(screen.getByRole('button', { name: 'نمایش بیشتر' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('بارگذاری کالاهای بیشتر انجام نشد')
    expect(screen.getByRole('button', { name: 'نمایش بیشتر' })).toBeEnabled()
    expect(replaceState).not.toHaveBeenCalled()
  })
})
