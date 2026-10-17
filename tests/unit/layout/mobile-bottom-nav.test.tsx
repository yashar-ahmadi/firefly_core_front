import { act, render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { useSession, type SessionState } from '@/lib/session/session-context'
import { cart, cartLine, result } from '../cart/support'
import { clientProviders } from '../support/providers'

const nav = vi.hoisted(() => ({ pathname: '/', bffFetch: vi.fn() }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))
vi.mock('@/lib/api/client', () => ({ bffFetch: nav.bffFetch }))

function withSession(children: ReactNode, hasSession = false) {
  const { wrapper: Wrapper } = clientProviders({ hasSession })
  return <Wrapper>{children}</Wrapper>
}

function bottomNav() {
  return screen.getByRole('navigation', { name: 'منوی پایین' })
}

beforeEach(() => {
  nav.pathname = '/'
  nav.bffFetch.mockReset()
  nav.bffFetch.mockResolvedValue(result(cart()))
})

describe('MobileBottomNav', () => {
  it('links home, categories, cart and account (login first for guests)', () => {
    render(withSession(<MobileBottomNav />))
    const links = within(bottomNav()).getAllByRole('link')
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '/',
      '/categories/',
      '/cart/',
      '/login/?next=/account/',
    ])
    expect(links.map((link) => link.textContent)).toEqual([
      'خانه',
      'دسته‌بندی‌ها',
      'سبد خرید',
      'حساب من',
    ])
  })

  it('links a signed-in visitor straight to the account', () => {
    render(withSession(<MobileBottomNav />, true))
    expect(within(bottomNav()).getByRole('link', { name: 'حساب من' })).toHaveAttribute(
      'href',
      '/account/',
    )
  })

  it('follows the session as it changes: a logout gives the guest link back, no reload', () => {
    let session: SessionState | null = null
    function Probe() {
      session = useSession()
      return null
    }
    render(
      withSession(
        <>
          <Probe />
          <MobileBottomNav />
        </>,
        true,
      ),
    )
    const account = () => within(bottomNav()).getByRole('link', { name: /^حساب من/ })
    expect(account()).toHaveAttribute('href', '/account/')
    act(() => session?.setHasSession(false))
    expect(account()).toHaveAttribute('href', '/login/?next=/account/')
  })

  it('marks the current tab, including the pages under it', () => {
    nav.pathname = '/categories/'
    const { rerender } = render(withSession(<MobileBottomNav />))
    expect(screen.getByRole('link', { name: 'دسته‌بندی‌ها' })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(screen.getByRole('link', { name: 'خانه' })).not.toHaveAttribute('aria-current')

    nav.pathname = '/account/orders/'
    rerender(withSession(<MobileBottomNav />, true))
    expect(screen.getByRole('link', { name: 'حساب من' })).toHaveAttribute('aria-current', 'page')

    for (const pathname of ['/login/', '/register/', '/forgot-password/']) {
      nav.pathname = pathname
      rerender(withSession(<MobileBottomNav />))
      expect(screen.getByRole('link', { name: 'حساب من' })).toHaveAttribute('aria-current', 'page')
    }
  })

  it('shows the cart count in Persian digits once the cart is read', async () => {
    nav.bffFetch.mockResolvedValue(result(cart([cartLine({ quantity: 3 })])))
    render(withSession(<MobileBottomNav />))
    const link = await within(bottomNav()).findByRole('link', { name: 'سبد خرید، ۳ کالا' })
    expect(link).toHaveAttribute('href', '/cart/')
    expect(link).toHaveTextContent('۳')
  })

  it('is not rendered during checkout', () => {
    nav.pathname = '/checkout/'
    const { container } = render(withSession(<MobileBottomNav />))
    expect(container).toBeEmptyDOMElement()
  })

  it.each([
    '/product/samsung-galaxy-s25-ultra/',
    '/product/does-not-exist/',
    '/product/list/flagship-phones/',
  ])('renders on %s: only a mounted buy bar hides it (by CSS), never the path', (pathname) => {
    nav.pathname = pathname
    const { container } = render(withSession(<MobileBottomNav />))
    // The marker the CSS rule in globals.css hides while a buy bar is on the page.
    expect(bottomNav()).toHaveAttribute('data-bottom-nav')
    // The spacer stays either way: the buy bar is exactly as tall as the navigation.
    const spacer = container.firstElementChild
    expect(spacer).toHaveAttribute('aria-hidden', 'true')
    expect(spacer).toHaveClass('h-[calc(4rem+env(safe-area-inset-bottom))]', 'md:hidden')
  })
})
