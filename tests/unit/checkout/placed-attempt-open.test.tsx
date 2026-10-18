import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import cancelled from '../../fixtures/payment-attempt-cancel.json'
import attemptOpen from '../../fixtures/payment-intent-attempt-open.json'
import { stubBrowserApis } from '../support/dom-stubs'
import { intent, LINK_TOKEN, PAYMENT_UUID } from '../payment/fixtures'
import { bankAttempt, expiredAttempt } from '../payment/link-fixtures'
import { ok, onlineCart, PLACE, placeButton, placed, renderCheckout, serve } from './place-support'

// The placed order's route meets an attempt still open (409 `payment_attempt_open`, order digest
// §5.9; Review Focus #2): the resume UI shows instead of an error (its code loads only now),
// and abandoning it pays again through the same door with a NEW key, never the refused click's.

const LINK_INTENT = `payment/link/${LINK_TOKEN}/intent/`
const CANCEL = `payment/${PAYMENT_UUID}/cancel/`
const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), push: vi.fn(), goToBank: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: mocks.push, replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/payment/go-to-bank', () => ({ goToBank: mocks.goToBank }))

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  mocks.push.mockReset()
  mocks.goToBank.mockReset()
  sessionStorage.clear()
  localStorage.clear()
})

const open = (attempt = expiredAttempt()) =>
  ApiError.fromBody(409, { ...attemptOpen, data: { ...attemptOpen.data, open_attempt: attempt } })

async function placeNow(user: ReturnType<typeof userEvent.setup>) {
  const button = await placeButton()
  await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
  await user.click(button)
}

describe('an attempt still open after placement', () => {
  it('shows the resume UI (no error); «انصراف و پرداخت دوباره» cancels, then pays with a new key', async () => {
    const user = userEvent.setup()
    const pay = vi
      .fn()
      .mockImplementationOnce(() => Promise.reject(open()))
      .mockImplementationOnce(() => Promise.resolve(ok(intent('bank_gateway'), 201)))
    const cancel = vi.fn(() => Promise.resolve({ ...ok(cancelled.data), msg: cancelled.msg }))
    serve(mocks.bffFetch, () => onlineCart(), {
      [PLACE]: placed(),
      [LINK_INTENT]: pay,
      [CANCEL]: cancel,
    })
    renderCheckout({ cart: onlineCart() })
    await placeNow(user)
    const panel = await screen.findByRole('region', { name: 'پرداخت باز این سفارش' })
    expect(panel).toHaveTextContent('مهلت انتقال به درگاه تمام شده است')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    // One open attempt per order: no routes to press meanwhile.
    expect(screen.queryByRole('button', { name: 'پرداخت سفارش' })).not.toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'انصراف و پرداخت دوباره' }))
    await waitFor(() => expect(mocks.goToBank).toHaveBeenCalledTimes(1))
    expect(cancel).toHaveBeenCalledTimes(1)
    const keys = pay.mock.calls.map(
      ([, init]) => (init as { idempotencyKey: string }).idempotencyKey,
    )
    expect(keys).toHaveLength(2)
    expect(keys[1]).toBeTruthy()
    expect(keys[1]).not.toBe(keys[0])
  })

  it('«انصراف» alone gives the routes back (nothing paid, no stale-route warning)', async () => {
    const user = userEvent.setup()
    const pay = vi.fn().mockImplementationOnce(() => Promise.reject(open(bankAttempt())))
    serve(mocks.bffFetch, () => onlineCart(), {
      [PLACE]: placed(),
      [LINK_INTENT]: pay,
      [CANCEL]: () => Promise.resolve({ ...ok(cancelled.data), msg: cancelled.msg }),
    })
    renderCheckout({ cart: onlineCart() })
    await placeNow(user)
    const panel = await screen.findByRole('region', { name: 'پرداخت باز این سفارش' })
    expect(within(panel).getByRole('button', { name: 'ادامه در زرین پال' })).toBeInTheDocument()
    await user.click(within(panel).getByRole('button', { name: 'انصراف' }))
    expect(await screen.findByRole('button', { name: 'پرداخت سفارش' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: 'پرداخت باز این سفارش' })).not.toBeInTheDocument()
    // The pressed control went away with the panel: the routes' heading takes the focus.
    expect(screen.getByRole('heading', { level: 3, name: 'پرداخت سفارش' })).toHaveFocus()
    expect(document.body).not.toHaveTextContent('روش پرداخت انتخابی شما برای مبلغ این سفارش')
    expect(pay).toHaveBeenCalledTimes(1)
    expect(mocks.goToBank).not.toHaveBeenCalled()
  })
})
