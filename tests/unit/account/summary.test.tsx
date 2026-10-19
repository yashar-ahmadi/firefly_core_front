import type { QueryClient } from '@tanstack/react-query'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DashboardGreeting } from '@/features/account/dashboard/greeting'
import { OrderStatusStrip } from '@/features/account/dashboard/order-status-strip'
import { SummaryCards } from '@/features/account/dashboard/summary-cards'
import type { FeatureMap } from '@/features/settings/feature-context'
import { SUMMARY_KEY } from '@/features/account/dashboard/use-summary'
import { ApiError } from '@/lib/api/errors'
import type { UserProfile } from '@/lib/api/types/account'
import type { DashboardSummary } from '@/lib/api/types/dashboard'
import { createQueryClient } from '@/lib/query/query-client'
import { SARA } from '../auth/fixtures'
import { authProviders } from '../support/auth-providers'
import { ok, summary } from './fixtures'

// The dashboard's counters (`dashboard/summary/`): the greeting, the wallet, awaiting-review and
// wishlist cards, and the strip of order groups built from `summary.orders.groups`.

const mocks = vi.hoisted(() => ({
  summary: vi.fn(),
  profile: vi.fn(),
  replace: vi.fn(),
}))
vi.mock('@/lib/api/client', () => ({
  bffFetch: async (path: string) => {
    if (path === 'dashboard/summary/') return ok(await mocks.summary())
    if (path === 'account/profile/me/') return ok(await mocks.profile())
    if (path === 'wallet/withdrawal/list/')
      return ok({ count: 0, next: null, previous: null, results: [] })
    throw new Error(`unexpected ${path}`)
  },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/account/',
  useRouter: () => ({ replace: mocks.replace, push: vi.fn() }),
}))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.summary.mockResolvedValue(summary())
  mocks.profile.mockResolvedValue(SARA)
})

function renderSections(features: Partial<FeatureMap> = {}, client?: QueryClient) {
  const providers = authProviders({ hasSession: true, features, client })
  render(
    <>
      <DashboardGreeting />
      <SummaryCards />
      <OrderStatusStrip />
    </>,
    { wrapper: providers.wrapper },
  )
  return { user: userEvent.setup(), client: providers.client }
}

/** A promise the test settles. */
function deferred<T>() {
  let settle: (value: T) => void = () => {}
  const promise = new Promise<T>((resolve) => (settle = resolve))
  return { promise, settle }
}

const strip = () => screen.getByRole('region', { name: 'سفارش‌های من' })

describe('the order status strip', () => {
  it('shows all five groups in the API’s order, with the API’s labels and counts', async () => {
    renderSections()
    const groups = await within(strip()).findAllByRole('link', { name: /سفارش$/ })
    expect(groups.map((group) => group.getAttribute('href'))).toEqual([
      '/account/orders/?group=awaiting_payment',
      '/account/orders/?group=in_progress',
      '/account/orders/?group=delivered',
      '/account/orders/?group=returned',
      '/account/orders/?group=cancelled',
    ])
    expect(groups.map((group) => group.querySelector('[data-group-label]')?.textContent)).toEqual([
      'در انتظار پرداخت',
      'جاری',
      'تحویل داده شده',
      'مرجوعی',
      'لغو شده',
    ])
    expect(groups[2]).toHaveAccessibleName('تحویل داده شده، ۴ سفارش')
    expect(groups[3]).toHaveAccessibleName('مرجوعی، ۰ سفارش')
    for (const group of groups) expect(group.querySelector('svg')).not.toBeNull()
    expect(within(strip()).getByRole('link', { name: 'همه\u{0654} سفارش‌ها' })).toHaveAttribute(
      'href',
      '/account/orders/',
    )
  })

  it('follows the API: another order, another label, an unknown key still shown', async () => {
    const base = summary()
    const [first, second, ...rest] = base.orders.groups
    const changed: DashboardSummary = {
      ...base,
      orders: {
        ...base.orders,
        groups: [
          { ...second!, label: 'در جریان' },
          first!,
          ...rest,
          { key: 'archived' as never, label: 'بایگانی', statuses: [], count: 3 },
        ],
      },
    }
    mocks.summary.mockResolvedValue(changed)
    renderSections()
    const groups = await within(strip()).findAllByRole('link', { name: /سفارش$/ })
    expect(groups.map((group) => group.textContent)).toEqual([
      expect.stringContaining('در جریان'),
      expect.stringContaining('در انتظار پرداخت'),
      expect.stringContaining('تحویل داده شده'),
      expect.stringContaining('مرجوعی'),
      expect.stringContaining('لغو شده'),
      expect.stringContaining('بایگانی'),
    ])
    expect(groups[5]).toHaveAttribute('href', '/account/orders/?group=archived')
  })

  it('with no order yet: every group at «۰», and a way to start shopping', async () => {
    const empty = summary()
    empty.orders = {
      ...empty.orders,
      total: 0,
      groups: empty.orders.groups.map((group) => ({ ...group, count: 0 })),
    }
    mocks.summary.mockResolvedValue(empty)
    renderSections()
    const groups = await within(strip()).findAllByRole('link', { name: /، ۰ سفارش$/ })
    expect(groups).toHaveLength(5)
    expect(within(strip()).getByText('هنوز سفارشی ثبت نکرده‌اید.')).toBeVisible()
    expect(within(strip()).getByRole('link', { name: 'شروع خرید' })).toHaveAttribute('href', '/')
    expect(within(strip()).queryByRole('link', { name: 'همه\u{0654} سفارش‌ها' })).toBeNull()
  })
})

describe('the summary cards', () => {
  it('show the wallet balance in Toman, the purchases awaiting a review and the wishlist', async () => {
    renderSections()
    const wallet = await screen.findByRole('link', { name: /^کیف پول/ })
    expect(wallet).toHaveAttribute('href', '/account/wallet/')
    expect(wallet).toHaveTextContent('۳٬۰۳۱٬۰۰۰ تومان')
    expect(wallet).not.toHaveTextContent('مسدود')
    const reviews = screen.getByRole('link', { name: /^در انتظار دیدگاه/ })
    expect(reviews).toHaveAttribute('href', '/account/reviews/')
    expect(reviews).toHaveTextContent('۳ کالا')
    const wishlist = screen.getByRole('link', { name: /^علاقه‌مندی‌ها/ })
    expect(wishlist).toHaveAttribute('href', '/account/wishlist/')
    expect(wishlist).toHaveTextContent('۲ کالا')
  })

  it('note a frozen wallet', async () => {
    mocks.summary.mockResolvedValue(summary({ wallet: { balance: 120_000, is_frozen: true } }))
    renderSections()
    const wallet = await screen.findByRole('link', { name: /^کیف پول/ })
    expect(wallet).toHaveTextContent('۱۲۰٬۰۰۰ تومان')
    expect(within(wallet).getByText('کیف پول شما موقتاً مسدود است')).toBeVisible()
  })

  it('say so when nothing waits for a review and the wishlist is empty', async () => {
    mocks.summary.mockResolvedValue(summary({ awaiting_review_count: 0, wishlist_count: 0 }))
    renderSections()
    const reviews = await screen.findByRole('link', { name: /^در انتظار دیدگاه/ })
    expect(reviews).toHaveTextContent('۰ کالا')
    expect(within(reviews).getByText('موردی در انتظار نیست')).toBeVisible()
    const wishlist = screen.getByRole('link', { name: /^علاقه‌مندی‌ها/ })
    expect(within(wishlist).getByText('هنوز خالی است')).toBeVisible()
  })

  it('leave the wallet out while its switch is off and nothing is there', async () => {
    // No balance, no withdrawal on record (the other states: wallet-entry.test.tsx).
    mocks.summary.mockResolvedValue(summary({ wallet: { balance: 0, is_frozen: false } }))
    renderSections({ wallet: { key: 'wallet', name: '', enabled: false, reason: null } })
    expect(await screen.findByRole('link', { name: /^در انتظار دیدگاه/ })).toBeVisible()
    expect(screen.queryByRole('link', { name: /^کیف پول/ })).toBeNull()
  })
})

describe('loading and failing', () => {
  it('shows skeletons in the boxes the data takes, then the data', async () => {
    const answer = deferred<DashboardSummary>()
    const profile = deferred<UserProfile>()
    mocks.summary.mockReturnValue(answer.promise)
    mocks.profile.mockReturnValue(profile.promise)
    renderSections()
    const cards = screen.getByTestId('summary-cards')
    expect(cards).toHaveAttribute('aria-busy', 'true')
    expect(cards.querySelectorAll('[data-card]')).toHaveLength(3)
    expect(within(strip()).getAllByTestId('group-skeleton')).toHaveLength(5)
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(/^سلام$/)

    await act(async () => {
      answer.settle(summary())
      profile.settle(SARA)
    })
    expect(await screen.findByRole('heading', { level: 1, name: 'سلام سارا' })).toBeVisible()
    expect(cards).not.toHaveAttribute('aria-busy')
    expect(cards.querySelectorAll('[data-card]')).toHaveLength(3)
    expect(within(strip()).queryAllByTestId('group-skeleton')).toHaveLength(0)
    expect(within(strip()).getAllByRole('link', { name: /سفارش$/ })).toHaveLength(5)
  })

  it('offers a retry when the summary cannot be read, and shows it once it can', async () => {
    const failure = new ApiError({ status: 500, code: 'server_error' })
    // The usual two retries of a server error, without their delay.
    for (let attempt = 0; attempt < 3; attempt++) mocks.summary.mockRejectedValueOnce(failure)
    const client = createQueryClient()
    client.setQueryDefaults(SUMMARY_KEY, { retryDelay: 0 })
    const { user } = renderSections({}, client)
    const retries = await screen.findAllByRole('button', { name: 'تلاش دوباره' })
    expect(retries).toHaveLength(2)
    expect(screen.getByText('خلاصه\u{0654} حساب بارگذاری نشد.')).toBeVisible()
    await user.click(retries[0]!)
    expect(await screen.findByRole('link', { name: /^کیف پول/ })).toHaveTextContent('۳٬۰۳۱٬۰۰۰')
    expect(screen.queryByRole('button', { name: 'تلاش دوباره' })).toBeNull()
    expect(mocks.summary).toHaveBeenCalledTimes(4)
  })

  it('keeps the cards on screen when a later read of the summary fails', async () => {
    const client = createQueryClient()
    client.setQueryDefaults(SUMMARY_KEY, { retryDelay: 0 })
    renderSections({}, client)
    expect(await screen.findByRole('link', { name: /^کیف پول/ })).toBeVisible()
    mocks.summary.mockRejectedValue(new ApiError({ status: 500, code: 'server_error' }))
    await act(() => client.refetchQueries({ queryKey: SUMMARY_KEY }))
    expect(client.getQueryState(SUMMARY_KEY)?.status).toBe('error')
    // TanStack tells its observers on a timer: let the failed read reach the screen.
    await act(() => new Promise((resolve) => setTimeout(resolve, 50)))
    expect(screen.getByRole('link', { name: /^کیف پول/ })).toHaveTextContent('۳٬۰۳۱٬۰۰۰')
    expect(screen.queryByRole('button', { name: 'تلاش دوباره' })).toBeNull()
  })

  it('greets without a name when the profile has none', async () => {
    mocks.profile.mockResolvedValue({ ...SARA, first_name: '', last_name: '', full_name: '' })
    renderSections()
    expect(await screen.findByRole('heading', { level: 1, name: 'سلام' })).toBeVisible()
  })
})
