import { act, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { savePending } from '@/features/payment/pending-payments'
import { ApiError } from '@/lib/api/errors'
import linkOpenCard from '../../fixtures/order-pay-link-open-card.json'
import rejected from '../../fixtures/payment-status-receipt-rejected.json'
import {
  CANCEL,
  calls,
  ok,
  renderTransfer,
  serve,
  STATUS,
  status,
  stubTransferApis,
} from './card-transfer-support'
import { LINK_TOKEN, PAYMENT_UUID } from './fixtures'

// Being answered with the session is not ownership (order digest §11 #7): a guest order's payment
// has no owner, so a signed-in visitor paying it reads it with the session. The card-transfer
// page offers the account's order pages, the owner's door and the rejection's history read only
// once `GET order/<code>/` answered for this account (read once per page, also giving the link
// for the cut-off and the cancel); otherwise tracking, or the order's link page.

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

const ORDER = 'order/1411635340/'
const ORDER_UUID = '5e1c0a2b-3d4e-4f60-8a1b-2c3d4e5f6a7b'
const HISTORY = `payment/history/${PAYMENT_UUID}/`
const LINK = `order/pay/${LINK_TOKEN}/`
const notMine = () => Promise.reject(new ApiError({ status: 404, code: 'not_found' }))
const mine = () =>
  ok({ uuid: ORDER_UUID, payment_url: `http://localhost:3000/order/pay/${LINK_TOKEN}` })
const accountLinks = () => document.querySelectorAll('a[href^="/account/"]')

beforeEach(() => {
  localStorage.clear()
  mocks.bffFetch.mockReset()
  mocks.loadPage.mockReset()
})

describe('signed in, paying a guest’s order (answered with the session)', () => {
  it('under review: tracking, no account order page', async () => {
    serve(mocks.bffFetch, {
      [STATUS]: () => ok(status({ status: 'awaiting_review' })),
      [ORDER]: notMine,
    })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(screen.queryByRole('link', { name: 'مشاهدهٔ سفارش' })).toBeNull()
    expect(accountLinks()).toHaveLength(0)
    expect(calls(mocks.bffFetch, ORDER)).toHaveLength(1)
  })

  it('rejected: no history read (the SMS sentence), and «پرداخت دوباره» only through its link', async () => {
    savePending(PAYMENT_UUID, {
      kind: 'order',
      orderCode: '1411635340',
      linkToken: LINK_TOKEN,
      route: 'card_transfer',
      amount: 1_049_000,
      startedAt: Date.now(),
    })
    serve(mocks.bffFetch, { [STATUS]: () => ok(rejected.data), [ORDER]: notMine })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    expect(screen.getByText(/دلیل رد رسید با پیامک برایتان فرستاده شده است/)).toBeVisible()
    expect(calls(mocks.bffFetch, HISTORY)).toHaveLength(0)
    expect(screen.getByRole('button', { name: 'پرداخت دوباره' })).toBeVisible()
    expect(screen.getByRole('link', { name: 'پرداخت با روش دیگر' })).toHaveAttribute(
      'href',
      `/order/pay/${LINK_TOKEN}/`,
    )
    expect(accountLinks()).toHaveLength(0)
  })

  it('closed, nothing kept here: no door, no account page', async () => {
    serve(mocks.bffFetch, {
      [STATUS]: () =>
        ok(status({ status: 'cancelled', failure_reason: 'payment_attempt_expired' })),
      [ORDER]: notMine,
    })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    expect(screen.getByRole('heading', { level: 1, name: 'این پرداخت بسته شده است' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'پرداخت دوباره' })).toBeNull()
    expect(document.body).toHaveTextContent('لینک پرداختی را که با پیامک')
    expect(accountLinks()).toHaveLength(0)
  })
})

describe('signed in, the order’s owner', () => {
  it('rejected: the reason read from the history, the account’s order page for another route', async () => {
    serve(mocks.bffFetch, {
      [STATUS]: () => ok(rejected.data),
      [ORDER]: mine,
      [HISTORY]: () =>
        ok({
          uuid: PAYMENT_UUID,
          card_transfer_receipt: {
            rejection_reason_code: 'duplicate',
            rejection_reason: 'این رسید پیش‌تر ثبت شده است.',
          },
        }),
    })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    expect(screen.getByText(/دلیل رد رسید: رسید تکراری/)).toBeVisible()
    expect(screen.getByRole('link', { name: 'پرداخت با روش دیگر' })).toHaveAttribute(
      'href',
      '/account/orders/1411635340/',
    )
    expect(calls(mocks.bffFetch, ORDER)).toHaveLength(1)
  })

  it('the form: one order read gives the cut-off’s link and the cancel’s way back', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, {
      [ORDER]: mine,
      [LINK]: () => ok(linkOpenCard.data),
      [CANCEL]: () => ok(status({ status: 'cancelled' })),
    })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    expect(screen.getByText('مهلت واریز و ثبت رسید:')).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'انصراف از کارت به کارت' }))
    await screen.findByRole('dialog', { name: /انصراف می‌دهید/ })
    await user.click(screen.getByRole('button', { name: 'انصراف از پرداخت' }))
    await waitFor(() => expect(mocks.loadPage).toHaveBeenCalledWith(`/order/pay/${LINK_TOKEN}/`))
    expect(calls(mocks.bffFetch, ORDER)).toHaveLength(1)
  })
})
