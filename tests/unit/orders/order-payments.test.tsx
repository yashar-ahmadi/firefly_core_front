import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { OrderPayments } from '@/features/orders/account/order-payments'
import type { PaymentHistoryItem } from '@/lib/api/types/payment'
import { calls, ok, page, payments, refuse, renderAccount, serve } from './account-support'

// An order's payments (order digest §3.2.9–3.2.10, §6.4): `GET payment/history/?order_code=`
// (the detail embeds none), each row with the API's method and status words, its amount and date,
// a bank receipt's gateway, tracking code (kept as a string: leading zeros) and masked card;
// a card transfer's receipt state and, when rejected, the reason (its detail read, the only
// place a signed-in owner reads it). Methods the storefront never offers (a card reader, cash, a
// manual transfer the shop recorded) are legitimate rows, with the API's words or a generic one.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/account/orders/7010868573/',
}))

const HISTORY = 'payment/history/'
const CODE = '7010868573'
const row = (changes: Partial<PaymentHistoryItem>): PaymentHistoryItem => ({
  ...payments('delivered').results[0]!,
  receipt: null,
  ...changes,
})

beforeEach(() => {
  mocks.bffFetch.mockReset()
})

describe('OrderPayments', () => {
  it('reads the order’s own payments; a bank row with its receipt, in the API’s words', async () => {
    serve(mocks.bffFetch, { [HISTORY]: () => ok(payments('delivered')) })
    renderAccount(<OrderPayments code={CODE} />)
    const item = await screen.findByRole('listitem')
    expect(item).toHaveTextContent('درگاه بانکی')
    expect(item).toHaveTextContent('تسویه شده')
    expect(item).toHaveTextContent('۶٬۲۱۲٬۰۰۰ تومان')
    expect(item).toHaveTextContent('زرین پال')
    expect(within(item).getByText('۶۶۹۶۱۵۸۸۰۹۷۵۸۱۲۵۱۰')).toHaveAttribute('dir', 'ltr')
    expect(within(item).getByText('۶۰۷۱****۷۸۵۱')).toHaveAttribute('dir', 'ltr')
    const [, init] = calls(mocks.bffFetch, HISTORY)[0]!
    expect((init as { query: object }).query).toMatchObject({ order_code: CODE })
  })

  it('a tracking code keeps its leading zeros', async () => {
    const first = payments('delivered').results[0]!
    const zero = row({ receipt: { ...first.receipt!, tracking_code: '000123' } })
    serve(mocks.bffFetch, { [HISTORY]: () => ok(page([zero])) })
    renderAccount(<OrderPayments code={CODE} />)
    expect(await screen.findByText('۰۰۰۱۲۳')).toBeVisible()
  })

  it('methods the shop recorded itself: the API’s words, or a generic label', async () => {
    serve(mocks.bffFetch, {
      [HISTORY]: () =>
        ok(
          page([
            row({ uuid: 'a', method: 'pos', method_display: 'کارتخوان' }),
            row({ uuid: 'b', method: 'manual_transfer', method_display: '' }),
            row({
              uuid: 'c',
              method: 'crypto',
              method_display: '',
              status: 'odd',
              status_display: '',
            }),
          ]),
        ),
    })
    renderAccount(<OrderPayments code={CODE} />)
    const items = await screen.findAllByRole('listitem')
    expect(items[0]).toHaveTextContent('کارتخوان')
    expect(items[1]).toHaveTextContent('پرداخت ثبت‌شده')
    expect(items[2]).toHaveTextContent('پرداخت ثبت‌شده')
  })

  it('a card transfer: its receipt’s state read from its detail; rejected, with the reason', async () => {
    const card = row({
      uuid: 'card-1',
      method: 'card_transfer',
      method_display: 'کارت به کارت',
      status: 'failed',
      status_display: 'ناموفق',
    })
    serve(mocks.bffFetch, {
      [HISTORY]: () => ok(page([card])),
      'payment/history/card-1/': () =>
        ok({
          uuid: 'card-1',
          status: 'failed',
          failure_reason: 'payment_receipt_rejected',
          order_code: CODE,
          card_transfer_receipt: {
            uuid: 'r',
            status: 'rejected',
            paid_at: '2026-08-11T12:00:00+03:30',
            image_thumbnail: null,
            rejection_reason_code: 'amount_mismatch',
            rejection_reason: 'مبلغ واریزی با سفارش یکی نیست.',
            reviewed_at: '2026-08-11T14:00:00+03:30',
          },
        }),
    })
    renderAccount(<OrderPayments code={CODE} />)
    const item = await screen.findByRole('listitem')
    expect(await within(item).findByText(/رسید: رد شده/)).toBeVisible()
    expect(item).toHaveTextContent('مغایرت مبلغ')
    expect(item).toHaveTextContent('مبلغ واریزی با سفارش یکی نیست.')
  })

  it('no payment yet: said so; unreadable: «تلاش دوباره» in its place', async () => {
    serve(mocks.bffFetch, { [HISTORY]: () => ok(page([])) })
    const { unmount } = renderAccount(<OrderPayments code={CODE} />)
    expect(await screen.findByText('هنوز پرداختی برای این سفارش ثبت نشده است.')).toBeVisible()
    unmount()
    serve(mocks.bffFetch, { [HISTORY]: () => refuse(404, 'not_found') })
    renderAccount(<OrderPayments code={CODE} />)
    expect(await screen.findByText('پرداخت‌های سفارش بارگذاری نشد.')).toBeVisible()
  })
})
