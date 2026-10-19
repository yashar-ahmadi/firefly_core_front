'use client'

import { TriangleAlert } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { focusWasIn } from '@/components/ui/focus-guard'
import { payLinkPath } from '@/features/orders/pay-link'
import type { OrderPaymentLink } from '@/lib/api/types/order'
import type { OpenAttempt, PaymentRoute } from '@/lib/api/types/payment'
import { useSession } from '@/lib/session/session-context'
import { CancelOrder } from './cancel-order'
import type { PaymentCatalog } from './catalog'
import { readLink } from './link-api'
import type { LinkRefusal } from './link-refusal'
import type { AttemptResolution } from './open-attempt'
import { OpenAttemptLoader } from './open-attempt-loader'
import { PayLinkDeadline } from './pay-link-deadline'
import { PayLinkDone, type LinkOutcome } from './pay-link-done'
import { PayLinkPay } from './pay-link-pay'
import { PayLinkRefusal } from './pay-link-refusal'
import { PayLinkSummary } from './pay-link-summary'
import { gatewayCodeFor } from './routes'
import { useLinkPayment } from './use-link-payment'
import { usePaymentCatalog } from './use-payment-catalog'
import { useRouteChoice } from './use-route-choice'

// `/order/pay/<token>/` once the link opened (order digest §3.1.9, §5.0, §5.3, §5.9; the SMS
// link, a guest's only door back to pay, cancel or resume): the order (code, date, status, item
// count, the money split from the API's fields), its payment deadline, then either its open
// attempt's resume UI (loaded only then) or the routes for what is owed online, and «لغو سفارش»
// while it may be cancelled. The page reads the order again (through the BFF, never in a loop)
// only when something changed: an attempt resolved, the deadline reached, a refusal saying the
// order moved on. The token is a credential: it stays in the path (credential-routes.ts).

export interface PayLinkPageProps {
  token: string
  link: OrderPaymentLink
  /** The payment catalog from the server's cache, its texts sanitised there. */
  catalog: PaymentCatalog
  supportPhone: string | null
}

type View =
  | { kind: 'link' }
  | { kind: 'refusal'; refusal: LinkRefusal }
  | { kind: 'done'; outcome: LinkOutcome }

const CARD = 'rounded-card bg-white p-5 shadow-card md:p-6'

/** The route an abandoned attempt pays again with, while the rules allow it. */
const repayRouteOf = (attempt: OpenAttempt): PaymentRoute =>
  attempt.method === 'card_transfer' ? 'card_transfer' : 'bank_gateway'

export function PayLinkPage({
  token,
  link: first,
  catalog: served,
  supportPhone,
}: PayLinkPageProps) {
  const [link, setLink] = useState(first)
  const [view, setView] = useState<View>({ kind: 'link' })
  const [attempt, setAttempt] = useState(first.open_attempt)
  const [notice, setNotice] = useState<string | null>(null)
  const catalog = usePaymentCatalog(served)
  const { hasSession } = useSession()
  const choice = useRouteChoice({
    catalog,
    amounts: {
      online: link.amount_outstanding_online,
      onDelivery: link.amount_to_collect_on_delivery,
      charged: link.amount_charged_online,
    },
    isGuest: !hasSession,
  })
  const reading = useRef(false)
  const reread = async () => {
    if (reading.current) return
    reading.current = true
    const read = await readLink(token)
    reading.current = false
    if (!read.ok) return setView({ kind: 'refusal', refusal: read.refusal })
    setLink(read.link)
    setAttempt(read.link.open_attempt)
  }
  const payment = useLinkPayment({
    door: { kind: 'link', token },
    orderCode: link.order_code,
    catalog,
    suggest: choice.choose,
    onPaid: (outcome) => setView({ kind: 'done', outcome }),
    onAttemptOpen: setAttempt,
    onStale: () => void reread(),
  })
  // The resume UI gone (its pressed control with it): the routes' heading takes the focus, only
  // when the focus was in it (or nowhere).
  const attemptBox = useRef<HTMLDivElement>(null)
  const routesHeading = useRef<HTMLHeadingElement>(null)
  const [refocus, setRefocus] = useState(0)
  useEffect(() => {
    if (refocus > 0) routesHeading.current?.focus()
  }, [refocus])
  const resolved = (resolution: AttemptResolution) => {
    const previous = attempt
    setAttempt(null)
    if (resolution.kind === 'settled')
      return setView({ kind: 'done', outcome: { kind: 'settled' } })
    if (focusWasIn(attemptBox.current)) setRefocus((count) => count + 1)
    if (resolution.kind === 'ended') return void reread()
    setNotice(resolution.notice ?? null)
    // «انصراف و پرداخت دوباره»: the same kind of route again, with a new key (`pay`).
    const again =
      resolution.repay && previous
        ? choice.routes.find((route) => route.enabled && route.route === repayRouteOf(previous))
        : undefined
    if (again)
      void payment.pay(again.route, gatewayCodeFor(again, choice.gateway, catalog.gateways))
  }

  if (view.kind === 'refusal') {
    return (
      <PayLinkRefusal
        refusal={view.refusal}
        supportPhone={supportPhone}
        retryHref={payLinkPath(token)}
        orderCode={link.order_code}
      />
    )
  }
  if (view.kind === 'done') return <PayLinkDone outcome={view.outcome} link={link} />
  const online = link.amount_outstanding_online > 0
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <section aria-labelledby="pay-link-heading" className={`${CARD} flex flex-col gap-4`}>
        <h1
          id="pay-link-heading"
          tabIndex={-1}
          className="text-xl leading-9 font-bold text-ink-900 outline-none md:text-2xl md:leading-10"
        >
          {online ? 'پرداخت سفارش' : 'تأیید سفارش'}
        </h1>
        <PayLinkSummary link={link} />
        {link.expires_at && (
          <PayLinkDeadline
            expiresAt={link.expires_at}
            onEnd={() => void reread()}
            confirmOnly={!online}
          />
        )}
      </section>
      <section aria-labelledby="pay-link-routes" className={`${CARD} flex flex-col gap-4`}>
        <h2
          ref={routesHeading}
          id="pay-link-routes"
          tabIndex={-1}
          className="text-lg leading-8 font-bold text-ink-900 outline-none"
        >
          {attempt ? 'پرداخت' : online ? 'روش پرداخت' : 'تأیید و پرداخت هنگام تحویل'}
        </h2>
        {notice && (
          <p className="flex items-start gap-2 rounded-card bg-warning/10 px-4 py-3 text-base leading-7 text-ink-800">
            <TriangleAlert aria-hidden className="mt-1 size-5 shrink-0 text-warning" />
            <span>{notice}</span>
          </p>
        )}
        {attempt ? (
          <div ref={attemptBox}>
            <OpenAttemptLoader
              attempt={attempt}
              door={{ kind: 'link', token }}
              orderCode={link.order_code}
              fallbackHref={payLinkPath(token)}
              onResolved={resolved}
            />
          </div>
        ) : (
          <PayLinkPay
            loginNext={payLinkPath(token)}
            choice={choice}
            catalog={catalog}
            onDelivery={link.amount_to_collect_on_delivery}
            payment={payment}
            supportPhone={supportPhone}
          />
        )}
      </section>
      {link.can_cancel && (
        <CancelOrder
          token={token}
          onCancelled={(cancelled) => {
            setLink(cancelled)
            setView({ kind: 'done', outcome: { kind: 'cancelled' } })
          }}
          onRefused={(refusal) => setView({ kind: 'refusal', refusal })}
        />
      )}
    </div>
  )
}
