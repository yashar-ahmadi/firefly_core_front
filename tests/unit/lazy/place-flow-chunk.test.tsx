import { screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { PLACEMENT_KEY_STORAGE } from '@/features/checkout/idempotency'
import { stubBrowserApis } from '../support/dom-stubs'
import {
  calls,
  onlineCart,
  PLACE,
  placeButton,
  renderCheckout,
  serve,
} from '../checkout/place-support'

// The placement's own code loads on the press (use-place-order.ts → place-flow.ts). When it
// cannot be downloaded (a deploy since the page loaded, the connection), nothing was sent: the
// review says the connection failed, the placement key is kept for the next press, and the
// page stays the review (never the root error page).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/checkout/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}))
vi.mock('@/features/checkout/place-flow', () => {
  throw new Error('ChunkLoadError: Loading chunk failed.')
})

stubBrowserApis()

beforeEach(() => {
  mocks.bffFetch.mockReset()
  sessionStorage.clear()
})

describe('the placement’s code, when it cannot load', () => {
  it('nothing is sent: the connection is said, the key kept, the review stays', async () => {
    const user = userEvent.setup()
    serve(mocks.bffFetch, () => onlineCart())
    renderCheckout({ cart: onlineCart() })
    const button = await placeButton()
    await waitFor(() => expect(button).not.toHaveAttribute('aria-disabled'))
    const key = sessionStorage.getItem(PLACEMENT_KEY_STORAGE)
    await user.click(button)
    expect(await screen.findByRole('alert')).toHaveTextContent('ارتباط با سرور برقرار نشد')
    expect(calls(mocks.bffFetch, PLACE)).toHaveLength(0)
    expect(sessionStorage.getItem(PLACEMENT_KEY_STORAGE)).toBe(key)
    expect(await placeButton()).not.toHaveAttribute('aria-disabled')
  })
})
