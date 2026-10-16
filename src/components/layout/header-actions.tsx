'use client'

import { ChevronDown, CircleUserRound, LogIn, ShoppingCart } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useState, type MouseEvent } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClasses, iconButtonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { DeferredMenu } from '@/components/ui/deferred-menu'
import { PanelPending } from '@/components/ui/panel-pending'
import { trackPresses } from '@/components/ui/press-tracking'
import { SHEET_SIDE_QUERY, useMediaQuery } from '@/components/ui/use-media-query'
import { WidgetBoundary } from '@/components/ui/widget-boundary'
import { CartBadge, useCartLabel } from '@/features/cart/components/cart-badge'
import type { MiniCartProps } from '@/features/cart/components/mini-cart'
import { useFeature } from '@/features/settings/feature-context'
import { useT } from '@/lib/i18n/i18n-context'
import { loginHref } from '@/lib/links/login'
import { loadPage } from '@/lib/navigation/hard-navigation'
import { useSession } from '@/lib/session/session-context'

const loadAccountMenu = () => import('./account-menu').then((module) => module.AccountMenu)

/**
 * Signed in: the account entry, a menu whose code loads on first use (DeferredMenu). If that
 * code cannot be downloaded, the account page is the way on.
 */
function AccountEntry() {
  const t = useT()
  return (
    <DeferredMenu
      load={loadAccountMenu}
      props={{}}
      onUnavailable={() => loadPage('/account/')}
      trigger={
        <Button variant="ghost" iconStart={<CircleUserRound />} className="gap-1.5 px-3">
          {t('account')}
          <ChevronDown aria-hidden className="size-4! text-ink-500" />
        </Button>
      }
    />
  )
}

/** A click that should open the link elsewhere (new tab or window) or is not the main button. */
function isModifiedClick(event: MouseEvent): boolean {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey
}

type LazyMiniCartProps = MiniCartProps & { onUnavailable: () => void }

/** Stands in for the mini-cart when its code could not be downloaded. */
function MiniCartUnavailable({ onUnavailable }: LazyMiniCartProps) {
  useEffect(() => onUnavailable(), [onUnavailable])
  return null
}

// The mini-cart (a sheet, with Vaul and Radix Dialog) loads on the first opening, or earlier
// when the cart icon is hovered, focused or pressed.
const MiniCart = dynamic<LazyMiniCartProps>(
  () =>
    import('@/features/cart/components/mini-cart')
      .then((module) => module.MiniCart)
      .catch(() => MiniCartUnavailable),
  { ssr: false, loading: () => <PanelPending label="در حال بارگذاری سبد خرید" /> },
)
/** A failed preload is dropped: the first opening imports the code itself. */
const preloadMiniCart = () => {
  import('@/features/cart/components/mini-cart').catch(() => {})
}

/**
 * The cart icon with its item count. Below md it is a plain link to the cart page (phones also
 * have it in the bottom bar); from md it opens the mini-cart drawer instead, while a modified
 * click still opens the cart page in a new tab. The drawer's code loads on the first opening.
 * If it cannot be downloaded or fails to render (WidgetBoundary), the icon becomes a plain link
 * again and the cart page opens, since that is where the visitor was going.
 */
function CartEntry() {
  const label = useCartLabel()
  const [miniCartFailed, setMiniCartFailed] = useState(false)
  const wide = useMediaQuery(SHEET_SIDE_QUERY) && !miniCartFailed
  const [open, setOpen] = useState(false)
  const [requested, setRequested] = useState(false)
  // The drawer returns the focus to its opener: record presses before its code is loaded.
  useEffect(trackPresses, [])
  const fail = () => {
    setMiniCartFailed(true)
    setOpen(false)
    loadPage('/cart/')
  }
  return (
    <>
      <Link
        href="/cart/"
        aria-label={label}
        aria-haspopup={wide ? 'dialog' : undefined}
        aria-expanded={wide ? open : undefined}
        onPointerEnter={wide ? preloadMiniCart : undefined}
        onFocus={wide ? preloadMiniCart : undefined}
        onClick={(event) => {
          if (!wide || isModifiedClick(event)) return
          event.preventDefault()
          setRequested(true)
          setOpen(true)
        }}
        className={cn(iconButtonClasses(), 'text-ink-800')}
      >
        <ShoppingCart aria-hidden />
        <CartBadge className="-end-0.5 -top-0.5" />
      </Link>
      {requested && !miniCartFailed && (
        <WidgetBoundary name="mini-cart" onError={fail}>
          <MiniCart open={open} onOpenChange={setOpen} onUnavailable={fail} />
        </WidgetBoundary>
      )}
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
          <AccountEntry />
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
