import { act, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { CART_KEY } from '@/features/cart/cart-cache'
import { loadBody } from '@/features/checkout/lazy-steps'
import { stubBrowserApis } from '../support/dom-stubs'
import { address, addressCart } from './fixtures'
import { ok, renderCheckout, signedInCart } from './place-support'

// The checkout arrives once the open step's body is in and nothing is being chosen for the
// shopper (Plan 5 Task 9, carried from Task 8's re-review: the arrival's effect had no
// dependencies). A body asked for while the page had nothing to choose must not let the page
// arrive when it comes, if a choice started meanwhile: the page arrived mid-choice, the steps
// opening and closing in view (the CLS the latch is there for). A fresh module graph: the
// review's body is held until the test lets it load.

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
const gate = vi.hoisted(() => {
  let open: () => void = () => {}
  const held = new Promise<void>((resolve) => (open = resolve))
  return { held, open: () => open() }
})
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.doMock('@/features/checkout/review-section', async (importOriginal) => {
  await gate.held
  return importOriginal()
})

stubBrowserApis()

describe('the checkout’s arrival', () => {
  it('a body asked for before a choice started does not let the page arrive mid-choice', async () => {
    let current = signedInCart()
    mocks.bffFetch.mockImplementation((path: string) =>
      // The options for the changed cart never come: the shipping is being chosen.
      path === 'cart/' ? Promise.resolve(ok(current)) : new Promise(() => {}),
    )
    // At the review: nothing to choose, the review's body asked for (held).
    const { client } = renderCheckout({ cart: current, hasSession: true })
    await act(async () => {})
    // Its shipping choice gone (another tab): the operator's default is being chosen.
    current = addressCart(address())
    await act(async () => void client.setQueryData(CART_KEY, current))
    // The review's body comes in now.
    gate.open()
    await act(async () => void (await loadBody('review', true, true)))
    expect(screen.getByRole('status', { name: 'در حال بارگذاری' })).toBeInTheDocument()
    expect(screen.queryByRole('region', { name: /روش ارسال/ })).toBeNull()
  })
})
