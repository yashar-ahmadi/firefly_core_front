'use client'

import { CircleAlert, CircleCheck } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { SupportPhone } from '@/components/layout/support-phone'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { Spinner } from '@/components/ui/spinner'
import { payLinkPath } from '@/features/orders/pay-link'
import { intentMessage } from '@/features/payment/intent-messages'
import type { PaymentCatalogState } from '@/features/payment/use-payment-catalog'
import { useRouteChoice } from '@/features/payment/use-route-choice'
import { PaymentSection } from '../payment-section'
import type { PlacedContext } from '../placed-order'
import { thanksPath } from '../thanks-path'
import { usePayOrder } from '../use-pay-order'
import { BankHandoff } from './bank-handoff'
import { OrderCode } from './order-code'
import { PayLater } from './pay-later'

// The order is placed (order digest §5.1–5.2): the checkout becomes its payment. The route the
// shopper chose runs at once (one press placed and paid); while it runs the page says so, a bank
// takes over the page (`BankHandoff`), and a refusal leaves the order here with what happened,
// the routes again for the order's own amounts (A: nothing is settled yet) and how to pay later.
// Never lost: the code is on screen from the first moment, the thanks page a link away.

export function PlacedOrderPanel({
  ctx,
  catalog,
  supportPhone,
}: {
  ctx: PlacedContext
  catalog: PaymentCatalogState
  supportPhone: string | null
}) {
  const choice = useRouteChoice({
    catalog,
    amounts: { online: ctx.A, onDelivery: ctx.D },
    isGuest: ctx.guest,
    initial: { route: ctx.route, gateway: ctx.gatewayCode },
  })
  const payment = usePayOrder(ctx, catalog, { suggest: choice.choose })
  const [expired, setExpired] = useState(false)
  // The press that placed the order pays it too (once, whatever re-renders).
  const started = useRef(false)
  const start = useEffectEvent(() => {
    if (started.current) return
    started.current = true
    void payment.pay(ctx.route, ctx.gatewayCode ?? undefined)
  })
  useEffect(() => start(), [])

  const { state } = payment
  if (state.phase === 'redirecting' && state.handoff) {
    return (
      <BankHandoff
        handoff={state.handoff}
        loadFailed={state.bankLoadFailed}
        onGo={payment.goToBankAgain}
        onExpired={() => {
          setExpired(true)
          payment.reset()
        }}
      />
    )
  }
  const paying = state.phase === 'paying' || state.phase === 'idle'
  const error = state.error
  return (
    <section
      aria-labelledby="placed-heading"
      className="flex flex-col gap-5 rounded-card bg-white p-5 shadow-card md:p-6"
    >
      <div className="flex flex-col gap-2">
        <h2
          id="placed-heading"
          tabIndex={-1}
          className="flex items-center gap-2 text-xl leading-9 font-bold text-ink-900 outline-none"
        >
          <CircleCheck aria-hidden className="size-6 text-success" />
          سفارش شما ثبت شد
        </h2>
        <OrderCode code={ctx.orderCode} />
      </div>
      {paying && (
        <p role="status" className="flex items-center gap-2 text-base leading-7 text-ink-700">
          <Spinner aria-hidden />
          {ctx.route === 'pay_on_delivery'
            ? 'در حال تأیید سفارش…'
            : 'در حال آماده\u{200C}سازی پرداخت…'}
        </p>
      )}
      {(error || expired) && (
        <div role="alert" className="flex flex-col gap-2 rounded-card bg-danger/10 px-4 py-3">
          <p className="flex items-start gap-2 text-base leading-7 font-medium text-ink-900">
            <CircleAlert aria-hidden className="mt-1 size-5 shrink-0 text-danger" />
            <span>
              {error ? intentMessage(error) : 'مهلت انتقال به درگاه تمام شد؛ دوباره پرداخت کنید.'}
            </span>
          </p>
          {error?.problem === 'gateway_broken' && supportPhone && (
            <SupportPhone phone={supportPhone} label="پشتیبانی" iconLabel="تماس با پشتیبانی" />
          )}
          {error?.problem === 'attempt_open' && ctx.linkToken && (
            <Link
              href={payLinkPath(ctx.linkToken)}
              prefetch={false}
              className={buttonClasses({ variant: 'link' })}
            >
              ادامه یا لغو پرداخت نیمه‌تمام
            </Link>
          )}
          {/* Past its deadline (or its link gone): this order cannot be paid; a new one can. */}
          {error?.problem === 'unpayable' && (
            <Link href="/" className={buttonClasses({ variant: 'link' })}>
              ادامهٔ خرید و ثبت سفارش تازه
            </Link>
          )}
        </div>
      )}
      {state.phase === 'failed' || expired ? (
        <div className="flex flex-col gap-4">
          <h3 className="text-lg leading-8 font-bold text-ink-900">پرداخت سفارش</h3>
          <PaymentSection
            choice={choice}
            onDelivery={ctx.D}
            catalogMissing={catalog.methods === null}
            busy={paying}
            loginNext={thanksPath(ctx.orderCode)}
            footer={
              <Button
                size="lg"
                className="sm:self-start"
                disabled={!choice.chosen}
                onClick={() => {
                  setExpired(false)
                  if (choice.chosen) void payment.pay(choice.chosen.route, choice.gatewayCode)
                }}
              >
                پرداخت سفارش
              </Button>
            }
          />
          <PayLater
            guest={ctx.guest}
            orderCode={ctx.orderCode}
            linkToken={ctx.linkToken}
            expiresAt={ctx.expiresAt}
            payable
            className="border-t border-ink-100 pt-4"
          />
          <Link
            href={thanksPath(ctx.orderCode)}
            className={cn(buttonClasses({ variant: 'outline', size: 'sm' }), 'self-start')}
          >
            بعداً پرداخت می‌کنم
          </Link>
        </div>
      ) : null}
    </section>
  )
}
