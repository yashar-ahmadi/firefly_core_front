import { act, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { getPending } from '@/features/payment/pending-payments'
import { saveGuestOrder } from '@/features/orders/guest-orders'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { intent, LINK_TOKEN, PAYMENT_UUID } from './fixtures'
import { arrive, ok, renderResult, serve, status } from './result-support'

// Being answered with the session is not ownership (order digest §11 #7; the backend checks the
// owner only when the payment has one, payment/services/access.py): a signed-in visitor paying a
// GUEST order reads its status with the session and is still not its owner. The result page
// offers the account's order pages, and the owner's door, only once `GET order/<code>/` answered
// for this account (read once per page); otherwise tracking, or the order's link.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), goToBank: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: mocks.goToBank }))
vi.mock('@/features/payment/confetti', () => ({ burstConfetti: vi.fn() }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/payment/callback/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.goToBank.mockReset()
  localStorage.clear()
  sessionStorage.clear()
})

const ORDER = 'order/1411635340/'
const ORDER_UUID = '9a1b2c3d-4e5f-4a6b-8c7d-0e1f2a3b4c5d'
const NEW_UUID = '5e6f7a8b-9c0d-4e1f-a2b3-c4d5e6f7a8b9'
const FAILED = `?result=failed&payment=${PAYMENT_UUID}&code=gateway_rejected`
const rejected = () => status({ status: 'failed', failure_reason: 'gateway_rejected' })
const notMine = () => Promise.reject(new ApiError({ status: 404, code: 'not_found' }))
const mine = () =>
  Promise.resolve(
    ok({ uuid: ORDER_UUID, payment_url: `http://localhost:3000/order/pay/${LINK_TOKEN}` }),
  )
const orderLinks = () => document.querySelectorAll('a[href^="/account/orders/1411635340"]')
const orderReads = () => mocks.bffFetch.mock.calls.filter(([path]) => path === ORDER)

describe('signed in, paying a guest’s order (its status answered with the session)', () => {
  it('paid: the order is read once, is not this account’s → tracking, no account order page', async () => {
    serve(mocks.bffFetch, [status({ status: 'settled' })], { [ORDER]: notMine })
    arrive(`?result=success&payment=${PAYMENT_UUID}`)
    await renderResult({ hasSession: true })
    await act(async () => {})
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toHaveAttribute(
      'href',
      '/order/track/',
    )
    expect(screen.queryByRole('link', { name: 'مشاهدهٔ سفارش' })).toBeNull()
    expect(orderLinks()).toHaveLength(0)
    expect(orderReads()).toHaveLength(1)
  })

  it('refused by the bank, its link kept on this device: «پرداخت دوباره» through the link', async () => {
    const user = userEvent.setup()
    saveGuestOrder({
      orderCode: '1411635340',
      linkToken: LINK_TOKEN,
      expiresAt: null,
      A: 1_049_000,
      D: 0,
      placedAt: '2026-10-18T10:00:00+03:30',
    })
    const link = `payment/link/${LINK_TOKEN}/intent/`
    const opened = intent('bank_gateway', {
      payment: { ...intent('bank_gateway').payment!, uuid: NEW_UUID },
    })
    const pay = vi.fn(async () => ok(opened, 201))
    serve(mocks.bffFetch, [rejected()], { [ORDER]: notMine, [link]: pay })
    arrive(FAILED)
    await renderResult({ hasSession: true })
    await act(async () => {})
    expect(screen.getByRole('link', { name: 'پرداخت با روش دیگر' })).toHaveAttribute(
      'href',
      `/order/pay/${LINK_TOKEN}/`,
    )
    expect(orderLinks()).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'پرداخت دوباره' }))
    expect(pay).toHaveBeenCalledTimes(1)
    expect(getPending(NEW_UUID)).toMatchObject({ linkToken: LINK_TOKEN })
    expect(orderReads()).toHaveLength(1)
  })

  it('refused by the bank, nothing kept here: no owner’s door; the SMS link and tracking', async () => {
    serve(mocks.bffFetch, [rejected()], { [ORDER]: notMine })
    arrive(FAILED)
    await renderResult({ hasSession: true })
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'پرداخت دوباره' })).toBeNull()
    expect(document.body).toHaveTextContent('لینک پرداختی را که با پیامک')
    expect(document.body).not.toHaveTextContent('به صفحهٔ سفارش بروید')
    expect(orderLinks()).toHaveLength(0)
  })

  it('the order could not be read (no answer): not confirmed, so tracking', async () => {
    serve(mocks.bffFetch, [status({ status: 'settled' })], {
      [ORDER]: () => Promise.reject(ApiError.network()),
    })
    arrive(`?result=success&payment=${PAYMENT_UUID}`)
    await renderResult({ hasSession: true })
    await act(async () => {})
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toBeVisible()
    expect(orderLinks()).toHaveLength(0)
  })
})

describe('signed in, the order’s owner (its order answered for this account)', () => {
  it('paid: «مشاهدهٔ سفارش» to the account’s order page', async () => {
    serve(mocks.bffFetch, [status({ status: 'settled' })], { [ORDER]: mine })
    arrive(`?result=success&payment=${PAYMENT_UUID}`)
    await renderResult({ hasSession: true })
    await act(async () => {})
    expect(screen.getByRole('link', { name: 'مشاهدهٔ سفارش' })).toHaveAttribute(
      'href',
      '/account/orders/1411635340/',
    )
  })

  it('refused by the bank: «پرداخت دوباره» through the uuid read on arrival (no second read)', async () => {
    const user = userEvent.setup()
    const pay = vi.fn(async () =>
      ok(
        intent('bank_gateway', { payment: { ...intent('bank_gateway').payment!, uuid: NEW_UUID } }),
        201,
      ),
    )
    serve(mocks.bffFetch, [rejected()], {
      [ORDER]: mine,
      [`payment/order/${ORDER_UUID}/intent/`]: pay,
    })
    arrive(FAILED)
    await renderResult({ hasSession: true })
    await act(async () => {})
    await user.click(screen.getByRole('button', { name: 'پرداخت دوباره' }))
    expect(pay).toHaveBeenCalledTimes(1)
    expect(getPending(NEW_UUID)).toMatchObject({ orderUuid: ORDER_UUID })
    expect(orderReads()).toHaveLength(1)
    expect(screen.getByRole('link', { name: 'پرداخت با روش دیگر' })).toHaveAttribute(
      'href',
      '/account/orders/1411635340/',
    )
  })

  it('the order read finds the session gone: the page turns into a guest’s', async () => {
    serve(mocks.bffFetch, [rejected()], {
      [ORDER]: () => Promise.reject(new ApiError({ status: 401, code: 'token_not_valid' })),
    })
    arrive(FAILED)
    await renderResult({ hasSession: true })
    await act(async () => {})
    expect(screen.queryByRole('button', { name: 'پرداخت دوباره' })).toBeNull()
    expect(document.body).toHaveTextContent('لینک پرداختی را که با پیامک')
    expect(orderLinks()).toHaveLength(0)
  })
})

describe('a guest', () => {
  it('reads no order at all', async () => {
    serve(mocks.bffFetch, [status({ status: 'settled' })], { [ORDER]: mine })
    arrive(`?result=success&payment=${PAYMENT_UUID}`)
    await renderResult()
    await act(async () => {})
    expect(orderReads()).toHaveLength(0)
    expect(screen.getByRole('link', { name: 'پیگیری سفارش' })).toBeVisible()
  })
})
