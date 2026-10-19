import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SummaryCards } from '@/features/account/dashboard/summary-cards'
import { AccountNav } from '@/features/account/layout/account-nav'
import { walletEntry } from '@/features/account/layout/wallet-entry'
import type { FeatureMap } from '@/features/settings/feature-context'
import { SARA } from '../auth/fixtures'
import { cart, result } from '../cart/support'
import { authProviders } from '../support/auth-providers'
import { ok, summary } from './fixtures'

// The way to the wallet page while the `wallet` switch is off (Plan 4 final fix wave; rulings
// 144 and 149): the account's nav row and the dashboard's card stay whenever the visitor has
// something there (a balance, a withdrawal on record: held money, its «لغو درخواست»), worded for
// viewing; with nothing there both go, as before. The summary's balance says it without a request;
// only a zero balance asks for one row of the withdrawal record (the wallet page's own read, shared
// by the nav and the card).

const mocks = vi.hoisted(() => ({ summary: vi.fn(), records: vi.fn() }))
vi.mock('@/lib/api/client', () => ({
  bffFetch: vi.fn(async (path: string) => {
    if (path === 'dashboard/summary/') return ok(await mocks.summary())
    if (path === 'wallet/withdrawal/list/') return ok(await mocks.records())
    if (path === 'account/profile/me/') return ok(SARA)
    return result(cart())
  }),
}))
vi.mock('next/navigation', () => ({
  usePathname: () => '/account/',
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}))

const page = (count: number) => ({ count, next: null, previous: null, results: [] })
const OFF: Partial<FeatureMap> = {
  wallet: { key: 'wallet', name: '', enabled: false, reason: null },
}

beforeEach(() => {
  vi.clearAllMocks()
  mocks.summary.mockResolvedValue(summary())
  mocks.records.mockResolvedValue(page(0))
})

async function renderAccount(features: Partial<FeatureMap> = {}) {
  const { bffFetch } = await import('@/lib/api/client')
  const providers = authProviders({ hasSession: true, features })
  render(
    <>
      <AccountNav variant="sidebar" />
      <SummaryCards />
    </>,
    { wrapper: providers.wrapper },
  )
  // The summary is in once the orders' badge shows.
  await within(nav()).findByRole('link', { name: 'سفارش‌ها، ۷ سفارش' })
  const recordReads = () =>
    vi.mocked(bffFetch).mock.calls.filter(([path]) => path === 'wallet/withdrawal/list/').length
  return { recordReads }
}

const nav = () => screen.getByRole('navigation', { name: 'حساب کاربری' })
const navRow = () => within(nav()).queryByRole('link', { name: /^کیف پول/ })
const card = () => screen.getByTestId('summary-cards').querySelector('a[href="/account/wallet/"]')

describe('walletEntry', () => {
  it.each([
    [{ on: true, balance: 0, hasRecord: undefined }, 'open'],
    [{ on: false, balance: 120_000, hasRecord: undefined }, 'view'],
    [{ on: false, balance: 0, hasRecord: true }, 'view'],
    [{ on: false, balance: 0, hasRecord: false }, 'none'],
    // Not known yet (the summary, or the record's one row): not shown until it is.
    [{ on: false, balance: undefined, hasRecord: undefined }, 'none'],
    [{ on: false, balance: 0, hasRecord: undefined }, 'none'],
  ] as const)('%o → %s', (input, entry) => {
    expect(walletEntry(input)).toBe(entry)
  })
})

describe('the wallet’s nav row and dashboard card', () => {
  it('the switch on: the row with its balance, the card «قابل استفاده در خرید»; no record read', async () => {
    const { recordReads } = await renderAccount()
    expect(navRow()).toHaveAccessibleName('کیف پول، موجودی ۳٬۰۳۱٬۰۰۰ تومان')
    expect(await screen.findByText('قابل استفاده در خرید')).toBeVisible()
    expect(recordReads()).toBe(0)
  })

  it('the switch off, a balance: both kept, worded for viewing; no record read', async () => {
    const { recordReads } = await renderAccount(OFF)
    expect(navRow()).toHaveAccessibleName('کیف پول، موجودی ۳٬۰۳۱٬۰۰۰ تومان، فقط برای مشاهده')
    await waitFor(() => expect(card()).not.toBeNull())
    expect(card()).toHaveTextContent('۳٬۰۳۱٬۰۰۰')
    expect(card()).toHaveTextContent('غیرفعال است؛ فقط برای مشاهده')
    expect(card()).not.toHaveTextContent('قابل استفاده در خرید')
    expect(document.body).not.toHaveTextContent('افزایش موجودی')
    expect(recordReads()).toBe(0)
  })

  it('the switch off, no balance but a withdrawal on record: both kept; one read for both', async () => {
    mocks.summary.mockResolvedValue(summary({ wallet: { balance: 0, is_frozen: false } }))
    mocks.records.mockResolvedValue(page(1))
    const { recordReads } = await renderAccount(OFF)
    await waitFor(() => expect(navRow()).not.toBeNull())
    expect(navRow()).toHaveAccessibleName('کیف پول، موجودی ۰ تومان، فقط برای مشاهده')
    await waitFor(() => expect(card()).not.toBeNull())
    expect(card()).toHaveTextContent('غیرفعال است؛ فقط برای مشاهده')
    expect(recordReads()).toBe(1)
  })

  it('the switch off, nothing there: no row, no card, as before', async () => {
    mocks.summary.mockResolvedValue(summary({ wallet: { balance: 0, is_frozen: false } }))
    const { recordReads } = await renderAccount(OFF)
    await waitFor(() => expect(recordReads()).toBe(1))
    expect(navRow()).toBeNull()
    expect(card()).toBeNull()
    expect(within(nav()).getAllByRole('link')).toHaveLength(9)
  })

  it('the switch off, no balance, the record unreadable: left out (nothing to show for sure)', async () => {
    mocks.summary.mockResolvedValue(summary({ wallet: { balance: 0, is_frozen: false } }))
    mocks.records.mockRejectedValue(new Error('offline'))
    const { recordReads } = await renderAccount(OFF)
    await waitFor(() => expect(recordReads()).toBeGreaterThan(0))
    expect(navRow()).toBeNull()
    expect(card()).toBeNull()
  })
})
