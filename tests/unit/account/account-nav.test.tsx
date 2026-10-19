import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { AccountNav } from '@/features/account/layout/account-nav'
import { UNREAD_NOTIFICATIONS_KEY } from '@/features/notifications/unread'
import type { FeatureMap } from '@/features/settings/feature-context'
import type { DashboardSummary } from '@/lib/api/types/dashboard'
import { SARA } from '../auth/fixtures'
import { cart, result } from '../cart/support'
import { authProviders } from '../support/auth-providers'
import { ok, summary } from './fixtures'

// The account area's navigation (brief table): the sidebar from lg, the dashboard's hub on
// phones. Badges come from `dashboard/summary/` (`useSummary`), the unread count from the inbox.

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    pathname: '/account/',
    summary: vi.fn(),
    logout: vi.fn(),
    replace,
    router: { replace, push: vi.fn() },
    notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
  }
})
vi.mock('@/lib/api/client', () => ({
  bffFetch: async (path: string) => {
    if (path === 'dashboard/summary/') return ok(await mocks.summary())
    if (path === 'account/auth/logout/') return ok(await mocks.logout())
    if (path === 'account/profile/me/') return ok(SARA)
    return result(cart())
  },
}))
vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => mocks.router,
}))
vi.mock('@/components/ui/toaster', () => ({ toastRegionReady: () => true, notify: mocks.notify }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.pathname = '/account/'
  mocks.summary.mockResolvedValue(summary())
  mocks.logout.mockResolvedValue({})
})

function renderNav(variant: 'sidebar' | 'hub' = 'sidebar', features: Partial<FeatureMap> = {}) {
  const providers = authProviders({ hasSession: true, features })
  render(<AccountNav variant={variant} />, { wrapper: providers.wrapper })
  return { user: userEvent.setup(), client: providers.client }
}

const nav = () => screen.getByRole('navigation', { name: 'حساب کاربری' })
const link = (name: string) => within(nav()).findByRole('link', { name })
const off = (key: 'blog' | 'wallet') => ({ [key]: { key, name: '', enabled: false, reason: null } })

/** The summary, once it has been read and shown. */
async function summaryShown() {
  await link('سفارش‌ها، ۷ سفارش')
}

describe('AccountNav', () => {
  it('lists the account pages in the brief’s order, then «خروج»', async () => {
    renderNav()
    await summaryShown()
    const links = within(nav()).getAllByRole('link')
    expect(links.map((item) => item.getAttribute('href'))).toEqual([
      '/account/',
      '/account/orders/',
      '/account/reviews/',
      '/account/wishlist/',
      '/account/reading-list/',
      '/account/comments/',
      '/account/addresses/',
      '/account/wallet/',
      '/account/notifications/',
      '/account/profile/',
    ])
    expect(links.map((item) => item.querySelector('[data-nav-label]')?.textContent)).toEqual([
      'پیشخوان',
      'سفارش‌ها',
      'در انتظار دیدگاه',
      'علاقه‌مندی‌ها',
      'لیست مطالعه',
      'دیدگاه‌های من',
      'آدرس‌ها',
      'کیف پول',
      'اعلان‌ها',
      'اطلاعات حساب',
    ])
    const logout = within(nav()).getByRole('button', { name: 'خروج' })
    expect(logout.closest('li')).toBe(within(nav()).getAllByRole('listitem').at(-1))
  })

  it('shows the summary’s counts as badges, with words for screen readers (7 orders → «۷»)', async () => {
    renderNav()
    const orders = await link('سفارش‌ها، ۷ سفارش')
    expect(within(orders).getByText('۷')).toHaveAttribute('aria-hidden', 'true')
    expect(within(await link('در انتظار دیدگاه، ۳ کالا')).getByText('۳')).toBeVisible()
    expect(within(await link('علاقه‌مندی‌ها، ۲ کالا')).getByText('۲')).toBeVisible()
    expect(within(await link('لیست مطالعه، ۱ مطلب')).getByText('۱')).toBeVisible()
    expect(within(await link('دیدگاه‌های من، ۵ دیدگاه')).getByText('۵')).toBeVisible()
    // The wallet's badge is its balance, in Toman.
    const wallet = await link('کیف پول، موجودی ۳٬۰۳۱٬۰۰۰ تومان')
    expect(within(wallet).getByText('۳٬۰۳۱٬۰۰۰ تومان')).toHaveAttribute('aria-hidden', 'true')
    // No counter for these (and no unread count before the inbox has counted).
    for (const name of ['پیشخوان', 'آدرس‌ها', 'اعلان‌ها', 'اطلاعات حساب']) {
      expect(await link(name)).toBeVisible()
    }
  })

  it('shows no badge for an empty list, and caps a long one at «۹۹+»', async () => {
    const counts: Partial<DashboardSummary> = { awaiting_review_count: 0, comment_count: 120 }
    mocks.summary.mockResolvedValue(summary(counts))
    renderNav()
    await summaryShown()
    expect(await link('در انتظار دیدگاه')).toBeVisible()
    expect(within(await link('دیدگاه‌های من، ۱۲۰ دیدگاه')).getByText('۹۹+')).toBeVisible()
  })

  it('shows no badge while the summary loads, then the counts in place', async () => {
    let answer: (value: DashboardSummary) => void = () => {}
    mocks.summary.mockReturnValue(new Promise((resolve) => (answer = resolve)))
    renderNav()
    expect(await link('سفارش‌ها')).toBeVisible()
    expect(within(nav()).queryByText('۷')).toBeNull()
    await act(async () => answer(summary()))
    await summaryShown()
  })

  it('shows the unread count on «اعلان‌ها» once the inbox has counted it', async () => {
    const { client } = renderNav()
    await summaryShown()
    act(() => client.setQueryData(UNREAD_NOTIFICATIONS_KEY, 2))
    expect(await link('اعلان‌ها، ۲ اعلان خوانده‌نشده')).toBeVisible()
  })

  it.each([
    ['/account/', 'پیشخوان'],
    ['/account/orders/', 'سفارش‌ها، ۷ سفارش'],
    ['/account/wallet/', 'کیف پول، موجودی ۳٬۰۳۱٬۰۰۰ تومان'],
    ['/account/addresses/', 'آدرس‌ها'],
  ])('marks %s as the current page', async (pathname, name) => {
    mocks.pathname = pathname
    renderNav()
    await summaryShown()
    expect(await link(name)).toHaveAttribute('aria-current', 'page')
    expect(
      within(nav())
        .getAllByRole('link')
        .filter((item) => item.hasAttribute('aria-current')),
    ).toHaveLength(1)
  })

  it.each([
    ['blog', 'لیست مطالعه'],
    // With nothing there (no balance, no withdrawal on record: wallet-entry.test.tsx).
    ['wallet', 'کیف پول'],
  ] as const)('hides its row while the %s switch is off', async (key, label) => {
    mocks.summary.mockResolvedValue(summary({ wallet: { balance: 0, is_frozen: false } }))
    renderNav('sidebar', off(key))
    await summaryShown()
    expect(within(nav()).queryByText(label)).toBeNull()
    expect(within(nav()).getAllByRole('link')).toHaveLength(9)
  })

  it('on the phone’s hub: rows at least 56px tall, each with its icon and a chevron', async () => {
    renderNav('hub')
    await summaryShown()
    const rows = [
      ...within(nav()).getAllByRole('link'),
      within(nav()).getByRole('button', { name: 'خروج' }),
    ]
    // The hub is the dashboard: no row for the page it is on.
    expect(within(nav()).queryByRole('link', { name: 'پیشخوان' })).toBeNull()
    expect(rows).toHaveLength(10)
    for (const row of rows) {
      expect(row.className).toContain('min-h-14')
      expect(row.querySelectorAll('svg').length).toBeGreaterThanOrEqual(1)
    }
    const orders = await link('سفارش‌ها، ۷ سفارش')
    expect(orders.querySelector('[data-chevron]')).not.toBeNull()
  })

  it('in the sidebar: rows of 44px', async () => {
    renderNav('sidebar')
    await summaryShown()
    for (const row of within(nav()).getAllByRole('link'))
      expect(row.className).toContain('min-h-11')
  })

  it('«خروج» logs out, busy while the logout runs, and goes home', async () => {
    let answer: () => void = () => {}
    mocks.logout.mockReturnValue(new Promise<object>((resolve) => (answer = () => resolve({}))))
    const { user } = renderNav('hub')
    await summaryShown()
    const logout = within(nav()).getByRole('button', { name: 'خروج' })
    await user.click(logout)
    await waitFor(() => expect(logout).toHaveAttribute('aria-busy', 'true'))
    // A second press while it runs is the same logout.
    await user.click(logout)
    await act(async () => answer())
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/'))
    expect(mocks.logout).toHaveBeenCalledTimes(1)
    expect(mocks.notify.success).toHaveBeenCalledWith('از حساب خارج شدید')
  })
})
