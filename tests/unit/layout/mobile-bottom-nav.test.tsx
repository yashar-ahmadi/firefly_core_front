import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MobileBottomNav } from '@/components/layout/mobile-bottom-nav'
import { SessionProvider } from '@/lib/session/session-context'

const nav = vi.hoisted(() => ({ pathname: '/' }))
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }))

function withSession(children: ReactNode, hasSession = false) {
  return <SessionProvider initialHasSession={hasSession}>{children}</SessionProvider>
}

function bottomNav() {
  return screen.getByRole('navigation', { name: 'منوی پایین' })
}

beforeEach(() => {
  nav.pathname = '/'
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

  it('shows the cart count in Persian digits', () => {
    render(withSession(<MobileBottomNav cartCount={3} />))
    const cart = within(bottomNav()).getByRole('link', { name: /سبد خرید/ })
    expect(cart).toHaveAccessibleName('سبد خرید، ۳ کالا')
    expect(cart).toHaveTextContent('۳')
  })

  it('is not rendered during checkout', () => {
    nav.pathname = '/checkout/'
    const { container } = render(withSession(<MobileBottomNav />))
    expect(container).toBeEmptyDOMElement()
  })
})
