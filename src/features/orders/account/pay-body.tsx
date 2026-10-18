'use client'

import { useQueryClient } from '@tanstack/react-query'
import { TriangleAlert } from 'lucide-react'
import { useState } from 'react'
import { tell } from '@/components/ui/tell'
import type { PaymentCatalog } from '@/features/payment/catalog'
import type { AttemptResolution } from '@/features/payment/open-attempt'
import { OpenAttemptLoader } from '@/features/payment/open-attempt-loader'
import { PayLinkPay } from '@/features/payment/pay-link-pay'
import { gatewayCodeFor } from '@/features/payment/routes'
import { useLinkPayment, type LinkPaid } from '@/features/payment/use-link-payment'
import { usePaymentCatalog } from '@/features/payment/use-payment-catalog'
import { useRouteChoice } from '@/features/payment/use-route-choice'
import type { OrderDetail } from '@/lib/api/types/order-detail'
import type { OpenAttempt, PaymentRoute } from '@/lib/api/types/payment'
import { formatToman } from '@/lib/format'
import { ordersChanged } from './orders-api'

// What the pay sheet holds once its order is read (order digest §5.3–5.9 through the owner's
// uuid door): what is owed online now (O) and at the door (D), from the API's fields; then the
// order's open attempt (after a 409 `payment_attempt_open`: its resume UI, loaded then) or the
// routes for O (the checkout's own rules and radio group, `availableRoutes`), and one press.
// Nothing owed online: «تأیید سفارش» alone (the `pay_on_delivery` intent, §0 #6). A wallet payment
// or a confirmation done here: said once, the sheet closes, the order and the lists are read
// again. Card to card and the bank leave the page (their pages, the bank).

export const PAID = 'پرداخت سفارش انجام شد.'
export const SETTLED = 'پرداخت این سفارش ثبت شد.'
export const confirmedText = (free: boolean, onDelivery: number) =>
  free
    ? 'سفارش تأیید شد.'
    : `سفارش تأیید شد؛ ${formatToman(onDelivery)} هنگام تحویل پرداخت می\u{200C}شود.`

/** The route an abandoned attempt pays again with, while the rules allow it. */
const repayRouteOf = (attempt: OpenAttempt): PaymentRoute =>
  attempt.method === 'card_transfer' ? 'card_transfer' : 'bank_gateway'

export interface PayBodyProps {
  order: OrderDetail
  catalog: PaymentCatalog
  supportPhone: string | null
  /** Done here (paid, confirmed): the sheet closes. */
  onDone: () => void
  /** The order changed under the sheet: read it again. */
  onStale: () => void
}

export function PayBody({ order, catalog: served, supportPhone, onDone, onStale }: PayBodyProps) {
  const client = useQueryClient()
  const catalog = usePaymentCatalog(served)
  const code = order.order_code
  const online = order.money.amount_outstanding_online
  const onDelivery = order.money.amount_to_collect_on_delivery
  const choice = useRouteChoice({
    catalog,
    amounts: { online, onDelivery, charged: order.money.amount_charged_online },
    isGuest: false,
  })
  const [attempt, setAttempt] = useState<OpenAttempt | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const finish = (message: string, wallet = false) => {
    ordersChanged(client, { code, wallet })
    tell(message)
    onDone()
  }
  const stale = () => {
    ordersChanged(client, { code })
    onStale()
  }
  const payment = useLinkPayment({
    door: { kind: 'uuid', orderUuid: order.uuid },
    orderCode: code,
    catalog,
    suggest: choice.choose,
    onPaid: (paid: LinkPaid) =>
      paid.kind === 'confirmed' ? finish(confirmedText(paid.free, onDelivery)) : finish(PAID, true),
    onAttemptOpen: setAttempt,
    onStale: stale,
  })

  const resolved = (resolution: AttemptResolution) => {
    const previous = attempt
    setAttempt(null)
    if (resolution.kind === 'settled') return finish(SETTLED)
    if (resolution.kind === 'ended') return stale()
    setNotice(resolution.notice ?? null)
    // «انصراف و پرداخت دوباره»: the same kind of route again, with a new key (`pay`).
    const again =
      resolution.repay && previous
        ? choice.routes.find((route) => route.enabled && route.route === repayRouteOf(previous))
        : undefined
    if (again)
      void payment.pay(again.route, gatewayCodeFor(again, choice.gateway, catalog.gateways))
  }

  return (
    <div className="flex flex-col gap-4">
      <dl className="flex flex-col gap-2 rounded-card bg-ink-50 p-4 text-base leading-7">
        {online > 0 && (
          <div className="flex flex-wrap justify-between gap-x-4">
            <dt className="text-ink-700">مبلغ قابل پرداخت آنلاین</dt>
            <dd className="font-bold text-ink-900">{formatToman(online)}</dd>
          </div>
        )}
        {onDelivery > 0 && (
          <div className="flex flex-wrap justify-between gap-x-4">
            <dt className="text-ink-700">پرداخت هنگام تحویل</dt>
            <dd className="font-bold text-ink-900">{formatToman(onDelivery)}</dd>
          </div>
        )}
      </dl>
      {/* Nothing online: what «تأیید سفارش» does is the routes' own notice (said once). */}
      {notice && (
        <p className="flex items-start gap-2 rounded-card bg-warning/10 px-4 py-3 text-base leading-7 text-ink-800">
          <TriangleAlert aria-hidden className="mt-1 size-5 shrink-0 text-warning" />
          <span>{notice}</span>
        </p>
      )}
      {attempt ? (
        <OpenAttemptLoader
          attempt={attempt}
          door={{ kind: 'uuid', orderUuid: order.uuid }}
          orderCode={code}
          onResolved={resolved}
        />
      ) : (
        <PayLinkPay
          loginNext={`/account/orders/${code}/`}
          choice={choice}
          catalog={catalog}
          onDelivery={onDelivery}
          payment={payment}
          supportPhone={supportPhone}
        />
      )}
    </div>
  )
}
