import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentHistory } from '@/features/wallet/payment-history'
import type { QueryInit } from '@/lib/api/envelope'
import { stubBrowserApis } from '../support/dom-stubs'
import { spyOnHistory } from '../support/history'
import { payments } from './fixtures'
import { ok, renderWallet } from './wallet-support'

// «تاریخچهٔ پرداخت» (order digest §3.2.9; dashboard digest §3.3): every payment of the account,
// newest first: what it was for and how it was paid in the API's words (a method the storefront
// does not offer, a payment the shop recorded, is a payment like any other), its status as a
// pill with words, its amount and date, its order; «جزئیات» opens its detail (in a sheet: the
// uuid never goes into a URL). Filters by status, method and what it was for (`applies_to`:
// «شارژ کیف پول» = the top-ups), in the URL, in the API's names.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), search: 'tab=history' }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/wallet/',
  useSearchParams: () => new URLSearchParams(mocks.search),
}))

type Init = { query?: QueryInit }
let answer: () => Promise<unknown>
let history = spyOnHistory()

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  history = spyOnHistory()
  mocks.search = 'tab=history'
  answer = () => ok(payments())
  mocks.bffFetch.mockImplementation((path: string) =>
    path === 'payment/history/' ? answer() : new Promise(() => {}),
  )
})

const reads = () =>
  mocks.bffFetch.mock.calls
    .filter(([path]) => path === 'payment/history/')
    .map(([, init]) => (init as Init).query ?? {})

function renderHistory() {
  const onShowPayment = vi.fn()
  renderWallet(<PaymentHistory onShowPayment={onShowPayment} />)
  return { onShowPayment, user: userEvent.setup() }
}

const rows = async () =>
  within(await screen.findByRole('list', { name: 'پرداخت‌های حساب' })).getAllByRole('listitem')

describe('the rows', () => {
  it('in the API’s words: method, what for, status pill, amount, date, order', async () => {
    renderHistory()
    const list = await rows()
    const pos = list[2]!
    expect(pos).toHaveTextContent('کارتخوان')
    expect(pos).toHaveTextContent('پرداخت آنلاین سفارش')
    expect(pos).toHaveTextContent('تسویه شده')
    expect(pos).toHaveTextContent('۱٬۹۱۴٬۰۰۰ تومان')
    expect(within(pos).getByRole('link', { name: /سفارش ۶۱۳۸۰۷۸۹۸۹/ })).toHaveAttribute(
      'href',
      '/account/orders/6138078989/',
    )
    const topUp = list[6]!
    expect(topUp).toHaveTextContent('شارژ کیف پول')
    expect(within(topUp).queryByRole('link')).toBeNull()
  })

  it('«جزئیات» opens the payment’s detail; its uuid in no link', async () => {
    const { onShowPayment, user } = renderHistory()
    const [first] = await rows()
    await user.click(within(first!).getByRole('button', { name: /جزئیات/ }))
    expect(onShowPayment).toHaveBeenCalledWith(payments().results[0]!.uuid)
    for (const link of screen.queryAllByRole('link'))
      expect(link.getAttribute('href')).not.toContain(payments().results[0]!.uuid)
  })

  it('a method the storefront does not know, without words: a payment all the same', async () => {
    const page = payments()
    page.results[0] = { ...page.results[0]!, method: 'crypto', method_display: '' }
    answer = () => ok(page)
    renderHistory()
    const [first] = await rows()
    expect(first).toHaveTextContent('پرداخت ثبت‌شده')
  })
})

describe('the filters', () => {
  it('the URL’s, in the API’s names', async () => {
    mocks.search = 'tab=history&status=settled&method=bank_gateway&applies_to=wallet_topup&page=2'
    renderHistory()
    await waitFor(() =>
      expect(reads()).toEqual([
        { status: 'settled', method: 'bank_gateway', applies_to: 'wallet_topup', page: 2 },
      ]),
    )
  })

  it('«شارژ کیف پول»: the top-ups (`applies_to=wallet_topup`), back to page 1', async () => {
    mocks.search = 'tab=history&page=4'
    const { user } = renderHistory()
    await rows()
    await user.selectOptions(screen.getByRole('combobox', { name: 'مربوط به' }), 'wallet_topup')
    expect(history.replaced().at(-1)).toBe('/account/wallet/?tab=history&applies_to=wallet_topup')
    await user.selectOptions(screen.getByRole('combobox', { name: 'روش پرداخت' }), 'pos')
    await user.selectOptions(screen.getByRole('combobox', { name: 'وضعیت پرداخت' }), 'failed')
    expect(history.replaced().at(-1)).toBe('/account/wallet/?tab=history&status=failed')
  })

  it('nothing for these filters: said, with the way back to every payment', async () => {
    mocks.search = 'tab=history&status=refunded'
    answer = () => ok({ ...payments(), count: 0, results: [] })
    renderHistory()
    expect(await screen.findByText('پرداختی با این فیلترها پیدا نشد.')).toBeVisible()
    expect(screen.getByRole('link', { name: 'همهٔ پرداخت‌ها' })).toHaveAttribute(
      'href',
      '/account/wallet/?tab=history',
    )
  })
})
