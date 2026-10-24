import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { TransactionsList } from '@/features/wallet/transactions-list'
import type { QueryInit } from '@/lib/api/envelope'
import { stubBrowserApis } from '../support/dom-stubs'
import { spyOnHistory } from '../support/history'
import { transactions } from './fixtures'
import { ok, refuse, renderWallet } from './wallet-support'

// The ledger (order digest §3.3.2, §7; dashboard digest §3.3): money that actually moved, newest
// first; each row's sign and colour from `direction` and said in words (never by colour alone),
// the amount, the balance right after it as the API gives it (nothing summed here), the Jalali
// date, the cause in the API's words, and its links: the order, the payment's detail (a sheet:
// its uuid never goes into a URL), the withdrawal. Filters (direction, cause), the ordering and
// an order code's start are the URL's, sent in the API's names.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), search: '' }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/wallet/',
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

type Init = { query?: QueryInit }
let answer: (query: QueryInit) => Promise<unknown>
let history = spyOnHistory()

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  history = spyOnHistory()
  mocks.search = ''
  answer = () => ok(transactions())
  mocks.bffFetch.mockImplementation((path: string, init: Init = {}) =>
    path === 'wallet/transaction/list/' ? answer(init.query ?? {}) : new Promise(() => {}),
  )
})

const reads = () =>
  mocks.bffFetch.mock.calls
    .filter(([path]) => path === 'wallet/transaction/list/')
    .map(([, init]) => (init as Init).query ?? {})

function renderList({ withdrawalsTab = true } = {}) {
  const onShowPayment = vi.fn()
  renderWallet(<TransactionsList onShowPayment={onShowPayment} withdrawalsTab={withdrawalsTab} />)
  return { onShowPayment, user: userEvent.setup() }
}

const rows = async () =>
  within(await screen.findByRole('list', { name: 'تراکنش‌های کیف پول' })).getAllByRole('listitem')

describe('the rows', () => {
  it('a credit and a debit: the sign, the words, the amount, the balance after as given', async () => {
    renderList()
    const [reversal, withdrawal] = await rows()
    expect(reversal).toHaveTextContent('واریز')
    expect(reversal).toHaveTextContent('+۳۰۰٬۰۰۰ تومان')
    expect(reversal).toHaveTextContent('برگشت درخواست برداشت')
    expect(reversal).toHaveTextContent('لغو توسط مشتری')
    expect(reversal).toHaveTextContent(/موجودی پس از تراکنش:?\s*۴۵٬۱۷۰٬۰۰۰ تومان/)
    expect(reversal).toHaveTextContent('۲۳ مهر ۱۴۰۵')
    expect(withdrawal).toHaveTextContent('برداشت')
    expect(withdrawal).toHaveTextContent('−۳۰۰٬۰۰۰ تومان')
    expect(withdrawal).toHaveTextContent(/موجودی پس از تراکنش:?\s*۴۴٬۸۷۰٬۰۰۰ تومان/)
  })

  it('`balance_after` is shown as the API gives it (even when the rows do not add up)', async () => {
    const page = transactions()
    page.results[0]!.balance_after = 12_345
    answer = () => ok(page)
    renderList()
    const [first] = await rows()
    expect(first).toHaveTextContent(/موجودی پس از تراکنش:?\s*۱۲٬۳۴۵ تومان/)
  })

  it('links: the order’s page, the payment’s detail (a sheet), the withdrawal on its tab', async () => {
    const { onShowPayment, user } = renderList()
    const list = await rows()
    const orderRow = list[2]!
    expect(within(orderRow).getByRole('link', { name: /سفارش ۰۴۰۴۶۱۴۰۱۳/ })).toHaveAttribute(
      'href',
      '/account/orders/0404614013/',
    )
    await user.click(within(orderRow).getByRole('button', { name: /جزئیات پرداخت/ }))
    expect(onShowPayment).toHaveBeenCalledWith(transactions().results[2]!.payment_uuid)
    const withdrawalLink = within(list[1]!).getByRole('link', { name: /درخواست برداشت/ })
    expect(withdrawalLink.getAttribute('href')).toBe(
      `/account/wallet/?tab=withdrawals&focus=${transactions().results[1]!.withdrawal_uuid}`,
    )
    // A payment's uuid is a credential: in no link.
    for (const link of screen.getAllByRole('link'))
      expect(link.getAttribute('href')).not.toContain(transactions().results[2]!.payment_uuid!)
  })

  it('no withdrawals’ tab (the switch off, no request on record): no link to a request', async () => {
    renderList({ withdrawalsTab: false })
    const [reversal, withdrawal] = await rows()
    expect(withdrawal).toHaveTextContent('برداشت به حساب بانکی')
    expect(within(reversal!).queryByRole('link', { name: /درخواست برداشت/ })).toBeNull()
    expect(within(withdrawal!).queryByRole('link', { name: /درخواست برداشت/ })).toBeNull()
  })

  it('a cause the storefront does not know: the API’s words, else as it came', async () => {
    const page = transactions()
    page.results[0] = { ...page.results[0]!, cause: 'cashback', cause_display: '' }
    answer = () => ok(page)
    renderList()
    const [first] = await rows()
    expect(first).toHaveTextContent('cashback')
  })
})

describe('the filters and the ordering', () => {
  it('the URL’s, read in the API’s names; unknown ones never sent', async () => {
    mocks.search = 'direction=debit&cause=order_payment&ordering=-amount&page=2&search=۰۴'
    renderList()
    // The search form, a search landmark named apart from the header's.
    expect(
      await screen.findByRole('search', { name: 'جستجو در تراکنش\u{200C}ها' }),
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(reads()).toEqual([
        { direction: 'debit', cause: 'order_payment', ordering: '-amount', search: '04', page: 2 },
      ]),
    )
  })

  it('a change replaces the URL and goes back to page 1', async () => {
    mocks.search = 'page=3'
    const { user } = renderList()
    await rows()
    await user.selectOptions(screen.getByRole('combobox', { name: 'نوع تراکنش' }), 'credit')
    expect(history.replaced().at(-1)).toBe('/account/wallet/?direction=credit')
    await user.selectOptions(screen.getByRole('combobox', { name: 'علت' }), 'top_up')
    expect(history.replaced().at(-1)).toBe('/account/wallet/?cause=top_up')
    await user.selectOptions(screen.getByRole('combobox', { name: 'مرتب‌سازی' }), 'amount')
    expect(history.replaced().at(-1)).toBe('/account/wallet/?ordering=amount')
  })

  it('an order code’s start: a new history entry, back to page 1', async () => {
    const { user } = renderList()
    await rows()
    await user.type(screen.getByRole('searchbox', { name: /کد سفارش/ }), '۰۴۰۴{Enter}')
    expect(history.pushed().at(-1)).toBe('/account/wallet/?search=0404')
  })
})

describe('empty and unreadable', () => {
  it('no movement at all: said so', async () => {
    answer = () => ok({ ...transactions(), count: 0, results: [] })
    renderList()
    expect(await screen.findByText('هنوز تراکنشی در کیف پول شما ثبت نشده است.')).toBeVisible()
  })

  it('none for these filters: said so, with the way back to every row', async () => {
    mocks.search = 'cause=refund'
    answer = () => ok({ ...transactions(), count: 0, results: [] })
    renderList()
    expect(await screen.findByText('تراکنشی با این فیلترها پیدا نشد.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'همهٔ تراکنش‌ها' })).toHaveAttribute(
      'href',
      '/account/wallet/',
    )
  })

  it('cannot be read: «تلاش دوباره» in its place', async () => {
    answer = () => refuse(403, 'permission_denied')
    renderList()
    expect(await screen.findByRole('button', { name: 'تلاش دوباره' })).toBeVisible()
  })
})
