import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { BASE_PATH, listPage, renderLoadMore } from './load-more-support'
import { resetNavigation } from './navigation-harness'

const bff = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: bff.fetch }))
vi.mock('next/navigation', async () => (await import('./navigation-harness')).navigationMock)

let replaceState: ReturnType<typeof vi.spyOn>

beforeEach(() => {
  bff.fetch.mockReset()
  resetNavigation()
  window.history.replaceState(null, '', `${BASE_PATH}?brand=apple`)
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
