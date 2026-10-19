import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getPending, savePending, type PendingPayment } from '@/features/payment/pending-payments'
import { saveGuestOrder } from '@/features/orders/guest-orders'
import { ApiError } from '@/lib/api/errors'
import { BANK_LEAVING_MS, LEAVING_MS } from '@/lib/navigation/leaving'
import { stubBrowserApis } from '../support/dom-stubs'
import { handoff, intent, LINK_TOKEN, PAYMENT_UUID } from './fixtures'
import { arrive, ok, renderResult, serve, status } from './result-support'

// «پرداخت دوباره» after a failed bank payment (order digest §5.10 step 4): a NEW attempt with a
// new Idempotency-Key per press, through the door this device knows (the pending payment's link
// token, a recent guest order's token, or, for the order's confirmed owner, its uuid read on
// arrival: result-ownership.test.tsx); the pending payment saved before the bank. No door known: never made up, the shopper is
// sent to tracking or the SMS link. A payment that went through forgets its pending entry and
// throws confetti, never under reduced motion.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), goToBank: vi.fn(), confetti: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: mocks.goToBank }))
vi.mock('@/features/payment/confetti', () => ({ burstConfetti: mocks.confetti }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/payment/callback/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

const media = stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.goToBank.mockReset()
  mocks.confetti.mockReset()
  media.set(() => false)
  localStorage.clear()
  sessionStorage.clear()
})
afterEach(() => vi.useRealTimers())

const NEW_UUID = '5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9'
const ORDER_UUID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const LINK_INTENT = `payment/link/${LINK_TOKEN}/intent/`
const rejected = () => status({ status: 'failed', failure_reason: 'gateway_rejected' })
const opened = () =>
  ok(
    intent('bank_gateway', { payment: { ...intent('bank_gateway').payment!, uuid: NEW_UUID } }),
    201,
  )
const keep = (changes: Partial<PendingPayment>) =>
  savePending(PAYMENT_UUID, {
    kind: 'order',
    orderCode: '1411635340',
    route: 'bank_gateway',
    amount: 1_049_000,
    startedAt: Date.now(),
    ...changes,
  })
const payAgain = () => screen.getByRole('button', { name: 'پرداخت دوباره' })
const keyOf = (call: unknown[] | undefined) =>
  (call?.[1] as { idempotencyKey?: string }).idempotencyKey

describe('a door this device knows', () => {
  it('the pending payment’s link: a new attempt, its pending payment saved, then the bank', async () => {
    const user = userEvent.setup()
    keep({ linkToken: LINK_TOKEN })
    const pay = vi.fn(async () => opened())
    serve(mocks.bffFetch, [rejected()], { [LINK_INTENT]: pay })
    arrive(`?result=failed&payment=${PAYMENT_UUID}&code=gateway_rejected`)
    await renderResult()
    await user.click(payAgain())
    await user.click(payAgain())
    expect(pay).toHaveBeenCalledTimes(1)
    expect(mocks.bffFetch.mock.calls.find(([path]) => path === LINK_INTENT)?.[1]).toMatchObject({
      body: { route: 'bank_gateway' },
    })
    expect(getPending(NEW_UUID)).toMatchObject({ linkToken: LINK_TOKEN, orderCode: '1411635340' })
    expect(mocks.goToBank).toHaveBeenCalledWith(handoff())
    // Another route: the link's page, a full page load (its URL holds the token).
    const other = screen.getByRole('link', { name: 'پرداخت با روش دیگر' })
    expect(other).toHaveAttribute('href', `/order/pay/${LINK_TOKEN}/`)
  })

  it('a refused press is said; the next press has a new key', async () => {
    const user = userEvent.setup()
    keep({ linkToken: LINK_TOKEN })
    const pay = vi
      .fn()
      .mockImplementationOnce(() =>
        Promise.reject(new ApiError({ status: 502, code: 'gateway_rejected' })),
      )
      .mockImplementationOnce(async () => opened())
    serve(mocks.bffFetch, [rejected()], { [LINK_INTENT]: pay })
    arrive(`?result=failed&payment=${PAYMENT_UUID}&code=gateway_rejected`)
    await renderResult()
    await user.click(payAgain())
    expect(await screen.findByRole('alert')).toHaveTextContent('بانک تراکنش را نپذیرفت')
    await user.click(payAgain())
    const calls = mocks.bffFetch.mock.calls.filter(([path]) => path === LINK_INTENT)
    expect(calls).toHaveLength(2)
    expect(keyOf(calls[0])).toBeTruthy()
    expect(keyOf(calls[1])).not.toBe(keyOf(calls[0]))
  })

  it('a guest with no pending payment here: the recent guest order’s link', async () => {
    const user = userEvent.setup()
    saveGuestOrder({
      orderCode: '1411635340',
      linkToken: LINK_TOKEN,
      expiresAt: null,
      A: 1_049_000,
      D: 0,
      placedAt: '2026-10-18T10:00:00+03:30',
    })
    const pay = vi.fn(async () => opened())
    serve(mocks.bffFetch, [rejected()], { [LINK_INTENT]: pay })
    arrive(`?result=failed&payment=${PAYMENT_UUID}&code=gateway_rejected`)
    await renderResult()
    await user.click(payAgain())
    expect(pay).toHaveBeenCalledTimes(1)
  })

  it('signed in, the order this account’s: the owner’s door, its uuid from the read on arrival', async () => {
    const user = userEvent.setup()
    const pay = vi.fn(async () => opened())
    serve(mocks.bffFetch, [rejected()], {
      'order/1411635340/': async () => ok({ uuid: ORDER_UUID, payment_url: null }),
      [`payment/order/${ORDER_UUID}/intent/`]: pay,
    })
    arrive(`?result=failed&payment=${PAYMENT_UUID}&code=gateway_rejected`)
    await renderResult({ hasSession: true })
    await act(async () => {})
    await user.click(payAgain())
    expect(pay).toHaveBeenCalledTimes(1)
    expect(getPending(NEW_UUID)).toMatchObject({ orderUuid: ORDER_UUID })
  })
})

describe('while the bank’s page loads', () => {
  it('the press stays taken for the bank’s longer bound, then comes back', async () => {
    vi.useFakeTimers()
    keep({ linkToken: LINK_TOKEN })
    serve(mocks.bffFetch, [rejected()], { [LINK_INTENT]: async () => opened() })
    arrive(`?result=failed&payment=${PAYMENT_UUID}&code=gateway_rejected`)
    await renderResult()
    const tick = (ms: number) => act(async () => void (await vi.advanceTimersByTimeAsync(ms)))
    act(() => payAgain().click())
    for (let i = 0; i < 20 && mocks.goToBank.mock.calls.length === 0; i++) await tick(1)
    expect(mocks.goToBank).toHaveBeenCalledTimes(1)
    await tick(LEAVING_MS + 1_000)
    expect(payAgain()).toHaveAttribute('aria-disabled', 'true')
    await tick(BANK_LEAVING_MS - LEAVING_MS)
    expect(payAgain()).not.toHaveAttribute('aria-disabled')
  })
})

describe('no door known (another device)', () => {
  it('a guest: no «پرداخت دوباره», sent to the SMS link and tracking instead', async () => {
    serve(mocks.bffFetch, [rejected()])
    arrive(`?result=failed&payment=${PAYMENT_UUID}&code=gateway_rejected`)
    await renderResult()
    expect(screen.queryByRole('button', { name: 'پرداخت دوباره' })).not.toBeInTheDocument()
    expect(document.body).toHaveTextContent('لینک پرداختی را که با پیامک')
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
  })
})

describe('a payment that went through', () => {
  it('forgets its pending entry and throws confetti once', async () => {
    keep({ linkToken: LINK_TOKEN })
    serve(mocks.bffFetch, [status({ status: 'settled' })])
    arrive(`?result=success&payment=${PAYMENT_UUID}`)
    await renderResult()
    await act(async () => {})
    expect(getPending(PAYMENT_UUID)).toBeNull()
    expect(mocks.confetti).toHaveBeenCalledTimes(1)
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toBeInTheDocument()
  })

  it('no confetti under reduced motion (its code is not even loaded)', async () => {
    media.set((query) => query.includes('prefers-reduced-motion'))
    serve(mocks.bffFetch, [status({ status: 'settled' })], {
      'order/1411635340/': async () => ok({ uuid: ORDER_UUID, payment_url: null }),
    })
    arrive(`?result=success&payment=${PAYMENT_UUID}`)
    await renderResult({ hasSession: true })
    await act(async () => {})
    expect(screen.getByRole('link', { name: 'مشاهدهٔ سفارش' })).toHaveAttribute(
      'href',
      '/account/orders/1411635340/',
    )
    expect(mocks.confetti).not.toHaveBeenCalled()
  })
})
