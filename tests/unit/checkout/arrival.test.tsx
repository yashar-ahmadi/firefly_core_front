import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { stubBrowserApis } from '../support/dom-stubs'
import { wallet } from '../payment/fixtures'
import { emptyCartFixture } from '../cart/fixtures'
import { GUEST_CHECKOUT_OFF } from './checkout-hook-support'
import { noDestinationCart } from './fixtures'
import { ok, renderCheckout, signedInCart } from './place-support'

// The checkout arrives with its open step's body in (Plan 5 Task 8 fix round): the page's
// skeleton stays until that body's code is loaded, so no step shows its own skeleton on arrival
// and nothing below it moves when the body comes (the shipping options, asked for after a
// refused default, pushed the later steps down: CLS 0.24 on a phone). A fresh module graph: no
// body loaded before this test.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
const loaded = vi.hoisted(() => new Set<string>())
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

for (const body of ['guest-receiver-form', 'address-picker', 'review-section', 'login-prompt']) {
  vi.doMock(`@/features/checkout/${body}`, async (importOriginal) => {
    loaded.add(body)
    return importOriginal()
  })
}

stubBrowserApis()

describe('the checkout’s arrival', () => {
  it('shows the steps once the open step’s body is in: no skeleton in its step', async () => {
    mocks.bffFetch.mockImplementation((path: string) => {
      if (path === 'cart/') return Promise.resolve(ok(signedInCart()))
      if (path === 'wallet/') return Promise.resolve(ok(wallet()))
      return new Promise(() => {})
    })
    renderCheckout({ cart: signedInCart(), hasSession: true })
    // As soon as the steps show: the review's body, not its skeleton.
    const review = await screen.findByRole('region', { name: /بازبینی/ })
    expect(within(review).queryByRole('status', { name: 'در حال بارگذاری' })).toBeNull()
    expect(within(review).getByRole('button', { name: /ثبت سفارش/ })).toBeInTheDocument()
  })

  it('an empty cart waits for no step: no body’s code is fetched', async () => {
    loaded.clear()
    const empty = emptyCartFixture()
    mocks.bffFetch.mockImplementation((path: string) =>
      path === 'cart/' ? Promise.resolve(ok(empty)) : new Promise(() => {}),
    )
    renderCheckout({ cart: empty, hasSession: true })
    expect(await screen.findByRole('link', { name: /صفحه\u{0654} اصلی/u })).toBeInTheDocument()
    await new Promise((resolve) => setTimeout(resolve, 50))
    expect([...loaded]).toEqual([])
  })

  it('a shop without guest orders: a guest’s page arrives with the login prompt, not the form', async () => {
    // The prompt was the receiver step's own code, on every checkout; the form's chunk was
    // fetched for it on arrival, though never shown (Plan 5 Task 9).
    loaded.clear()
    mocks.bffFetch.mockImplementation((path: string) =>
      path === 'cart/' ? Promise.resolve(ok(noDestinationCart())) : new Promise(() => {}),
    )
    renderCheckout({ cart: noDestinationCart(), draft: false, features: GUEST_CHECKOUT_OFF })
    const receiver = await screen.findByRole('region', { name: /گیرنده و آدرس/ })
    expect(within(receiver).getByRole('link', { name: 'ورود به حساب کاربری' })).toBeInTheDocument()
    expect(within(receiver).queryByRole('status', { name: 'در حال بارگذاری' })).toBeNull()
    expect([...loaded]).toEqual(['login-prompt'])
  })
})
