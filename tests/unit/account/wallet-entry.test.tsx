import { render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { SummaryCards } from '@/features/account/dashboard/summary-cards'
import { AccountNav } from '@/features/account/layout/account-nav'
import { walletEntry } from '@/features/account/layout/wallet-entry'
import type { FeatureMap } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import { SARA } from '../auth/fixtures'
import { cart, result } from '../cart/support'
import { authProviders } from '../support/auth-providers'
import { ok, summary } from './fixtures'

// The way to the wallet page while the `wallet` switch is off (Plan 4 final fix wave; rulings
// 144 and 149): the account's nav row and the dashboard's card stay whenever the visitor has
// something there (a balance, a withdrawal on record: held money, its «لغو درخواست»), worded for
// viewing; with nothing there both go, as before. The summary's balance says it without a request;
// only a zero balance asks for one row of the withdrawal record (the wallet page's own read, shared
// by the nav and the card). Until that is known (round 2) both places are held by a hidden
// placeholder of the same size, so nothing below them moves when they come; with nothing there the
// placeholders go (once, and only with the switch off).

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

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((done) => (resolve = done))
  return { promise, resolve }
}

function renderShell(features: Partial<FeatureMap> = {}, variant: 'sidebar' | 'hub' = 'sidebar') {
  const providers = authProviders({ hasSession: true, features })
  render(
    <>
      <AccountNav variant={variant} />
      <SummaryCards />
    </>,
    { wrapper: providers.wrapper },
  )
}

async function renderAccount(features: Partial<FeatureMap> = {}) {
  const { bffFetch } = await import('@/lib/api/client')
  renderShell(features)
  // The summary is in once the orders' badge shows.
  await within(nav()).findByRole('link', { name: 'سفارش‌ها، ۷ سفارش' })
  const recordReads = () =>
    vi.mocked(bffFetch).mock.calls.filter(([path]) => path === 'wallet/withdrawal/list/').length
  return { recordReads }
}

const nav = () => screen.getByRole('navigation', { name: 'حساب کاربری' })
const navRow = () => within(nav()).queryByRole('link', { name: /^کیف پول/ })
const card = () => screen.getByTestId('summary-cards').querySelector('a[href="/account/wallet/"]')
/** The nav's hidden placeholder for the wallet's row, and the dashboard's for its card. */
const rowSlot = () => nav().querySelector<HTMLElement>('li[data-placeholder="wallet"]')
const cardSlot = () =>
  screen.getByTestId('summary-cards').querySelector('[data-card][data-shape="wide"][aria-hidden]')
/** The placeholder row's tints for a pointer or a current page: a hidden, inert box has none. */
const interactiveClasses = (slot: HTMLElement) =>
  [...(slot.firstElementChild?.classList ?? [])].filter((name) =>
    /^(?:hover|active|focus-visible|aria-\[current=page\]|group-aria-\[current=page\]):|^transition/.test(
      name,
    ),
  )
const hrefNear = (slot: HTMLElement, side: 'previous' | 'next') =>
  (side === 'previous' ? slot.previousElementSibling : slot.nextElementSibling)
    ?.querySelector('a')
    ?.getAttribute('href')

describe('walletEntry', () => {
  it.each([
    [{ on: true, balance: 0, hasRecord: undefined }, 'open'],
    [{ on: false, balance: 120_000, hasRecord: undefined }, 'view'],
    [{ on: false, balance: 0, hasRecord: true }, 'view'],
    [{ on: false, balance: 0, hasRecord: false }, 'none'],
    // Not known yet (the summary, or the record's one row): not shown until it is.
    [{ on: false, balance: undefined, hasRecord: undefined }, 'none'],
    [{ on: false, balance: 0, hasRecord: undefined }, 'none'],
    // Being read: undecided, its place held.
    [{ on: false, balance: 'pending', hasRecord: undefined }, 'pending'],
    [{ on: false, balance: 0, hasRecord: 'pending' }, 'pending'],
    [{ on: true, balance: 'pending', hasRecord: undefined }, 'open'],
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
    // Not tried again (a lost connection is, twice: its place stays held meanwhile).
    mocks.records.mockRejectedValue(new ApiError({ status: 429, code: 'throttled', detail: 'x' }))
    const { recordReads } = await renderAccount(OFF)
    await waitFor(() => expect(recordReads()).toBeGreaterThan(0))
    await waitFor(() => expect(rowSlot()).toBeNull())
    expect(cardSlot()).toBeNull()
    expect(navRow()).toBeNull()
    expect(card()).toBeNull()
  })
})

describe('while the wallet’s entry is undecided (the switch off)', () => {
  it('the summary on its way: the row’s and the card’s places are held, hidden, then filled', async () => {
    const later = deferred<ReturnType<typeof summary>>()
    mocks.summary.mockReturnValue(later.promise)
    renderShell(OFF)
    await waitFor(() => expect(rowSlot()).not.toBeNull())
    const slot = rowSlot()!
    expect(slot).toHaveAttribute('aria-hidden', 'true')
    expect(slot.firstElementChild).toHaveClass('min-h-11')
    expect(interactiveClasses(slot)).toEqual([])
    expect([hrefNear(slot, 'previous'), hrefNear(slot, 'next')]).toEqual([
      '/account/addresses/',
      '/account/notifications/',
    ])
    expect(navRow()).toBeNull()
    expect(cardSlot()).not.toBeNull()
    expect(screen.getByTestId('summary-cards')).toHaveClass('md:grid-cols-4')

    later.resolve(summary())
    await waitFor(() => expect(navRow()).not.toBeNull())
    expect(rowSlot()).toBeNull()
    expect(card()).toHaveTextContent('غیرفعال است؛ فقط برای مشاهده')
    expect(cardSlot()).toBeNull()
  })

  it('no balance, the record on its way: still held beside the counters; nothing there: both go', async () => {
    mocks.summary.mockResolvedValue(summary({ wallet: { balance: 0, is_frozen: false } }))
    const later = deferred<ReturnType<typeof page>>()
    mocks.records.mockReturnValue(later.promise)
    await renderAccount(OFF)
    expect(rowSlot()).not.toBeNull()
    expect(cardSlot()).not.toBeNull()
    expect(screen.getByTestId('summary-cards').querySelectorAll('a[data-card]')).toHaveLength(2)

    later.resolve(page(0))
    await waitFor(() => expect(rowSlot()).toBeNull())
    expect(cardSlot()).toBeNull()
    expect(navRow()).toBeNull()
    expect(card()).toBeNull()
  })

  it('the phone’s hub holds a row of its own size', async () => {
    mocks.summary.mockReturnValue(new Promise(() => {}))
    renderShell(OFF, 'hub')
    await waitFor(() => expect(rowSlot()).not.toBeNull())
    const slot = rowSlot()!
    expect(slot.firstElementChild).toHaveClass('min-h-14')
    expect(interactiveClasses(slot)).toEqual([])
  })

  it('the switch on: never held, the row is there from the start', () => {
    mocks.summary.mockReturnValue(new Promise(() => {}))
    renderShell()
    expect(rowSlot()).toBeNull()
    expect(navRow()).not.toBeNull()
  })
})
