import { act } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { readReceiverDraft, saveReceiverDraft } from '@/features/checkout/receiver-draft'
import { serve, setup, VALID_RECEIVER } from './checkout-hook-support'
import { address, addressCart, codCart, destinationCart } from './fixtures'

// The checkout's last two steps (Plan 4 Task 3): the payment step is done while a route the
// rules allow is chosen (the page says so: `paymentReady`), then the review is the step; and a
// placement the API refused for the guest's receiver sends the shopper back to the form with
// the API's messages on its fields.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

beforeEach(() => {
  mocks.bffFetch.mockReset()
  sessionStorage.clear()
})

const ready = () => addressCart(address(), { shipping: codCart().shipping })

describe('useCheckout’s payment and review steps', () => {
  it('payment is done while a route is ready; then the review leads, and payment reopens', () => {
    serve(mocks.bffFetch, ready)
    const { result, rerender } = setup(ready(), true, {}, { paymentReady: false })
    expect(result.current.checkout.step).toBe('payment')
    expect(result.current.checkout.done.payment).toBe(false)
    rerender({ paymentReady: true })
    expect(result.current.checkout.done.payment).toBe(true)
    expect(result.current.checkout.done.review).toBe(false)
    expect(result.current.checkout.step).toBe('review')
    act(() => result.current.checkout.edit('payment'))
    expect(result.current.checkout.step).toBe('payment')
    // A route that the rules no longer allow takes the shopper back to the payment step.
    act(() => result.current.checkout.finishEditing())
    rerender({ paymentReady: false })
    expect(result.current.checkout.step).toBe('payment')
  })

  it('the API refused the receiver: the form again, the API’s messages on its fields', () => {
    const cart = destinationCart({ shipping: codCart().shipping })
    serve(mocks.bffFetch, () => cart)
    saveReceiverDraft({ values: VALID_RECEIVER, confirmed: true })
    const { result } = setup(cart, false, {}, { paymentReady: true })
    expect(result.current.checkout.step).toBe('review')
    act(() =>
      result.current.checkout.reopenReceiver({ mobile: 'شمارهٔ موبایل ایران را وارد کنید.' }),
    )
    expect(result.current.checkout.step).toBe('receiver')
    expect(result.current.checkout.receiverErrors).toEqual({
      mobile: 'شمارهٔ موبایل ایران را وارد کنید.',
    })
    // The values stay; only «ادامه» is asked for again.
    expect(readReceiverDraft()).toMatchObject({ confirmed: false })
    expect(result.current.checkout.receiver.firstName).toBe('سارا')
    // A change to the form lets the API's messages go.
    act(() => result.current.checkout.setReceiver({ mobile: '09121234567' }))
    expect(result.current.checkout.receiverErrors).toEqual({})
  })
})
