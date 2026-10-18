import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderActions } from '@/features/orders/account/order-actions'
import { useOrder } from '@/features/orders/account/orders-api'
import type { OrderDetail } from '@/lib/api/types/order-detail'
import { catalog } from '../payment/fixtures'
import { minWidth, stubBrowserApis } from '../support/dom-stubs'
import { detail, ok, refuse, renderAccount, serve, unconfirmedCod } from './account-support'

// An order's actions after one of them is done (Task 8 review): a cancellation takes «لغو سفارش»
// away, a payment or a confirmation from the pay sheet takes «پرداخت»/«تأیید سفارش» away. The
// focus never falls to <body> then: it goes to «خرید دوباره» (always there), whether the button
// went while its overlay was open or after the focus came back to it. A cancellation also reads
// the wallet again (a combined attempt's wallet leg returns to it, order digest §3.1.4).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/orders/3067562358/',
}))

const CODE = '3067562358'

/** The page's way: the actions of the order the tab's query holds. */
function OnPage({ initial }: { initial: OrderDetail }) {
  const query = useOrder(initial.order_code, initial)
  return <OrderActions order={query.data!} catalog={catalog()} />
}

const button = (name: string) => screen.queryByRole('button', { name })

/** A pure pay-on-delivery order within the route's ceiling (the live 20,000,000). */
function codOrder(): OrderDetail {
  const base = unconfirmedCod()
  return {
    ...base,
    money: { ...base.money, total: 616_000, amount_to_collect_on_delivery: 616_000 },
  }
}

const confirmed = (order: OrderDetail): OrderDetail => ({
  ...order,
  status: 'processing',
  is_payable: false,
  can_cancel: false,
  is_confirmed: true,
})

const CONFIRMED_INTENT = {
  payment: null,
  status: null,
  handoff: null,
  destination_cards: [],
  delivery_collection: null,
}

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
})

describe('after a cancellation', () => {
  it('«لغو سفارش» is gone: the focus goes to «خرید دوباره»; the wallet is read again', async () => {
    const order = detail('awaiting')
    const cancelled = {
      ...order,
      status: 'cancelled' as const,
      can_cancel: false,
      is_payable: false,
    }
    serve(mocks.bffFetch, { [`order/${CODE}/cancel/`]: () => ok(cancelled) })
    const user = userEvent.setup()
    const { client } = renderAccount(<OnPage initial={order} />)
    client.setQueryData(['wallet', 'balance'], { balance: 1 })
    await user.click(button('لغو سفارش')!)
    const dialog = await screen.findByRole('dialog', { name: 'لغو سفارش' })
    await user.click(within(dialog).getByRole('button', { name: 'لغو سفارش' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    expect(button('لغو سفارش')).toBeNull()
    await waitFor(() => expect(button('خرید دوباره')).toHaveFocus())
    expect(client.getQueryState(['wallet', 'balance'])?.isInvalidated).toBe(true)
  })

  it('cancelled elsewhere (read again while the question is open): «بازگشت» → «خرید دوباره»', async () => {
    const order = detail('awaiting')
    const cancelled = {
      ...order,
      status: 'cancelled' as const,
      can_cancel: false,
      is_payable: false,
    }
    serve(mocks.bffFetch, {
      [`order/${CODE}/cancel/`]: () => refuse(409, 'order_already_cancelled'),
      [`order/${CODE}/`]: () => ok(cancelled),
    })
    const user = userEvent.setup()
    renderAccount(<OnPage initial={order} />)
    await user.click(button('لغو سفارش')!)
    const dialog = await screen.findByRole('dialog', { name: 'لغو سفارش' })
    await user.click(within(dialog).getByRole('button', { name: 'لغو سفارش' }))
    // The page's «لغو سفارش» goes while the focus is in the question, on «بازگشت».
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'لغو سفارش', hidden: true })).toBeNull(),
    )
    expect(within(dialog).getByRole('button', { name: 'بازگشت' })).toHaveFocus()
    await user.click(within(dialog).getByRole('button', { name: 'بازگشت' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(button('خرید دوباره')).toHaveFocus())
  })

  it('«بازگشت» (nothing done): the focus goes back to «لغو سفارش»', async () => {
    serve(mocks.bffFetch)
    const user = userEvent.setup()
    renderAccount(<OnPage initial={detail('awaiting')} />)
    await user.click(button('لغو سفارش')!)
    const dialog = await screen.findByRole('dialog', { name: 'لغو سفارش' })
    await user.click(within(dialog).getByRole('button', { name: 'بازگشت' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(button('لغو سفارش')).toHaveFocus())
  })
})

describe.each([
  ['a bottom sheet (phones)', () => stubBrowserApis()],
  ['a side drawer (md and up)', () => stubBrowserApis(minWidth(48))],
])('after a confirmation from the pay sheet, %s', (_name, stub) => {
  beforeEach(() => {
    stub()
  })

  async function confirmIn(order: OrderDetail) {
    const user = userEvent.setup()
    renderAccount(<OnPage initial={order} />)
    await user.click(button('تأیید سفارش')!)
    const sheet = await screen.findByRole('dialog', { name: /تأیید سفارش/ })
    await user.click(await within(sheet).findByRole('button', { name: 'تأیید سفارش' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  }

  it('the order read again after the sheet closed: from «تأیید سفارش» to «خرید دوباره»', async () => {
    const order = codOrder()
    let answer: (value: unknown) => void = () => {}
    serve(mocks.bffFetch, {
      [`payment/order/${order.uuid}/intent/`]: () => ok(CONFIRMED_INTENT, 'ثبت شد.', 201),
      [`order/${CODE}/`]: () => new Promise((resolve) => (answer = resolve)),
    })
    await confirmIn(order)
    await waitFor(() => expect(button('تأیید سفارش')).toHaveFocus())
    await act(async () => answer({ data: confirmed(order), msg: '', status: 200 }))
    await waitFor(() => expect(button('تأیید سفارش')).toBeNull())
    await waitFor(() => expect(button('خرید دوباره')).toHaveFocus())
  })

  it('the order read again before the sheet closed: «خرید دوباره» all the same', async () => {
    const order = codOrder()
    serve(mocks.bffFetch, {
      [`payment/order/${order.uuid}/intent/`]: () => ok(CONFIRMED_INTENT, 'ثبت شد.', 201),
      [`order/${CODE}/`]: () => ok(confirmed(order)),
    })
    await confirmIn(order)
    await waitFor(() => expect(button('تأیید سفارش')).toBeNull())
    await waitFor(() => expect(button('خرید دوباره')).toHaveFocus())
  })
})
