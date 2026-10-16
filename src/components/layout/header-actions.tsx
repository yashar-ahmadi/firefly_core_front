'use client'

import { ChevronDown, CircleUserRound, LogIn, ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Button } from '@/components/ui/button'
import { buttonClasses, iconButtonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useFeature } from '@/features/settings/feature-context'
import { useT } from '@/lib/i18n/i18n-context'
import { loginHref } from '@/lib/links/login'
import { useSession } from '@/lib/session/session-context'
import { CountBadge } from './count-badge'

/** Signed in: the account entry (Plan 3 adds the summary and sign-out). */
function AccountMenu() {
  const t = useT()
  const links = [
    { href: '/account/', label: t('account') },
    { href: '/account/orders/', label: t('account_orders') },
    { href: '/account/wishlist/', label: t('account_wishlist') },
  ]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" iconStart={<CircleUserRound />} className="gap-1.5 px-3">
          {t('account')}
          <ChevronDown aria-hidden className="size-4! text-ink-500" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {links.map((link) => (
          <DropdownMenuItem key={link.href} asChild>
            <Link href={link.href}>{link.label}</Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * The header's end: the account entry (from md; phones use the bottom bar) and the cart.
 * `cartCount` is a slot for the cart store (Plan 4); without it no badge is shown.
 */
export function HeaderActions({ cartCount }: { cartCount?: number }) {
  const t = useT()
  const pathname = usePathname() ?? '/'
  const { hasSession } = useSession()
  const registration = useFeature('registration').enabled

  return (
    <div className="flex shrink-0 items-center gap-1 md:gap-2">
      <div className="hidden md:block">
        {hasSession ? (
          <AccountMenu />
        ) : (
          <Link
            href={loginHref(pathname)}
            className={cn(buttonClasses({ variant: 'outline' }), 'gap-2 px-4')}
          >
            <LogIn aria-hidden className="rtl:-scale-x-100" />
            {t(registration ? 'login_register' : 'login')}
          </Link>
        )}
      </div>
      <span aria-hidden className="hidden h-6 w-px bg-ink-200 md:block" />
      <Link
        href="/cart/"
        aria-label={cartCount ? t('cart_count', { count: cartCount }) : t('cart')}
        className={cn(iconButtonClasses(), 'text-ink-800')}
      >
        <ShoppingCart aria-hidden />
        {cartCount ? <CountBadge count={cartCount} className="-end-0.5 -top-0.5" /> : null}
      </Link>
    </div>
  )
}
