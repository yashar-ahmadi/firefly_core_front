import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { WalletPage } from '@/features/wallet/wallet-page'
import { ApiError } from '@/lib/api/errors'
import { catalog } from '../payment/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { balance, payments, topUpDetail, transactions, withdrawals } from './fixtures'
import { ok, renderWallet } from './wallet-support'

// `/account/wallet/` «کیف پول» (order digest §1.5, §3.3, §7; Review Focus #5): the balance and
// the top-up box, then the tabs «تراکنش‌ها», «برداشت», «تاریخچهٔ پرداخت» (links: each view has its
// URL). The `wallet` switch off: the balance and the ledger stay (read only), the top-up goes, and
// the page says why; the withdrawals' tab stays while there is a request to show (its list, an
// open one's «لغو درخواست»: the backend still cancels it and returns the money), never a new
// request. Frozen: the badge and the message; no top-up, no new withdrawal. A payment's detail
// opens in a sheet from the ledger or the history.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), search: '', replace: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: mocks.replace, refresh: vi.fn() }),
  usePathname: () => '/account/wallet/',
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

let wallet = balance()

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  mocks.search = ''
  wallet = balance()
  mocks.bffFetch.mockImplementation((path: string, init: { query?: { status?: unknown } } = {}) => {
    if (path === 'wallet/') return ok(wallet)
    if (path === 'wallet/transaction/list/') return ok(transactions())
    // The open request's read asks for requested/approved: none of shirin's is.
    if (path === 'wallet/withdrawal/list/')
      return ok(
        Array.isArray(init.query?.status) ? { ...withdrawals(), results: [] } : withdrawals(),
      )
    if (path === 'payment/history/') return ok(payments())
    if (path.startsWith('payment/history/')) return ok(topUpDetail())
    return new Promise(() => {})
  })
})

const WALLET_OFF = {
  wallet: { key: 'wallet' as const, enabled: false, reason: 'کیف پول موقتاً غیرفعال است.' },
}

function renderPage(features = {}) {
  const view = renderWallet(
    <WalletPage title="کیف پول" catalog={catalog()} supportPhone={null} />,
    { features },
  )
  return { ...view, user: userEvent.setup() }
}

const tabs = () => screen.getByRole('navigation', { name: 'بخش‌های کیف پول' })

describe('the page', () => {
  it('the balance, the top-up box and the three tabs; the ledger by default', async () => {
    renderPage()
    expect(screen.getByRole('heading', { level: 1, name: 'کیف پول' })).toBeVisible()
    expect(await screen.findByRole('region', { name: 'موجودی' })).toHaveTextContent(
      '۴۵٬۱۷۰٬۰۰۰ تومان',
    )
    expect(screen.getByRole('region', { name: 'افزایش موجودی' })).toBeVisible()
    const links = within(tabs()).getAllByRole('link')
    expect(links.map((link) => link.textContent)).toEqual([
      'تراکنش‌ها',
      'برداشت',
      'تاریخچهٔ پرداخت',
    ])
    expect(links[0]).toHaveAttribute('aria-current', 'page')
    expect(links[1]).toHaveAttribute('href', '/account/wallet/?tab=withdrawals')
    expect(await screen.findByRole('list', { name: 'تراکنش‌های کیف پول' })).toBeVisible()
  })

  it('a tab from the URL', async () => {
    mocks.search = 'tab=history'
    renderPage()
    expect(within(tabs()).getByRole('link', { name: 'تاریخچهٔ پرداخت' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(await screen.findByRole('list', { name: 'پرداخت‌های حساب' })).toBeVisible()
  })

  it('a payment’s detail opens in a sheet from a ledger row', async () => {
    const { user } = renderPage()
    const list = await screen.findByRole('list', { name: 'تراکنش‌های کیف پول' })
    await user.click(within(list).getAllByRole('button', { name: /جزئیات پرداخت/ })[0]!)
    const sheet = await screen.findByRole('dialog', { name: 'جزئیات پرداخت' })
    expect(await within(sheet).findByText('شارژ کیف پول')).toBeVisible()
  })
})

describe('the `wallet` switch off (Review Focus #5)', () => {
  /** No withdrawal request on record (the ledger's rows still name some: the links must go). */
  function noRecords() {
    const served = mocks.bffFetch.getMockImplementation()!
    mocks.bffFetch.mockImplementation((path: string, init?: unknown) =>
      path === 'wallet/withdrawal/list/'
        ? ok({ ...withdrawals(), count: 0, total_pages: 0, results: [] })
        : served(path, init),
    )
  }

  it('the balance and the ledger stay; no top-up; the shop’s reason said', async () => {
    renderPage(WALLET_OFF)
    expect(await screen.findByRole('region', { name: 'موجودی' })).toHaveTextContent(
      '۴۵٬۱۷۰٬۰۰۰ تومان',
    )
    expect(screen.getByText(/کیف پول موقتاً غیرفعال است\./)).toBeVisible()
    expect(screen.queryByRole('region', { name: 'افزایش موجودی' })).toBeNull()
    expect(await screen.findByRole('list', { name: 'تراکنش‌های کیف پول' })).toBeVisible()
  })

  it('no request on record: no withdrawals tab, nor the ledger’s links to one', async () => {
    noRecords()
    renderPage(WALLET_OFF)
    const ledger = await screen.findByRole('list', { name: 'تراکنش‌های کیف پول' })
    expect(within(ledger).getAllByRole('listitem')[1]).toHaveTextContent('برداشت به حساب بانکی')
    expect(within(tabs()).queryByRole('link', { name: 'برداشت' })).toBeNull()
    expect(within(ledger).queryByRole('link', { name: /درخواست برداشت/ })).toBeNull()
  })

  it('no request on record: the withdrawals tab asked for falls back to the ledger', async () => {
    noRecords()
    mocks.search = 'tab=withdrawals'
    renderPage(WALLET_OFF)
    expect(await screen.findByRole('list', { name: 'تراکنش‌های کیف پول' })).toBeVisible()
    await waitFor(() =>
      expect(screen.queryByRole('list', { name: 'درخواست‌های برداشت' })).toBeNull(),
    )
  })

  it('requests on record: the tab stays, with the list; no new request, why said', async () => {
    mocks.search = 'tab=withdrawals'
    renderPage(WALLET_OFF)
    expect(await within(tabs()).findByRole('link', { name: 'برداشت' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(await screen.findByRole('list', { name: 'درخواست‌های برداشت' })).toBeVisible()
    expect(
      await screen.findByText(/ثبت درخواست برداشت از کیف پول در حال حاضر ممکن نیست/),
    ).toBeVisible()
    expect(screen.queryByRole('button', { name: 'درخواست برداشت جدید' })).toBeNull()
  })

  it('an open request (its money held): its «لغو درخواست» stays, the backend still takes it', async () => {
    const open = {
      ...withdrawals().results[0]!,
      status: 'requested' as const,
      status_display: 'در انتظار بررسی',
    }
    wallet = balance({ balance: 44_870_000, pending_withdrawal_amount: 300_000 })
    mocks.bffFetch.mockImplementation((path: string) => {
      if (path === 'wallet/') return ok(wallet)
      if (path === 'wallet/withdrawal/list/') return ok({ ...withdrawals(), results: [open] })
      return new Promise(() => {})
    })
    mocks.search = 'tab=withdrawals'
    renderPage(WALLET_OFF)
    const region = await screen.findByRole('region', { name: 'درخواست برداشت باز' })
    expect(within(region).getByRole('button', { name: 'لغو درخواست' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'درخواست برداشت جدید' })).toBeNull()
  })

  it('`online_payment` off: only the top-up goes', async () => {
    renderPage({ online_payment: { key: 'online_payment', enabled: false, reason: null } })
    expect(await screen.findByRole('region', { name: 'موجودی' })).toBeVisible()
    expect(screen.queryByRole('region', { name: 'افزایش موجودی' })).toBeNull()
    expect(within(tabs()).getByRole('link', { name: 'برداشت' })).toBeVisible()
  })
})

describe('a frozen wallet (Review Focus #5)', () => {
  it('the badge and the message; no top-up; no new withdrawal, why said', async () => {
    wallet = balance({ is_frozen: true, freeze_message: 'حساب شما در حال بررسی است.' })
    mocks.search = 'tab=withdrawals'
    renderPage()
    const card = await screen.findByRole('region', { name: 'موجودی' })
    expect(within(card).getByText('مسدود')).toBeVisible()
    expect(card).toHaveTextContent('حساب شما در حال بررسی است.')
    expect(screen.queryByRole('region', { name: 'افزایش موجودی' })).toBeNull()
    expect(await screen.findByText(/درخواست برداشت تازه ممکن نیست/)).toBeVisible()
    expect(screen.queryByRole('button', { name: 'درخواست برداشت جدید' })).toBeNull()
  })
})

describe('the session ends on the page (every read 401)', () => {
  it('one replace to login with the page as `next`; no section shows an error', async () => {
    mocks.bffFetch.mockImplementation(() =>
      Promise.reject(new ApiError({ status: 401, code: 'token_not_valid', detail: 'منقضی' })),
    )
    window.history.replaceState(null, '', '/account/wallet/')
    renderPage()
    await waitFor(() => expect(mocks.replace).toHaveBeenCalled())
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect(mocks.replace).toHaveBeenCalledExactlyOnceWith('/login/?next=/account/wallet/')
    expect(screen.queryByRole('button', { name: 'تلاش دوباره' })).toBeNull()
    window.history.replaceState(null, '', '/')
  })
})
