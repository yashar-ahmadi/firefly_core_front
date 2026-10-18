'use client'

import { RotateCcw } from 'lucide-react'
import Link from 'next/link'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import { Spinner } from '@/components/ui/spinner'
import { payLinkPath } from '@/features/orders/pay-link'
import { NO_DOOR_GUEST } from './pay-again'
import type { ResultAction } from './result-copy'
import type { PayAgainState } from './use-pay-again'

// What the result page offers next (order digest §5.10): the table's actions made into links
// for this visitor. The order: its page for its confirmed owner (`/account/orders/<code>/`, its
// order read for this account), tracking for anyone else (`/order/track/`): a guest, or a
// signed-in payer of another account's order or a guest's (§11 #7), whose account holds no such
// order. «پرداخت دوباره» only through a door this device knows; without one the shopper is told
// where to pay (the SMS link, tracking), never given a made-up door. Another route: the order's
// page for its owner, else the order's link page when this device knows it (a full page load:
// its URL holds the token, credential-routes.ts). The first offer is the primary one.

/** The shop's support line: `tel:` ready, and as shown (formatted on the server). */
export interface SupportLine {
  tel: string
  shown: string
}

export interface ResultActionsProps {
  actions: ResultAction[]
  orderCode: string | null
  /** The order's confirmed owner (its order read for this account): its account page. */
  owner: boolean
  /** Signed in, and the payment not someone else's: the account's own list of orders. */
  listOrders: boolean
  /** The order's link token, when this device knows it (another route, not the owner). */
  linkToken: string | null
  payAgain: PayAgainState
  support: SupportLine | null
}

interface Offer {
  key: string
  href: string
  label: string
  /** A full page load (a credential URL). */
  plain?: boolean
}

export function ResultActions({
  actions,
  orderCode,
  owner,
  listOrders,
  linkToken,
  payAgain,
  support,
}: ResultActionsProps) {
  const orderPage = owner && orderCode ? `/account/orders/${orderCode}/` : null
  const offers: Offer[] = []
  const add = (offer: Offer) => {
    if (!offers.some((other) => other.href === offer.href)) offers.push(offer)
  }
  const order = () =>
    orderPage
      ? add({ key: 'order', href: orderPage, label: 'مشاهدهٔ سفارش' })
      : add({ key: 'track', href: '/order/track/', label: 'پیگیری سفارش' })
  const wantsAgain = actions.includes('pay_again')
  const again = wantsAgain && payAgain.available
  for (const action of actions) {
    if (action === 'order') order()
    if (action === 'wallet') add({ key: 'wallet', href: '/account/wallet/', label: 'کیف پول من' })
    if (action === 'other_route') {
      if (orderPage) add({ key: 'other', href: orderPage, label: 'پرداخت با روش دیگر' })
      else if (linkToken)
        add({
          key: 'other',
          href: payLinkPath(linkToken),
          label: 'پرداخت با روش دیگر',
          plain: true,
        })
    }
    if (action === 'orders') {
      if (listOrders) add({ key: 'orders', href: '/account/orders/', label: 'سفارش\u{200C}های من' })
      add({ key: 'track', href: '/order/track/', label: 'پیگیری سفارش' })
    }
  }
  // No door for «پرداخت دوباره»: where to pay instead.
  if (wantsAgain && !again) order()

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <div className="flex w-full flex-col items-stretch justify-center gap-3 sm:flex-row sm:flex-wrap">
        {again && (
          // Busy, it stays focusable (`aria-disabled`): the focus is still there for the answer.
          <Button
            size="lg"
            aria-disabled={payAgain.busy || undefined}
            aria-busy={payAgain.busy || undefined}
            iconStart={payAgain.busy ? <Spinner /> : <RotateCcw aria-hidden />}
            onClick={payAgain.pay}
          >
            پرداخت دوباره
          </Button>
        )}
        {offers.map((offer, index) => {
          const className = buttonClasses({
            variant: index === 0 && !again ? 'primary' : 'outline',
            size: 'lg',
          })
          return offer.plain ? (
            <a key={offer.key} href={offer.href} className={className}>
              {offer.label}
            </a>
          ) : (
            <Link key={offer.key} href={offer.href} prefetch={false} className={className}>
              {offer.label}
            </Link>
          )
        })}
      </div>
      {wantsAgain && !again && (
        <p className="text-center text-base leading-7 text-ink-700">{NO_DOOR_GUEST}</p>
      )}
      {payAgain.error && (
        <p role="alert" className="text-center text-base leading-7 text-danger">
          {payAgain.error}
        </p>
      )}
      {actions.includes('support') &&
        (support ? (
          <p className="flex flex-wrap items-center justify-center gap-x-2 text-base leading-7 text-ink-700">
            <span>تماس با پشتیبانی:</span>
            {/* Its own link, formatted on the server: the shell's SupportPhone (and the phone
                formatter it imports) here regroups the product page's chunks (+110 B, measured). */}
            <a
              href={`tel:${support.tel}`}
              dir="ltr"
              className="inline-flex min-h-11 items-center font-bold text-brand-700 hover:underline"
            >
              {support.shown}
            </a>
          </p>
        ) : (
          <p className="text-center text-base leading-7 text-ink-700">
            با پشتیبانی فروشگاه تماس بگیرید.
          </p>
        ))}
    </div>
  )
}
