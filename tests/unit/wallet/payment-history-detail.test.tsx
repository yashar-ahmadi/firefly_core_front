import { screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PaymentHistoryDetail } from '@/features/wallet/payment-history-detail'
import type { PaymentHistoryFull } from '@/lib/api/types/wallet'
import { stubBrowserApis } from '../support/dom-stubs'
import { posDetail, topUpDetail } from './fixtures'
import { ok, refuse, renderWallet } from './wallet-support'

// One payment's detail (order digest §3.2.10, §2.1, §8.6), in a sheet: method, status, amount,
// when it was made and settled, the bank's receipt (gateway, tracking code kept as a string,
// settlement reference, masked card), a card transfer's receipt with its state and, when it was
// turned down, why; why a payment failed or closed, in the shopper's words; a payment the shop
// recorded (terminal, card digits); an unknown method shown generically. 404: «پیدا نشد».

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/account/wallet/',
}))

const UUID = '0a9e0001-0000-4000-8000-000000000001'

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
})

function renderDetail(answer: () => Promise<unknown>) {
  mocks.bffFetch.mockImplementation((path: string) =>
    path === `payment/history/${UUID}/` ? answer() : new Promise(() => {}),
  )
  renderWallet(<PaymentHistoryDetail uuid={UUID} open onOpenChange={vi.fn()} />)
}

const sheet = () => screen.findByRole('dialog', { name: 'جزئیات پرداخت' })
const detail = (changes: Partial<PaymentHistoryFull>) => ({ ...topUpDetail(), ...changes })

describe('PaymentHistoryDetail', () => {
  it('a top-up by bank: what, how, status, amount, dates, and the bank’s receipt', async () => {
    renderDetail(() => ok(topUpDetail()))
    const panel = await sheet()
    expect(await within(panel).findByText('شارژ کیف پول')).toBeVisible()
    expect(panel).toHaveTextContent('درگاه بانکی')
    expect(panel).toHaveTextContent('تسویه شده')
    expect(panel).toHaveTextContent('۶۰٬۰۰۰٬۰۰۰ تومان')
    expect(panel).toHaveTextContent('زرین پال')
    expect(panel).toHaveTextContent('۹۶۹۸۵۸۵۶۷۳۱۶۷۸۸۸۸۴')
    expect(panel).toHaveTextContent('۱۰۶۸۰۹۸۷۷۹')
    expect(panel).toHaveTextContent('۶۱۳۸****۷۱۷۴')
    expect(panel).toHaveTextContent('۱۴ تیر ۱۴۰۵')
  })

  it('a tracking code keeps its leading zeros', async () => {
    const base = topUpDetail()
    renderDetail(() => ok(detail({ receipt: { ...base.receipt!, tracking_code: '000123' } })))
    expect(await within(await sheet()).findByText('۰۰۰۱۲۳')).toBeVisible()
  })

  it('a payment the shop recorded (a card reader): its terminal and card digits; its order', async () => {
    renderDetail(() => ok(posDetail()))
    const panel = await sheet()
    expect(await within(panel).findByText('کارتخوان')).toBeVisible()
    expect(panel).toHaveTextContent('۵۱۳۶۸۴۲۴۰۴')
    expect(panel).toHaveTextContent('۶۹۷۸')
    expect(within(panel).getByRole('link', { name: /سفارش ۶۱۳۸۰۷۸۹۸۹/ })).toHaveAttribute(
      'href',
      '/account/orders/6138078989/',
    )
  })

  it('a rejected card-transfer receipt: its state, the reason’s label and the shop’s words', async () => {
    renderDetail(() =>
      ok(
        detail({
          method: 'card_transfer',
          method_display: 'کارت به کارت',
          status: 'failed',
          status_display: 'ناموفق',
          applies_to: 'online_charge',
          applies_to_display: 'پرداخت آنلاین سفارش',
          receipt: null,
          failure_reason: 'payment_receipt_rejected',
          card_transfer_receipt: {
            uuid: 'r1',
            status: 'rejected',
            paid_at: '2026-10-10T10:00:00+03:30',
            image_thumbnail: null,
            rejection_reason_code: 'amount_mismatch',
            rejection_reason: 'مبلغ واریزی با مبلغ سفارش یکی نیست.',
            reviewed_at: '2026-10-11T10:00:00+03:30',
          },
        }),
      ),
    )
    const panel = await sheet()
    expect(await within(panel).findByText(/رسید کارت به کارت این پرداخت پذیرفته نشد/)).toBeVisible()
    expect(panel).toHaveTextContent('رد شده')
    expect(panel).toHaveTextContent('مغایرت مبلغ')
    expect(panel).toHaveTextContent('مبلغ واریزی با مبلغ سفارش یکی نیست.')
  })

  it.each([
    ['payment_attempt_expired', 'مهلت این تلاش پرداخت تمام شد'],
    ['gateway_capture_not_bookable', 'حداکثر ظرف ۷۲ ساعت'],
    ['gateway_unavailable', 'درگاه پاسخ نداد؛ مبلغی کسر نشده.'],
    ['something_new', 'این پرداخت انجام نشد.'],
  ])('failure %s: said in the shopper’s words', async (reason, text) => {
    renderDetail(() =>
      ok(detail({ status: 'failed', status_display: 'ناموفق', failure_reason: reason })),
    )
    expect(await within(await sheet()).findByText(new RegExp(text))).toBeVisible()
  })

  it('an unknown method without words: shown generically', async () => {
    renderDetail(() => ok(detail({ method: 'crypto', method_display: '' })))
    expect(await within(await sheet()).findByText('پرداخت ثبت‌شده')).toBeVisible()
  })

  it('404 (not this account’s, or gone): «پیدا نشد»', async () => {
    renderDetail(() => refuse(404, 'not_found', 'یافت نشد.'))
    expect(await within(await sheet()).findByText('این پرداخت پیدا نشد.')).toBeVisible()
  })
})
