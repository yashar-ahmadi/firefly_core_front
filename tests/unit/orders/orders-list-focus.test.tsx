import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrdersPage } from '@/features/orders/account/orders-page'
import type { OrderDetail, OrderListItem } from '@/lib/api/types/order-detail'
import { catalog } from '../payment/fixtures'
import { minWidth, stubBrowserApis } from '../support/dom-stubs'
import {
  ok,
  orderItem,
  page,
  renderAccount,
  serve,
  summary,
  unconfirmedCod,
} from './account-support'

// «سفارش‌های من» after a confirmation (or a payment) from the pay sheet takes the card's «تأیید
// سفارش»/«پرداخت» away (Task 9 carry-over): the focus never falls to <body>. It goes to the card's
// heading (its link), whether the list was read again before the sheet closed or after the focus
// came back to the button; and to the page's heading when the order left the list (a tab it no
// longer belongs to), as the list's cancel does.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/orders/',
  useSearchParams: () => new URLSearchParams(),
}))

const A = '3067562358'
const PERSIAN_A = '۳۰۶۷۵۶۲۳۵۸'

/** A pure pay-on-delivery order within the route's ceiling (the live 20,000,000). */
function codOrder(): OrderDetail {
  const base = unconfirmedCod()
  return {
    ...base,
    money: { ...base.money, total: 616_000, amount_to_collect_on_delivery: 616_000 },
  }
}

const AWAITING = orderItem(A, { is_payable: false })
const CONFIRMED = orderItem(A, { status: 'processing', is_payable: false, can_cancel: false })
const CANCELLED_ITEM = { status: 'cancelled', is_payable: false, can_cancel: false } as const
const CONFIRMED_INTENT = {
  payment: null,
  status: null,
  handoff: null,
  destination_cards: [],
  delivery_collection: null,
}

/** The list answers `first`, then each later read what `next` resolves to. */
function serveList(next: () => Promise<OrderListItem[]>) {
  let reads = 0
  const order = codOrder()
  serve(mocks.bffFetch, {
    'dashboard/summary/': () => ok(summary()),
    'order/list/': () =>
      reads++ === 0 ? ok(page([AWAITING])) : next().then((rows) => ok(page(rows))),
    [`order/${A}/`]: () => ok(order),
    [`payment/order/${order.uuid}/intent/`]: () => ok(CONFIRMED_INTENT, 'ثبت شد.', 201),
  })
}

const cardLink = () =>
  within(screen.getByRole('heading', { level: 2, name: new RegExp(PERSIAN_A) })).getByRole('link')

async function confirmFromSheet() {
  const user = userEvent.setup()
  renderAccount(<OrdersPage title="سفارش‌های من" catalog={catalog()} supportPhone={null} />)
  const card = await screen.findByRole('article', { name: new RegExp(PERSIAN_A) })
  await user.click(within(card).getByRole('button', { name: 'تأیید سفارش' }))
  const sheet = await screen.findByRole('dialog', { name: /تأیید سفارش/ })
  await user.click(await within(sheet).findByRole('button', { name: 'تأیید سفارش' }))
  await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe.each([
  ['a bottom sheet (phones)', () => stubBrowserApis()],
  ['a side drawer (md and up)', () => stubBrowserApis(minWidth(48))],
])('a confirmation from the pay sheet over the list, %s', (_name, stub) => {
  beforeEach(() => {
    stub()
  })

  it('the list read again at once: the focus to the card’s heading, not <body>', async () => {
    serveList(async () => [CONFIRMED])
    await confirmFromSheet()
    await waitFor(() => expect(screen.queryByRole('button', { name: 'تأیید سفارش' })).toBeNull())
    await waitFor(() => expect(cardLink()).toHaveFocus())
  })

  it('the list read again after the sheet closed: from «تأیید سفارش» to the card’s heading', async () => {
    let answer: (rows: OrderListItem[]) => void = () => {}
    serveList(() => new Promise((resolve) => (answer = resolve)))
    await confirmFromSheet()
    await waitFor(() => expect(screen.getByRole('button', { name: 'تأیید سفارش' })).toHaveFocus())
    await act(async () => answer([CONFIRMED]))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'تأیید سفارش' })).toBeNull())
    await waitFor(() => expect(cardLink()).toHaveFocus())
  })

  it('the order left the list (its tab no longer holds it): the focus to the page’s heading', async () => {
    serveList(async () => [])
    await confirmFromSheet()
    await waitFor(() =>
      expect(screen.queryByRole('article', { name: new RegExp(PERSIAN_A) })).toBeNull(),
    )
    await waitFor(() =>
      expect(screen.getByRole('heading', { level: 1, name: 'سفارش‌های من' })).toHaveFocus(),
    )
  })
})

describe('a cancellation from a card', () => {
  it('«لغو سفارش» goes with it: the focus to the card’s heading', async () => {
    stubBrowserApis()
    const cancelled = { ...codOrder(), status: 'cancelled' as const, can_cancel: false }
    let reads = 0
    serve(mocks.bffFetch, {
      'dashboard/summary/': () => ok(summary()),
      'order/list/': () => ok(page([reads++ === 0 ? orderItem(A) : orderItem(A, CANCELLED_ITEM)])),
      [`order/${A}/cancel/`]: () => ok(cancelled),
    })
    const user = userEvent.setup()
    renderAccount(<OrdersPage title="سفارش‌های من" catalog={catalog()} supportPhone={null} />)
    const card = await screen.findByRole('article', { name: new RegExp(PERSIAN_A) })
    await user.click(within(card).getByRole('button', { name: 'لغو سفارش' }))
    const dialog = await screen.findByRole('dialog', { name: 'لغو سفارش' })
    await user.click(within(dialog).getByRole('button', { name: 'لغو سفارش' }))
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    await waitFor(() => expect(screen.queryByRole('button', { name: 'لغو سفارش' })).toBeNull())
    await waitFor(() => expect(cardLink()).toHaveFocus())
  })
})
