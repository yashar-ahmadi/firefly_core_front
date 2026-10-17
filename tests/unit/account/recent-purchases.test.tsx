import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PURCHASES_KEY, RecentPurchases } from '@/features/account/dashboard/recent-purchases'
import { ApiError } from '@/lib/api/errors'
import { createQueryClient } from '@/lib/query/query-client'
import { clientProviders } from '../support/providers'
import { ok, page, PURCHASES } from './fixtures'

// «آخرین خریدها»: the four latest purchases (`dashboard/purchased-product/list/?limit=4`) as
// mini cards: picture, name (a link to the product) and the date of the newest purchase.

const mocks = vi.hoisted(() => ({ purchased: vi.fn(), replace: vi.fn() }))
vi.mock('@/lib/api/client', () => ({
  bffFetch: async (path: string, init: unknown) => {
    if (path === 'dashboard/purchased-product/list/') return ok(await mocks.purchased(init))
    throw new Error(`unexpected ${path}`)
  },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/account/',
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.purchased.mockResolvedValue(page(PURCHASES, 7))
})

function renderPurchases() {
  const client = createQueryClient()
  client.setQueryDefaults(PURCHASES_KEY, { retryDelay: 0 })
  const providers = clientProviders({ hasSession: true, client })
  render(<RecentPurchases />, { wrapper: providers.wrapper })
  return { user: userEvent.setup() }
}

const section = () => screen.getByRole('region', { name: 'آخرین خریدها' })

describe('RecentPurchases', () => {
  it('asks for the four latest purchases and shows each as a mini card', async () => {
    renderPurchases()
    const cards = await within(section()).findAllByRole('article')
    expect(mocks.purchased).toHaveBeenCalledWith(expect.objectContaining({ query: { limit: 4 } }))
    expect(cards).toHaveLength(4)
    const first = cards[0]!
    const name = within(first).getByRole('link', { name: 'پاوربانک انکر ۲۰۰۰۰ میلی آمپرساعت' })
    expect(name).toHaveAttribute('href', '/product/anker-powerbank-20000/')
    expect(within(first).getByRole('heading', { level: 3 })).toHaveAttribute('dir', 'auto')
    expect(first.querySelector('img')).toHaveAttribute('alt', '')
    expect(first).toHaveTextContent('آخرین خرید ۱۸ شهریور ۱۴۰۵')
    expect(first.querySelector('time')).toHaveAttribute('datetime', '2026-09-09T15:00:00+03:30')
    expect(cards[3]).toHaveTextContent('آخرین خرید ۲۸ مرداد ۱۴۰۵')
    // Mini cards: no card buttons (heart, compare, add to cart) on the dashboard.
    expect(within(section()).queryAllByRole('button')).toEqual([])
  })

  it('shows four card skeletons of the same box while the list loads', async () => {
    let answer: (value: unknown) => void = () => {}
    mocks.purchased.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    renderPurchases()
    const list = within(section()).getByRole('list')
    expect(list).toHaveAttribute('aria-busy', 'true')
    const skeletons = within(list).getAllByTestId('purchase-skeleton')
    expect(skeletons).toHaveLength(4)
    await act(async () => answer(page(PURCHASES, 7)))
    expect(await within(section()).findAllByRole('article')).toHaveLength(4)
    // The same list element and card box: nothing is re-laid out when the cards arrive.
    expect(within(section()).getByRole('list')).toBe(list)
    expect(within(list).getAllByRole('article')[0]!.className).toContain(skeletons[0]!.className)
  })

  it('without a purchase yet: says so and offers a way to start shopping', async () => {
    mocks.purchased.mockResolvedValue(page([]))
    renderPurchases()
    expect(await within(section()).findByText('هنوز خریدی نکرده‌اید')).toBeVisible()
    expect(within(section()).getByRole('link', { name: 'شروع خرید' })).toHaveAttribute('href', '/')
  })

  it('offers a retry when the list cannot be read', async () => {
    const failure = new ApiError({ status: 503, code: 'server_error' })
    for (let attempt = 0; attempt < 3; attempt++) mocks.purchased.mockRejectedValueOnce(failure)
    const { user } = renderPurchases()
    await user.click(await within(section()).findByRole('button', { name: 'تلاش دوباره' }))
    expect(await within(section()).findAllByRole('article')).toHaveLength(4)
  })
})
