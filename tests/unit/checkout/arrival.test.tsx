import { screen, within } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { stubBrowserApis } from '../support/dom-stubs'
import { wallet } from '../payment/fixtures'
import { ok, renderCheckout, signedInCart } from './place-support'

// The checkout arrives with its open step's body in (Plan 5 Task 8 fix round): the page's
// skeleton stays until that body's code is loaded, so no step shows its own skeleton on arrival
// and nothing below it moves when the body comes (the shipping options, asked for after a
// refused default, pushed the later steps down: CLS 0.24 on a phone). A fresh module graph: no
// body loaded before this test.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))

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
})
