import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPending, savePending } from '@/features/payment/pending-payments'
import { ApiError } from '@/lib/api/errors'
import rejected from '../../fixtures/payment-status-receipt-rejected.json'
import {
  CARDS,
  calls,
  fillReceipt,
  ok,
  RECEIPT,
  renderTransfer,
  serve,
  STATUS,
  stubTransferApis,
  submitButton,
} from './card-transfer-support'
import { PAYMENT_UUID } from './fixtures'

// A signed-in visitor paying another account's order by card transfer (order digest §3.2.7–3.2.8):
// the uuid alone reaches the payment, signed in or not and whosever it is (BACKEND-ISSUES M-7,
// fixed), so every call of the page goes with the session, once: no 403 to answer, no second try
// without the session. Whose order it is comes from the order's own read (404: not this
// account's): the page then offers none of the account's pages for that payment.

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

const HISTORY = `payment/history/${PAYMENT_UUID}/`
const ORDER = 'order/1411635340/'
const RECEIPT_201 = {
  uuid: '7c2e0f5a-1b3d-4e6f-8a9b-0c1d2e3f4a5b',
  status: 'awaiting_review',
  paid_at: '2026-10-18T09:30:00+03:30',
  image_thumbnail: null,
  rejection_reason_code: null,
  rejection_reason: '',
  reviewed_at: null,
}
const notOwn = () => Promise.reject(new ApiError({ status: 404, code: 'not_found' }))
/** Every call made with the session: no flag of the old anonymous retry in its query. */
const withSession = (path: string) =>
  calls(mocks.bffFetch, path).every(([, init]) => init.query === undefined)
const accountLinks = () => document.querySelectorAll('a[href^="/account/"]')

beforeEach(() => {
  localStorage.clear()
  mocks.bffFetch.mockReset()
  mocks.loadPage.mockReset()
  mocks.probe.mockReset()
  mocks.probe.mockResolvedValue({ ok: true, width: 1080, height: 1920 })
})

describe('signed in, another account’s payment', () => {
  it('the status and the cards are read once, with the session: the form', async () => {
    serve(mocks.bffFetch, { [ORDER]: notOwn })
    await renderTransfer({ hasSession: true })
    expect(screen.getByRole('button', { name: 'ثبت رسید' })).toBeVisible()
    expect(screen.getByRole('article', { name: 'بانک ملت' })).toBeVisible()
    expect(calls(mocks.bffFetch, STATUS)).toHaveLength(1)
    expect(calls(mocks.bffFetch, CARDS)).toHaveLength(1)
    expect(withSession(STATUS) && withSession(CARDS)).toBe(true)
  })

  it('the receipt goes once, with the session; the outcome offers tracking, no account page', async () => {
    const user = userEvent.setup()
    const receipt = vi.fn(() => ok(RECEIPT_201, 201))
    serve(mocks.bffFetch, { [RECEIPT]: receipt, [ORDER]: notOwn })
    await renderTransfer({ hasSession: true })
    await fillReceipt(user)
    await user.click(submitButton())
    expect(
      await screen.findByRole('heading', { level: 1, name: 'رسید ثبت شد و در صف بررسی است' }),
    ).toBeVisible()
    expect(receipt).toHaveBeenCalledTimes(1)
    expect(withSession(RECEIPT)).toBe(true)
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(accountLinks()).toHaveLength(0)
  })

  it('a card refused at upload: the cards are read again, with the session', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, {
      [RECEIPT]: () =>
        Promise.reject(new ApiError({ status: 400, code: 'payment_destination_card_invalid' })),
      [ORDER]: notOwn,
    })
    await renderTransfer({ hasSession: true })
    await fillReceipt(user)
    await user.click(submitButton())
    await act(async () => {})
    expect(calls(mocks.bffFetch, CARDS)).toHaveLength(2)
    expect(withSession(CARDS)).toBe(true)
  })

  it('a rejected receipt: no history read, the SMS sentence and tracking, no account links', async () => {
    savePending(PAYMENT_UUID, {
      kind: 'order',
      orderCode: '1411635340',
      orderUuid: '5e1c0a2b-3d4e-4f60-8a1b-2c3d4e5f6a7b',
      route: 'card_transfer',
      amount: 1_049_000,
      startedAt: Date.now(),
    })
    serve(mocks.bffFetch, { [STATUS]: () => ok(rejected.data), [ORDER]: notOwn })
    await renderTransfer({ hasSession: true })
    await act(async () => {})
    expect(screen.getByRole('heading', { level: 1, name: 'رسید پذیرفته نشد' })).toBeVisible()
    expect(screen.getByText(/دلیل رد رسید با پیامک برایتان فرستاده شده است/)).toBeVisible()
    // The order's own read said whose it is (404: not this account's).
    expect(calls(mocks.bffFetch, ORDER)).toHaveLength(1)
    expect(calls(mocks.bffFetch, HISTORY)).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(accountLinks()).toHaveLength(0)
    // The owner's door (the order's uuid) is not this account's: no «پرداخت دوباره» through it.
    expect(screen.queryByRole('button', { name: 'پرداخت دوباره' })).toBeNull()
  })

  it('a 403 (none comes any more): the calm page, offering a read again', async () => {
    const refused = () => Promise.reject(new ApiError({ status: 403, code: 'forbidden' }))
    serve(mocks.bffFetch, { [STATUS]: refused, [CARDS]: refused })
    await renderTransfer({ hasSession: true })
    expect(
      screen.getByRole('heading', { level: 1, name: 'اطلاعات پرداخت خوانده نشد' }),
    ).toBeVisible()
    expect(screen.getByRole('button', { name: 'تلاش دوباره' })).toBeVisible()
    expect(calls(mocks.bffFetch, CARDS)).toHaveLength(1)
  })
})

describe('a status 404 with the cards answered', () => {
  it('the calm page («پیدا نشد»), and the pending entry is kept (the cards exist)', async () => {
    savePending(PAYMENT_UUID, {
      kind: 'order',
      orderCode: '1411635340',
      linkToken: 'tok',
      route: 'card_transfer',
      amount: 1_049_000,
      startedAt: Date.now(),
    })
    serve(mocks.bffFetch, {
      [STATUS]: () => Promise.reject(new ApiError({ status: 404, code: 'payment_not_found' })),
    })
    await renderTransfer()
    expect(screen.getByRole('heading', { level: 1, name: 'این پرداخت پیدا نشد' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'ثبت رسید' })).toBeNull()
    expect(getPending(PAYMENT_UUID)).not.toBeNull()
  })
})
