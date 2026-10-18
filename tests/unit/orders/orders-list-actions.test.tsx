import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrdersPage } from '@/features/orders/account/orders-page'
import type { OrderListItem } from '@/lib/api/types/order-detail'
import { catalog } from '../payment/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import {
  calls,
  detail,
  ok,
  orderItem,
  page,
  refuse,
  renderAccount,
  serve,
  summary,
  unconfirmedCod,
} from './account-support'

// «سفارش‌های من»'s card actions (order digest §6.3): «پرداخت» and «تأیید سفارش» open the pay sheet
// over the list (the order read for its amounts: the list has none), «لغو سفارش» its question.
// One sheet and one question serve every card: each opens for its own order, never with what
// another order's left in it (a reason typed, a refusal, an open attempt).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/orders/',
  useSearchParams: () => new URLSearchParams(),
}))

const A = '3067562358'
const B = '1234567890'
/** Two orders awaiting payment (the second a copy of the first under another code). */
const LIST: OrderListItem[] = [orderItem(A), orderItem(A, { order_code: B, uuid: 'uuid-b' })]

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  serve(mocks.bffFetch, {
    'dashboard/summary/': () => ok(summary()),
    'order/list/': () => ok(page(LIST)),
    [`order/${A}/`]: () => ok(detail('awaiting')),
    [`order/${B}/`]: () => ok(detail('awaiting', { order_code: B, uuid: 'uuid-b' })),
    [`order/${A}/cancel/`]: () => refuse(409, 'order_already_cancelled'),
    [`order/${B}/cancel/`]: () => new Promise(() => {}),
  })
})

const renderOrders = () => {
  renderAccount(<OrdersPage title="سفارش‌های من" catalog={catalog()} supportPhone={null} />)
  return userEvent.setup()
}
const card = (code: string) =>
  screen.findByRole('article', { name: new RegExp(`سفارش ${toPersian(code)}`) })
const toPersian = (digits: string) => digits.replace(/\d/g, (d) => '۰۱۲۳۴۵۶۷۸۹'[Number(d)]!)

describe('the card actions', () => {
  it('«پرداخت»: the sheet over the list, the order read for what it owes online', async () => {
    const user = renderOrders()
    await user.click(within(await card(A)).getByRole('button', { name: 'پرداخت' }))
    const sheet = await screen.findByRole('dialog', { name: /پرداخت سفارش ۳۰۶۷۵۶۲۳۵۸/ })
    expect(await within(sheet).findByText('مبلغ قابل پرداخت آنلاین')).toBeVisible()
    expect(sheet).toHaveTextContent('۵۳٬۷۹۰٬۰۰۰ تومان')
    expect(calls(mocks.bffFetch, `order/${A}/`)).toHaveLength(1)
  })

  it('«تأیید سفارش» for a pure pay-on-delivery order awaiting its confirmation', async () => {
    // Within the route's ceiling (the live 20,000,000), so the route is open.
    const base = unconfirmedCod()
    const cod = {
      ...base,
      money: { ...base.money, total: 616_000, amount_to_collect_on_delivery: 616_000 },
    }
    serve(mocks.bffFetch, {
      'dashboard/summary/': () => ok(summary()),
      'order/list/': () => ok(page([orderItem(A, { is_payable: false })])),
      [`order/${A}/`]: () => ok(cod),
    })
    const user = renderOrders()
    const own = await card(A)
    expect(within(own).queryByRole('button', { name: 'پرداخت' })).toBeNull()
    await user.click(within(own).getByRole('button', { name: 'تأیید سفارش' }))
    const sheet = await screen.findByRole('dialog', { name: /تأیید سفارش ۳۰۶۷۵۶۲۳۵۸/ })
    expect(await within(sheet).findByRole('button', { name: 'تأیید سفارش' })).toBeVisible()
    expect(within(sheet).queryByRole('radiogroup')).toBeNull()
    // What the confirmation does is said once (the routes' own notice), not twice.
    expect(within(sheet).getAllByText(/هنگام تحویل پرداخت می/)).toHaveLength(1)
  })

  it('another card’s question does not re-open the closed sheet for that order (no extra read)', async () => {
    const user = renderOrders()
    await user.click(within(await card(A)).getByRole('button', { name: 'پرداخت' }))
    const sheet = await screen.findByRole('dialog', { name: /پرداخت سفارش/ })
    expect(await within(sheet).findByText('مبلغ قابل پرداخت آنلاین')).toBeVisible()
    await user.click(within(sheet).getByRole('button', { name: 'بستن' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await user.click(within(await card(B)).getByRole('button', { name: 'لغو سفارش' }))
    expect(await screen.findByRole('dialog', { name: 'لغو سفارش' })).toHaveTextContent('۱۲۳۴۵۶۷۸۹۰')
    expect(calls(mocks.bffFetch, `order/${B}/`)).toHaveLength(0)
  })

  it('each order’s question is its own: nothing of another order’s is left in it', async () => {
    const user = renderOrders()
    await user.click(within(await card(A)).getByRole('button', { name: 'لغو سفارش' }))
    let dialog = await screen.findByRole('dialog', { name: 'لغو سفارش' })
    await user.type(within(dialog).getByRole('textbox', { name: /دلیل لغو/ }), 'دلیل الف')
    await user.click(within(dialog).getByRole('button', { name: 'لغو سفارش' }))
    // A's answer: cancelled already; its question keeps only «بازگشت».
    expect(await within(dialog).findByRole('alert')).toHaveTextContent('پیش‌تر لغو شده')
    expect(within(dialog).queryByRole('button', { name: 'لغو سفارش' })).toBeNull()
    await user.click(within(dialog).getByRole('button', { name: 'بازگشت' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())

    await user.click(within(await card(B)).getByRole('button', { name: 'لغو سفارش' }))
    dialog = await screen.findByRole('dialog', { name: 'لغو سفارش' })
    expect(dialog).toHaveTextContent('سفارش ۱۲۳۴۵۶۷۸۹۰ لغو می')
    expect(within(dialog).queryByRole('alert')).toBeNull()
    expect(within(dialog).getByRole('textbox', { name: /دلیل لغو/ })).toHaveValue('')
    expect(within(dialog).getByRole('button', { name: 'لغو سفارش' })).toBeVisible()
  })

  it('a cancellation reads the wallet again (a combined attempt’s wallet leg returns to it)', async () => {
    const cancelled = detail('awaiting', { status: 'cancelled', can_cancel: false })
    serve(mocks.bffFetch, {
      'dashboard/summary/': () => ok(summary()),
      'order/list/': () => ok(page([orderItem(A)])),
      [`order/${A}/cancel/`]: () => ok(cancelled),
    })
    const { client } = renderAccount(
      <OrdersPage title="سفارش‌های من" catalog={catalog()} supportPhone={null} />,
    )
    client.setQueryData(['wallet', 'balance'], { balance: 1 })
    const user = userEvent.setup()
    await user.click(within(await card(A)).getByRole('button', { name: 'لغو سفارش' }))
    const dialog = await screen.findByRole('dialog', { name: 'لغو سفارش' })
    await user.click(within(dialog).getByRole('button', { name: 'لغو سفارش' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(client.getQueryState(['wallet', 'balance'])?.isInvalidated).toBe(true)
  })
})
