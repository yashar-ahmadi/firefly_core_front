import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { isValidElement, type ReactElement, type ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ShopShell } from '@/components/layout/shop-shell'
import { announce, LiveAnnouncer } from '@/components/ui/live-announcer'
import { AddToCartButton } from '@/features/cart/components/add-to-cart-button'
import { cart, cartLine, MSG_ADDED, result } from '../cart/support'
import { clientProviders } from '../support/providers'

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), toastRegionReady: false }))
vi.mock('server-only', () => ({}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('@/components/ui/toaster', () => ({
  notify: { error: vi.fn(), success: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
  toastRegionReady: () => mocks.toastRegionReady,
}))

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.toastRegionReady = false
  // The region's text lives at module level: start every test from an empty one.
  announce('')
  vi.advanceTimersByTime(100)
})
afterEach(() => vi.useRealTimers())

const region = () => screen.getByRole('status')

/** Every element type in a server tree's children, depth first. */
function typesIn(node: ReactNode): unknown[] {
  if (Array.isArray(node)) return node.flatMap(typesIn)
  if (!isValidElement(node)) return []
  const element = node as ReactElement<{ children?: ReactNode }>
  return [element.type, ...typesIn(element.props.children)]
}

describe('LiveAnnouncer', () => {
  it('is a polite, atomic, visually hidden region, empty at first', () => {
    render(<LiveAnnouncer />)
    expect(region()).toHaveAttribute('aria-live', 'polite')
    expect(region()).toHaveAttribute('aria-atomic', 'true')
    expect(region()).toHaveClass('sr-only')
    expect(region()).toBeEmptyDOMElement()
  })

  it('reads a message, and the same message again after emptying the region', () => {
    render(<LiveAnnouncer />)
    act(() => announce('یک'))
    act(() => vi.advanceTimersByTime(100))
    expect(region()).toHaveTextContent('یک')
    act(() => announce('یک'))
    expect(region()).toBeEmptyDOMElement()
    act(() => vi.advanceTimersByTime(100))
    expect(region()).toHaveTextContent('یک')
  })

  it('is part of the shop shell, on every page', () => {
    expect(typesIn(ShopShell({ children: null }))).toContain(LiveAnnouncer)
  })

  async function addOnce() {
    mocks.bffFetch.mockResolvedValue(result(cart([cartLine()]), MSG_ADDED))
    const { wrapper } = clientProviders()
    render(
      <>
        <LiveAnnouncer />
        <AddToCartButton variantId={10001} quantity={1} product={{ name: 'گوشی S25', image: '' }} />
      </>,
      { wrapper },
    )
    await userEvent.click(screen.getByRole('button', { name: 'افزودن به سبد خرید' }))
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalled())
    await act(async () => {})
    act(() => vi.advanceTimersByTime(100))
  }

  it('says «به سبد خرید اضافه شد: <name>» after an add while no toaster is on the page', async () => {
    // Sonner's region would be created with this very toast, which a screen reader can miss.
    await addOnce()
    expect(region()).toHaveTextContent('به سبد خرید اضافه شد: گوشی S25')
  })

  it("leaves the add to Sonner's own region once the toaster is on the page: read once", async () => {
    mocks.toastRegionReady = true
    await addOnce()
    expect(region()).toBeEmptyDOMElement()
  })
})
