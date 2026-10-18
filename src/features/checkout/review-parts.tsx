'use client'

import type { ReactNode } from 'react'
import { SmartImage } from '@/components/ui/smart-image'
import type { RouteChoiceState } from '@/features/payment/use-route-choice'
import type { Cart } from '@/lib/api/types/cart'
import { formatNumber, formatToman } from '@/lib/format'
import { routeLabel } from './route-label'
import { etaLabel } from './shipping-labels'
import { ReceiverSummary } from './step-summaries'
import type { Checkout } from './use-checkout'
import { useShippingOptions } from './use-shipping-options'

// The review's parts (spec §8.7): the lines in a compact list (picture, name, quantity and the
// API's line total), and what goes where and how: the receiver, the shipping (method, delivery
// time, pay on delivery) and the payment route. Every amount is a field of the cart.

export function ReviewLines({ cart }: { cart: Cart }) {
  return (
    <ul aria-label="کالاهای سفارش" className="flex flex-col divide-y divide-ink-100">
      {cart.lines.map((line) => (
        <li key={line.variant_id} className="flex items-center gap-3 py-2">
          <SmartImage
            src={line.image}
            alt=""
            ratio="1/1"
            sizes="56px"
            className="size-14 shrink-0 overflow-hidden rounded-control bg-ink-50"
          />
          <div className="min-w-0 flex-1">
            <p dir="auto" className="line-clamp-2 text-base leading-7 font-medium text-ink-900">
              {line.product_name}
            </p>
            {line.variant_name && (
              <p dir="auto" className="truncate text-sm leading-6 text-ink-600">
                {line.variant_name}
              </p>
            )}
          </div>
          <p className="shrink-0 text-end text-base leading-7 tabular-nums">
            <span className="block text-sm text-ink-600">{`${formatNumber(line.quantity)} ${line.unit_name ?? 'عدد'}`}</span>
            <span className="font-medium text-ink-900">{formatToman(line.line_total)}</span>
          </p>
        </li>
      ))}
    </ul>
  )
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:gap-3">
      <dt className="shrink-0 font-medium text-ink-600 sm:w-28">{term}</dt>
      <dd className="min-w-0 text-ink-800">{children}</dd>
    </div>
  )
}

function ShippingLine({ cart }: { cart: Cart }) {
  // The option list (its delivery time) is the shipping step's, read again for the review.
  const options = useShippingOptions(cart, true).data
  const option = options?.options.find((item) => item.code === cart.shipping.code)
  const eta = option ? etaLabel(option.delivery_min_days, option.delivery_max_days) : null
  const parts = [
    cart.shipping.title,
    eta,
    cart.shipping.cash_on_delivery ? 'پرداخت در محل' : null,
    cart.shipping.freight_paid_by_recipient ? 'پس\u{200C}کرایه' : null,
  ].filter(Boolean)
  return <span dir="auto">{parts.join(' · ')}</span>
}

export function ReviewDetails({
  checkout,
  payment,
}: {
  checkout: Checkout
  payment: RouteChoiceState
}) {
  const cart = checkout.cart!
  const chosen = payment.chosen
  // The gateway is said only when the shopper had one to choose.
  const gateway =
    chosen && chosen.gateways.length > 1
      ? chosen.gateways.find((item) => item.code === payment.gateway)
      : undefined
  return (
    <dl className="flex flex-col gap-2 text-base leading-7">
      <Row term="گیرنده">
        <ReceiverSummary checkout={checkout} />
      </Row>
      <Row term="روش ارسال">
        <ShippingLine cart={cart} />
      </Row>
      <Row term="روش پرداخت">
        {chosen ? (
          <span dir="auto">
            {routeLabel(chosen)}
            {gateway ? ` · ${gateway.title}` : ''}
          </span>
        ) : (
          '—'
        )}
      </Row>
    </dl>
  )
}
