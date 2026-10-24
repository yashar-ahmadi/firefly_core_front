import { act, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { hydrateRoot } from 'react-dom/client'
import { renderToString } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HeaderActions } from '@/components/layout/header-actions'
import { NavigationProgress } from '@/components/layout/navigation-progress'
import { CartBadge } from '@/features/cart/components/cart-badge'
import { CART_KEY } from '@/features/cart/hooks'
import type { Cart } from '@/lib/api/types/cart'
import { minWidth, stubBrowserApis } from '../support/dom-stubs'
import { clientProviders } from '../support/providers'
import { renderWith, serveCart, TWO_LINES } from './mini-cart-support'
import { cart, cartLine } from './support'

// The header's cart: its badge and its link, which opens the mini-cart from md (the sheet
// itself: mini-cart.test.tsx).

const mocks = vi.hoisted(() => ({ bffFetch: vi.fn(), error: vi.fn(), success: vi.fn() }))

vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
}))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { error: mocks.error, success: mocks.success, info: vi.fn(), dismiss: vi.fn() },
}))

const media = stubBrowserApis()
const serve = (data: Cart) => serveCart(mocks.bffFetch, data)

beforeEach(() => {
  media.set(() => false)
  mocks.bffFetch.mockReset()
  mocks.error.mockReset()
  mocks.success.mockReset()
})

describe('CartBadge', () => {
  it('server-renders no count, hydrates cleanly and then shows the count', async () => {
    serve(cart([cartLine()]))
    const { client, wrapper: Wrapper } = clientProviders()
    client.setQueryData(CART_KEY, cart([cartLine()]))
    const ui = (
      <Wrapper>
        <span className="relative">
          <CartBadge />
        </span>
      </Wrapper>
    )
    const html = renderToString(ui)
    expect(html).toBe('<span class="relative"></span>')

    const container = document.createElement('div')
    container.innerHTML = html
    document.body.append(container)
    const consoleError = vi.spyOn(console, 'error')
    let root: ReturnType<typeof hydrateRoot> | undefined
    await act(async () => {
      root = hydrateRoot(container, ui)
    })
    expect(consoleError).not.toHaveBeenCalled()
    expect(container).toHaveTextContent('۱')
    consoleError.mockRestore()
    act(() => root?.unmount())
    container.remove()
  })

  it('caps the count at «۹۹+»', async () => {
    serve(cart([cartLine({ quantity: 150, available_quantity: 200 })]))
    renderWith(<CartBadge />)
    expect(await screen.findByText('۹۹+')).toBeInTheDocument()
  })
})

describe('HeaderActions cart', () => {
  it('names the count, and below md links to the cart page', async () => {
    serve(cart([cartLine({ quantity: 3 })]))
    renderWith(<HeaderActions />)
    const link = await screen.findByRole('link', { name: 'سبد خرید، ۳ کالا' })
    expect(link).toHaveAttribute('href', '/cart/')
    expect(link).not.toHaveAttribute('aria-haspopup')
  })

  it('from md opens the mini-cart, which reads the cart again', async () => {
    media.set(minWidth(48))
    serve(TWO_LINES)
    renderWith(<HeaderActions />)
    const link = await screen.findByRole('link', { name: 'سبد خرید، ۳ کالا' })
    await waitFor(() => expect(link).toHaveAttribute('aria-haspopup', 'dialog'))
    mocks.bffFetch.mockClear()

    await userEvent.click(link)
    const sheet = await screen.findByRole('dialog', { name: 'سبد خرید' })
    expect(link).toHaveAttribute('aria-expanded', 'true')
    await waitFor(() => expect(mocks.bffFetch).toHaveBeenCalledWith('cart/', expect.anything()))
    expect(within(sheet).getAllByRole('listitem')).toHaveLength(2)
  })

  it('from md opening the mini-cart is no navigation: the progress bar stays idle', async () => {
    media.set(minWidth(48))
    serve(TWO_LINES)
    const { container } = renderWith(
      <>
        <NavigationProgress />
        <HeaderActions />
      </>,
    )
    const link = await screen.findByRole('link', { name: 'سبد خرید، ۳ کالا' })
    await waitFor(() => expect(link).toHaveAttribute('aria-haspopup', 'dialog'))
    expect(link).toHaveAttribute('data-opens-dialog')

    await userEvent.click(link)
    await screen.findByRole('dialog', { name: 'سبد خرید' })
    expect(container.querySelector('[data-navigation-progress] [data-phase]')).toBeNull()
  })
})
