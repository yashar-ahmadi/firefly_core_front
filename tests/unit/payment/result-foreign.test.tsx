import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPending, savePending } from '@/features/payment/pending-payments'
import { COPY } from '@/features/payment/result-copy'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { intent, LINK_TOKEN, PAYMENT_UUID } from './fixtures'
import { arrive, ok, renderResult, serve, status } from './result-support'

// A signed-in shopper paying someone else's order through its link (another account's, or a
// guest's: order digest §11 #7). The status answers with the session, whosever the payment
// (BACKEND-ISSUES M-7, fixed); whose order it is comes from the order's own read, which answers
// its owner only (404 here): the page offers none of the account's pages for it, not even the
// account's list of orders. Tracking, or the order's link page when this device knows it.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: vi.fn() }))
vi.mock('@/features/payment/confetti', () => ({ burstConfetti: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/payment/callback/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  localStorage.clear()
  sessionStorage.clear()
})

const NEW_UUID = '5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9'
const LINK_INTENT = `payment/link/${LINK_TOKEN}/intent/`
const ORDER = 'order/1411635340/'
/** The order's read: another account's, so not this one's. */
const notOwn = { [ORDER]: () => Promise.reject(new ApiError({ status: 404, code: 'not_found' })) }
const rejected = () => status({ status: 'failed', failure_reason: 'gateway_rejected' })
const FAILED = `?result=failed&payment=${PAYMENT_UUID}&code=gateway_rejected`
const accountLinks = () => document.querySelectorAll('a[href^="/account/"]')
const lookups = () => mocks.bffFetch.mock.calls.filter(([path]) => path === ORDER)

describe('signed in, paying someone else’s order', () => {
  it('paid: tracking, never the account’s order page', async () => {
    serve(mocks.bffFetch, [status({ status: 'settled' })], notOwn)
    arrive(`?result=success&payment=${PAYMENT_UUID}`)
    await renderResult({ hasSession: true })
    expect(await screen.findByRole('link', { name: 'پیگیری سفارش' })).toBeVisible()
    expect(screen.getByRole('heading', { level: 1 })).toHaveTextContent('پرداخت موفق')
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(screen.queryByRole('link', { name: 'مشاهدهٔ سفارش' })).not.toBeInTheDocument()
    expect(accountLinks()).toHaveLength(0)
  })

  it('refused by the bank, its link kept here: «پرداخت دوباره» and another route, both through the link', async () => {
    const user = userEvent.setup()
    savePending(PAYMENT_UUID, {
      kind: 'order',
      orderCode: '1411635340',
      linkToken: LINK_TOKEN,
      route: 'bank_gateway',
      amount: 1_049_000,
      startedAt: Date.now(),
    })
    const opened = intent('bank_gateway', {
      payment: { ...intent('bank_gateway').payment!, uuid: NEW_UUID },
    })
    const pay = vi.fn(async () => ok(opened, 201))
    serve(mocks.bffFetch, [rejected()], { ...notOwn, [LINK_INTENT]: pay })
    arrive(FAILED)
    await renderResult({ hasSession: true })
    expect(await screen.findByRole('link', { name: 'پرداخت با روش دیگر' })).toHaveAttribute(
      'href',
      `/order/pay/${LINK_TOKEN}/`,
    )
    expect(accountLinks()).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'پرداخت دوباره' }))
    expect(pay).toHaveBeenCalledTimes(1)
    expect(getPending(NEW_UUID)).toMatchObject({ linkToken: LINK_TOKEN })
    expect(lookups()).toHaveLength(1)
  })

  it('refused by the bank, nothing kept here: one order lookup, sent to the link and tracking', async () => {
    serve(mocks.bffFetch, [rejected()], notOwn)
    arrive(FAILED)
    await renderResult({ hasSession: true })
    expect(await screen.findByRole('link', { name: 'پیگیری سفارش' })).toBeVisible()
    expect(screen.queryByRole('button', { name: 'پرداخت دوباره' })).not.toBeInTheDocument()
    expect(document.body).toHaveTextContent('لینک پرداختی را که با پیامک')
    expect(document.body).not.toHaveTextContent('به صفحهٔ سفارش بروید')
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(accountLinks()).toHaveLength(0)
    expect(lookups()).toHaveLength(1)
  })

  it('a return without its order’s code (unknown callback): «سفارش‌های من» still offered', async () => {
    arrive('?result=failed&code=gateway_callback_invalid')
    await renderResult({ hasSession: true })
    expect(screen.getByRole('link', { name: 'سفارش\u{200C}های من' })).toHaveAttribute(
      'href',
      '/account/orders/',
    )
  })

  it.each([
    ['another account’s order: tracking only', notOwn, false],
    [
      'the account’s own order: its list too',
      { [ORDER]: async () => ok({ uuid: 'f00d', payment_url: null }) },
      true,
    ],
  ])('stopped after 15 minutes, %s', async (_, routes, listed) => {
    vi.useFakeTimers()
    try {
      serve(mocks.bffFetch, [status()], routes)
      arrive(`?result=success&payment=${PAYMENT_UUID}`)
      await renderResult({ hasSession: true })
      await act(async () => void (await vi.advanceTimersByTimeAsync(15 * 60_000)))
      expect(document.body).toHaveTextContent(COPY.stopped)
      expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toBeVisible()
      expect(screen.queryByRole('link', { name: 'سفارش\u{200C}های من' }) !== null).toBe(listed)
    } finally {
      vi.useRealTimers()
    }
  })
})
