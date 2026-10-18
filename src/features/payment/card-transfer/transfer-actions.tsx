'use client'

import { RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import { Skeleton } from '@/components/ui/skeleton'
import { Spinner } from '@/components/ui/spinner'
import { payLinkPath } from '@/features/orders/pay-link'
import { NO_DOOR_GUEST } from '../pay-again'
import type { SupportLine } from '../result-actions'
import { SupportNote } from './support-note'
import { OTHER_ROUTE, PAY_AGAIN } from './transfer-copy'
import type { CardAgainState } from './use-card-again'

// What the card-transfer page offers next (order digest §5.7 steps 4–5): the order, as its
// confirmed owner sees it (`/account/orders/<code>/`: its order read for this account,
// use-order-ownership.ts) or as anyone else finds it (`/order/track/`); after a
// rejected receipt or a closed attempt, «پرداخت دوباره» (a new card transfer, when a door is
// known) and another route (the order's page for its owner, else the order's link page when this
// device holds its token: a full page load, its URL holds the token); without a door, where to
// pay instead. The support line when the shopper may need it (formatted on the server).

export interface TransferActionsProps {
  orderCode: string | null
  /** The order's confirmed owner (its order read for this account): its account page. */
  owner: boolean
  /** Offer to pay again (a rejected receipt, a closed attempt). */
  again?: CardAgainState
  support?: SupportLine | null
}

export function TransferActions({ orderCode, owner, again, support }: TransferActionsProps) {
  const orderPage = owner && orderCode ? `/account/orders/${orderCode}/` : null
  const offered = again?.available ?? false
  const other = again && (orderPage ?? (again.linkToken ? payLinkPath(again.linkToken) : null))
  const outline = buttonClasses({ variant: 'outline', size: 'lg' })
  const primary = buttonClasses({ variant: 'primary', size: 'lg' })
  return (
    <div className="flex flex-col gap-4 self-stretch">
      <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap">
        {again && offered && (
          // Busy, it stays focusable (`aria-disabled`): the focus is still there for the answer.
          <Button
            size="lg"
            aria-disabled={again.busy || undefined}
            aria-busy={again.busy || undefined}
            iconStart={again.busy ? <Spinner /> : <RotateCcw aria-hidden />}
            onClick={again.pay}
          >
            {PAY_AGAIN}
          </Button>
        )}
        {other &&
          (orderPage ? (
            <Link href={orderPage} prefetch={false} className={outline}>
              {OTHER_ROUTE}
            </Link>
          ) : (
            <a href={other} className={outline}>
              {OTHER_ROUTE}
            </a>
          ))}
        {orderPage ? (
          !other && (
            <Link href={orderPage} prefetch={false} className={again ? outline : primary}>
              مشاهدهٔ سفارش
            </Link>
          )
        ) : (
          <Link
            href="/order/track/"
            prefetch={false}
            className={again && offered ? outline : primary}
          >
            پیگیری سفارش
          </Link>
        )}
      </div>
      {again && !offered && <p className="text-base leading-7 text-ink-700">{NO_DOOR_GUEST}</p>}
      {again?.error && (
        <p role="alert" className="text-base leading-7 text-danger">
          {again.error}
        </p>
      )}
      {support !== undefined && <SupportNote support={support} />}
    </div>
  )
}

/** Where the offers go while the order's owner is being confirmed (they depend on it). */
export function TransferActionsPlaceholder() {
  return <Skeleton className="h-12 w-full max-w-sm self-stretch rounded-control" />
}
