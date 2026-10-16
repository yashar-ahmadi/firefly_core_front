'use client'

import { ChevronDown, CircleUserRound, LogIn, ShoppingCart } from 'lucide-react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState, type MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClasses, iconButtonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SHEET_SIDE_QUERY } from '@/components/ui/sheet'
import { useMediaQuery } from '@/components/ui/use-media-query'
import { WidgetBoundary } from '@/components/ui/widget-boundary'
import { CartBadge, useCartLabel } from '@/features/cart/components/cart-badge'
import { MiniCart } from '@/features/cart/components/mini-cart'
import { useFeature } from '@/features/settings/feature-context'
import { useT } from '@/lib/i18n/i18n-context'
import { loginHref } from '@/lib/links/login'
import { useSession } from '@/lib/session/session-context'

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

/** A click that should open the link elsewhere (new tab or window) or is not the main button. */
function isModifiedClick(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}

/**
 * The cart icon with its item count. Below md it is a plain link to the cart page (phones also
 * have it in the bottom bar); from md it opens the mini-cart drawer instead, while a modified
 * click still opens the cart page in a new tab. A mini-cart that fails to render is taken off
 * the page (WidgetBoundary); the icon stays and still links to the cart page.
 */
function CartEntry() {
  const label = useCartLabel()
  const [miniCartFailed, setMiniCartFailed] = useState(false)
  const wide = useMediaQuery(SHEET_SIDE_QUERY) && !miniCartFailed
  const [open, setOpen] = useState(false)
  return (
    <>
      <Link
        href="/cart/"
        aria-label={label}
        aria-haspopup={wide ? 'dialog' : undefined}
        aria-expanded={wide ? open : undefined}
        onClick={(event) => {
          if (!wide || isModifiedClick(event)) return
          event.preventDefault()
          setOpen(true)
        }}
        className={cn(iconButtonClasses(), 'text-ink-800')}
      >
        <ShoppingCart aria-hidden />
        <CartBadge className="-end-0.5 -top-0.5" />
      </Link>
      <WidgetBoundary name="mini-cart" onError={() => setMiniCartFailed(true)}>
        <MiniCart open={open} onOpenChange={setOpen} />
      </WidgetBoundary>
    </>
  )
}

/** The header's end: the account entry (from md; phones use the bottom bar) and the cart. */
export function HeaderActions() {
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
      <CartEntry />
    </div>
  )
}
