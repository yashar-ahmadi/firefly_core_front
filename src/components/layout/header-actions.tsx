'use client'

import { ShoppingCart } from 'lucide-react'
import dynamic from 'next/dynamic'
import Link from 'next/link'
import { useEffect, useState } from 'react'
import { iconButtonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { PanelPending } from '@/components/ui/panel-pending'
import { trackPresses } from '@/components/ui/press-tracking'
import { SHEET_SIDE_QUERY, useMediaQuery } from '@/components/ui/use-media-query'
import { WidgetBoundary } from '@/components/ui/widget-boundary'
import { CartBadge, useCartLabel } from '@/features/cart/components/cart-badge'
import type { MiniCartProps } from '@/features/cart/components/mini-cart'
import { loadPage } from '@/lib/navigation/hard-navigation'
import { isModifiedClick } from '@/lib/navigation/modified-click'
import { AccountEntry } from './account-entry'

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
        // From md a click opens the mini-cart: no navigation starts (NavigationProgress).
        data-opens-dialog={wide ? '' : undefined}
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
  return (
    <div className="flex shrink-0 items-center gap-1 md:gap-2">
      <div className="hidden md:block">
        <AccountEntry />
      </div>
      <span aria-hidden className="hidden h-6 w-px bg-ink-200 md:block" />
      <CartEntry />
    </div>
  )
}
