'use client'

import type { RouteChoiceState } from '@/features/payment/use-route-choice'
import type { Cart } from '@/lib/api/types/cart'
import { routeLabel } from './route-label'
import type { Checkout } from './use-checkout'

// What a done step says in a line (spec §8.7): where the order goes, and how. From the cart the
// API returned (the guest's name is the page's own, kept for placement).

export function ReceiverSummary({ checkout }: { checkout: Checkout }) {
  const destination = checkout.cart?.destination
  if (!destination) return null
  const saved = destination.address
  if (saved) {
    return (
      <p>
        <span dir="auto" className="font-medium text-ink-900">
          {saved.title}
        </span>
        {`: ${saved.full_address}`}
      </p>
    )
  }
  const { firstName, lastName, address } = checkout.receiver
  const place = [destination.province_name, destination.city_name, address.trim()].filter(Boolean)
  return (
    <p>
      <span className="font-medium text-ink-900">{`${firstName} ${lastName}`.trim()}</span>
      {`: ${place.join('، ')}`}
    </p>
  )
}

export function ShippingSummary({ cart }: { cart: Cart }) {
  const { shipping } = cart
  if (!shipping.is_selected || !shipping.title) return null
  return (
    <p>
      <span dir="auto" className="font-medium text-ink-900">
        {shipping.title}
      </span>
      {shipping.cash_on_delivery && ' · پرداخت در محل'}
      {shipping.freight_paid_by_recipient && ' · پس\u{200C}کرایه'}
    </p>
  )
}

export function PaymentSummary({ payment }: { payment: RouteChoiceState }) {
  const { chosen } = payment
  if (!chosen) return null
  const gateway = chosen.gateways.find((item) => item.code === payment.gateway)
  return (
    <p>
      <span dir="auto" className="font-medium text-ink-900">
        {routeLabel(chosen)}
      </span>
      {chosen.gateways.length > 1 && gateway ? ` · ${gateway.title}` : ''}
      {chosen.route === 'pay_on_delivery' && ' (بدون پرداخت آنلاین)'}
    </p>
  )
}
