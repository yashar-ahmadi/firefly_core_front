'use client'

import { CircleUserRound, House, LayoutGrid, ShoppingCart, type LucideIcon } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from '@/components/ui/cn'
import { CartBadge, useCartLabel } from '@/features/cart/components/cart-badge'
import { useT } from '@/lib/i18n/i18n-context'
import { useSession } from '@/lib/session/session-context'
import { BOTTOM_BAR_FRAME, BOTTOM_BAR_ROW, BOTTOM_BAR_SPACER } from './bottom-bar'

/** Pages that bring their own bottom bar and its room (checkout's "pay" bar). */
const HIDDEN_ON = /^\/checkout(?:\/|$)/

interface Tab {
  href: string
  label: string
  icon: LucideIcon
  active: boolean
  /** The cart tab: its accessible name carries the item count, and it shows the badge. */
  cart?: boolean
}

const under = (pathname: string, ...prefixes: string[]) =>
  prefixes.some((prefix) => pathname.startsWith(prefix))

/**
 * The phone's bottom navigation (below md): home, categories, cart and account. The current tab
 * is brand-coloured with a filled icon. It slides away while scrolling down and is not shown
 * during checkout. While a page's own buy bar is mounted (the product page) a rule in
 * globals.css hides it (`data-bottom-nav`); its spacer stays, since the bar is as tall. It
 * reserves its height at the end of the page, so nothing hides under either bar.
 */
export function MobileBottomNav() {
  const t = useT()
  const pathname = usePathname() ?? '/'
  const { hasSession } = useSession()
  const cartLabel = useCartLabel()
  if (HIDDEN_ON.test(pathname)) return null

  const tabs: Tab[] = [
    { href: '/', label: t('home'), icon: House, active: pathname === '/' },
    {
      href: '/categories/',
      label: t('categories'),
      icon: LayoutGrid,
      active: under(pathname, '/categories/', '/product-category/'),
    },
    {
      href: '/cart/',
      label: t('cart'),
      icon: ShoppingCart,
      active: under(pathname, '/cart/'),
      cart: true,
    },
    {
      href: hasSession ? '/account/' : '/login/?next=/account/',
      label: t('account'),
      icon: CircleUserRound,
      active: under(pathname, '/account/', '/login/', '/register/', '/forgot-password/'),
    },
  ]

  return (
    <>
      <div aria-hidden className={BOTTOM_BAR_SPACER} />
      <nav
        data-bottom-nav=""
        aria-label={t('bottom_navigation')}
        className={cn(
          BOTTOM_BAR_FRAME,
          // Hidden: moved down by its height plus its shadow; keyboard focus brings it back.
          'transition-transform duration-200 ease-out has-focus-visible:translate-y-0 compact:translate-y-[calc(100%+1rem)]',
        )}
      >
        <ul className={cn('grid grid-cols-4', BOTTOM_BAR_ROW)}>
          {tabs.map(({ href, label, icon: Icon, active, cart }) => (
            <li key={href}>
              <Link
                href={href}
                aria-current={active ? 'page' : undefined}
                aria-label={cart ? cartLabel : undefined}
                className={cn(
                  'relative flex h-full flex-col items-center justify-center gap-1 text-sm focus-visible:-outline-offset-2',
                  'before:absolute before:top-0 before:h-0.5 before:w-10 before:rounded-b-full',
                  active ? 'font-bold text-brand-700 before:bg-brand' : 'text-ink-600',
                )}
              >
                <span className="relative">
                  <Icon
                    aria-hidden
                    strokeWidth={active ? 2.2 : 1.8}
                    className={cn('size-6', active ? 'fill-brand-100' : 'text-ink-500')}
                  />
                  {cart && <CartBadge />}
                </span>
                {label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  )
}
