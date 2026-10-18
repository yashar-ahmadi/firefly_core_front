import { act, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { savePending } from '@/features/payment/pending-payments'
import linkOpenCard from '../../fixtures/order-pay-link-open-card.json'
import rejected from '../../fixtures/payment-status-receipt-rejected.json'
import {
  calls,
  ok,
  renderTransfer,
  serve,
  STATUS,
  status,
  stubTransferApis,
} from './card-transfer-support'
import { LINK_TOKEN, PAYMENT_UUID } from './fixtures'

// What the card-transfer page reads and says on its views other than the form (order digest
// §5.7): the attempt's own cut-off is only the form's (no link-page read on the review, rejected
// or closed views), and a refunded payment is said as what it is, with no «پرداخت دوباره».

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), loadPage: vi.fn(), probe: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/lib/navigation/hard-navigation', () => ({
  loadPage: mocks.loadPage,
  reloadPage: vi.fn(),
}))
vi.mock('@/features/payment/card-transfer/receipt-image', () => ({ probeImage: mocks.probe }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/payment/card-transfer/x/',
}))

stubTransferApis()

const LINK = `order/pay/${LINK_TOKEN}/`

beforeEach(() => {
  localStorage.clear()
  mocks.bffFetch.mockReset()
  savePending(PAYMENT_UUID, {
    kind: 'order',
    orderCode: '1411635340',
    linkToken: LINK_TOKEN,
    route: 'card_transfer',
    amount: 1_049_000,
    startedAt: Date.now(),
  })
})

describe('the cut-off is the form’s', () => {
  it('the form: the link page is read for it', async () => {
    serve(mocks.bffFetch, { [LINK]: () => ok(linkOpenCard.data) })
    await renderTransfer()
    await act(async () => {})
    expect(calls(mocks.bffFetch, LINK)).toHaveLength(1)
  })

  it.each([
    ['under review', () => ok(status({ status: 'awaiting_review' }))],
    ['rejected', () => ok(rejected.data)],
    [
      'closed',
      () => ok(status({ status: 'cancelled', failure_reason: 'payment_attempt_expired' })),
    ],
    ['refunded', () => ok(status({ status: 'refunded' }))],
  ])('%s: no link-page read', async (_, answer) => {
    serve(mocks.bffFetch, { [STATUS]: answer, [LINK]: () => ok(linkOpenCard.data) })
    await renderTransfer()
    await act(async () => {})
    expect(calls(mocks.bffFetch, LINK)).toHaveLength(0)
  })
})

describe('a refunded payment', () => {
  it('says the money was given back, with tracking and the support line, and no pay again', async () => {
    serve(mocks.bffFetch, { [STATUS]: () => ok(status({ status: 'refunded' })) })
    await renderTransfer()
    expect(
      screen.getByRole('heading', { level: 1, name: 'مبلغ این پرداخت بازگردانده شد' }),
    ).toBeVisible()
    expect(document.body).toHaveTextContent('به حساب شما بازگردانده شده است')
    expect(screen.queryByRole('button', { name: 'پرداخت دوباره' })).toBeNull()
    expect(screen.queryByRole('link', { name: 'پرداخت با روش دیگر' })).toBeNull()
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(screen.getByRole('link', { name: '۰۲۱ ۹۱۰۰ ۰۰۰۰' })).toBeVisible()
  })

  it('reached while the receipt was under review: the same, said once', async () => {
    vi.useFakeTimers()
    let reads = 0
    serve(mocks.bffFetch, {
      [STATUS]: () => ok(status({ status: reads++ < 2 ? 'awaiting_review' : 'refunded' })),
    })
    await renderTransfer()
    await act(async () => void (await vi.advanceTimersByTimeAsync(15_000)))
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent(
      'مبلغ این پرداخت بازگردانده شد',
    )
    expect(screen.queryByRole('button', { name: 'پرداخت دوباره' })).toBeNull()
    vi.useRealTimers()
  })
})
