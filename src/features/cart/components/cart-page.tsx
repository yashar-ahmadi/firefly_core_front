'use client'

import { useIsMutating } from '@tanstack/react-query'
import { useCallback, useEffect, useId, useRef, useState } from 'react'
import { cn } from '@/components/ui/cn'
import { ListError } from '@/features/account/lists/list-error'
import { formatNumber } from '@/lib/format'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import type { CartLine } from '@/lib/api/types/cart'
import { CART_WRITES } from '../cart-cache'
import { CART_HEADING_ID, focusCartHeading } from '../cart-heading'
import { checkoutBlock, isWaitReason } from '../checkout-block'
import { useCart } from '../hooks'
import { useFocusAfterRemoval } from '../use-focus-after-removal'
import { CartBar } from './cart-bar'
import { CartLineItem } from './cart-line'
import { CartNotices } from './cart-notices'
import { CartSkeleton } from './cart-skeleton'
import { CartSummary } from './cart-summary'
import { CheckoutCta } from './checkout-cta'
import { ClearCartButton } from './clear-cart'
import { CouponBox } from './coupon-box'
import { EmptyCart } from './empty-cart'

const CARD = 'rounded-card bg-white shadow-card'

/** Lines with a change waiting or on its way, as they report it. */
function usePendingLines() {
  const [pending, setPending] = useState<ReadonlySet<number>>(() => new Set())
  const report = useCallback((variant: number, busy: boolean) => {
    setPending((current) => {
      if (current.has(variant) === busy) return current
      const next = new Set(current)
      if (busy) next.add(variant)
      else next.delete(variant)
      return next
    })
  }, [])
  return [pending.size > 0, report] as const
}

/**
 * «بازگردانی» from a removal's toast: the focus waits on the page's heading while the toast
 * closes, then goes to the line once it is back (unless the visitor has moved it meanwhile).
 */
function useFocusAfterUndo(lines: CartLine[] | undefined, list: () => HTMLElement | null) {
  const restoring = useRef<number | null>(null)
  const onUndo = useCallback((line: CartLine) => {
    restoring.current = line.variant_id
    focusCartHeading()
  }, [])
  useEffect(() => {
    const variant = restoring.current
    if (variant === null || !lines?.some((line) => line.variant_id === variant)) return
    restoring.current = null
    const active = document.activeElement
    if (active && active !== document.body && active.id !== CART_HEADING_ID) return
    list()?.querySelector<HTMLElement>(`[data-variant="${variant}"] [data-line-name]`)?.focus()
  }, [lines, list])
  return onUndo
}

/**
 * `/cart/` (spec §8.6): the shopper's cart, read in the browser (`useCart`, the one cart query
 * the header and the mini-cart share; every write stores the cart it gets back). Loading shows
 * a skeleton; a read that failed, what happened and «تلاش دوباره»; an empty cart (none, or a
 * dead guest token: the BFF has dropped it), the empty state. Otherwise: the notices, the lines
 * at the start, and at the end (sticky from lg) the summary, «ادامهٔ خرید» and the coupon box;
 * phones get the bar with the total and «ادامهٔ خرید» instead of the bottom navigation.
 * «ادامهٔ خرید» is held back, with the reason, while a change is on its way or a line cannot be
 * ordered as it is. A read that meets the end of the session ends it (`useSessionExpired`).
 */
export function CartPage() {
  const query = useCart()
  const cart = query.data
  const { hasSession } = useSession()
  const expire = useSessionExpired()
  const reasonId = useId()
  const writing =
    useIsMutating({ predicate: (mutation) => mutation.options.scope?.id === CART_WRITES.id }) > 0
  const [linePending, reportPending] = usePendingLines()
  const { removal, listRef, fallbackRef } = useFocusAfterRemoval<HTMLHeadingElement>(cart?.lines)
  const list = useCallback(() => listRef.current, [listRef])
  const onUndo = useFocusAfterUndo(cart?.lines, list)
  const linesHeadingId = useId()

  const { error } = query
  useEffect(() => {
    if (hasSession && isSessionExpiredError(error)) expire()
  }, [hasSession, error, expire])

  if (!cart) {
    if (!query.isError) return <CartSkeleton />
    return (
      <ListError
        message="سبد خرید بارگذاری نشد."
        error={error}
        errorAt={query.errorUpdatedAt}
        onRetry={() => void query.refetch()}
        retrying={query.isFetching}
      />
    )
  }
  if (cart.is_empty) return <EmptyCart headingRef={fallbackRef} />

  const reason = checkoutBlock(cart, writing || linePending)
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-base text-ink-600">{`${formatNumber(cart.item_count)} کالا`}</p>
        <ClearCartButton onCleared={() => fallbackRef.current?.focus()} />
      </div>
      <CartNotices cart={cart} />
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6">
        <section aria-labelledby={linesHeadingId} className={`${CARD} px-4 md:px-6`}>
          <h2 id={linesHeadingId} className="sr-only">
            کالاهای سبد خرید
          </h2>
          <ul ref={listRef} className="divide-y divide-ink-100">
            {cart.lines.map((line, index) => (
              <CartLineItem
                key={line.variant_id}
                line={line}
                onPendingChange={reportPending}
                onUndo={onUndo}
                onRemoving={() => {
                  removal.current = { variant: line.variant_id, index }
                }}
                onRemoveFailed={() => {
                  if (removal.current?.variant === line.variant_id) removal.current = null
                }}
              />
            ))}
          </ul>
        </section>
        <aside className="flex flex-col gap-4 lg:sticky lg:top-[calc(var(--header-offset)+1rem)]">
          <div className={`${CARD} p-4 md:p-5`}>
            <CartSummary cart={cart} variant="cart" />
            <CheckoutCta
              reason={reason}
              reasonId={reasonId}
              className="mt-4 hidden w-full md:inline-flex"
            />
            {reason && (
              <p
                id={reasonId}
                className={cn(
                  'mt-2 text-sm leading-6 font-medium',
                  isWaitReason(reason) ? 'text-ink-600' : 'text-danger',
                )}
              >
                {reason}
              </p>
            )}
          </div>
          <CouponBox cart={cart} className={`${CARD} p-4 md:p-5`} />
        </aside>
      </div>
      <CartBar cart={cart} reason={reason} />
    </div>
  )
}
