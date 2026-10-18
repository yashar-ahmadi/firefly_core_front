'use client'

import { CircleCheck } from 'lucide-react'
import Link from 'next/link'
import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { buttonClasses } from '@/components/ui/button-styles'
import { cn } from '@/components/ui/cn'
import { focusWasIn } from '@/components/ui/focus-guard'
import { Spinner } from '@/components/ui/spinner'
import { payLinkPath } from '@/features/orders/pay-link'
import type { AttemptResolution } from '@/features/payment/open-attempt'
import { OpenAttemptLoader } from '@/features/payment/open-attempt-loader'
import type { PaymentCatalogState } from '@/features/payment/use-payment-catalog'
import { useRouteChoice, type RouteChoiceState } from '@/features/payment/use-route-choice'
import type { PaymentRoute } from '@/lib/api/types/payment'
import { formatToman } from '@/lib/format'
import { PaymentSection } from '../payment-section'
import { doorOf, type PlacedContext } from '../placed-order'
import { thanksPath } from '../thanks-path'
import { usePayOrder } from '../use-pay-order'
import { BankHandoff } from './bank-handoff'
import { OrderCode } from './order-code'
import { PayLater } from './pay-later'
import { PlacedAlert } from './placed-alert'

// The order is placed (order digest §5.1–5.2): the checkout becomes its payment. The order's
// route runs at once (one press placed and paid), decided by the ORDER, not by the cart it was
// chosen for (its online share A can differ): nothing owed online → the confirmation
// (`pay_on_delivery`); the route chosen still allowed for A → that route; otherwise the shopper
// chooses among the routes for the order (no doomed intent). While a route runs the page says so,
// a bank takes over the page (`BankHandoff`), and a refusal leaves the order here with what
// happened, the routes again for the order's own amounts and how to pay later. An attempt still
// open (`409 payment_attempt_open`) is not an error: its resume UI shows (loaded only then) until
// the shopper continues it or abandons it (then the route runs again, a new key). Never lost:
// the code is on screen from the first moment, the thanks page a link away.

/** The route to run at once for the order; null: the shopper chooses; undefined: not known yet. */
function orderRoute(ctx: PlacedContext, choice: RouteChoiceState): PaymentRoute | null | undefined {
  if (ctx.A === 0) return 'pay_on_delivery'
  if (ctx.route === 'pay_on_delivery') return null
  if (choice.pending) return undefined
  return choice.routes.some((route) => route.route === ctx.route && route.enabled)
    ? ctx.route
    : null
}

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
  // The shop's sentence after an abandoned attempt whose money the bank had taken (parked).
  const [attemptNotice, setAttemptNotice] = useState<string | null>(null)
  const [resumed, setResumed] = useState(false)
  const door = doorOf(ctx)
  // The resume UI gone (its pressed control with it): the routes' heading takes the focus, or
  // the order's own while the route runs again; only when the focus was in it (or nowhere).
  const attemptBox = useRef<HTMLDivElement>(null)
  const headings = useRef<{ order: HTMLHeadingElement | null; routes: HTMLHeadingElement | null }>({
    order: null,
    routes: null,
  })
  const [refocus, setRefocus] = useState(0)
  useEffect(() => {
    if (refocus > 0) (headings.current.routes ?? headings.current.order)?.focus()
  }, [refocus])
  const resolved = (resolution: AttemptResolution) => {
    if (resolution.kind === 'settled') return payment.settled()
    setResumed(true)
    if (focusWasIn(attemptBox.current)) setRefocus((count) => count + 1)
    setAttemptNotice(resolution.kind === 'cancelled' ? (resolution.notice ?? null) : null)
    // Abandoned to pay again: the route runs again, with a new key (`pay`).
    if (resolution.kind === 'cancelled' && resolution.repay && choice.chosen) {
      return void payment.pay(choice.chosen.route, choice.gatewayCode)
    }
    payment.choose()
  }
  const planned = orderRoute(ctx, choice)
  // The press that placed the order pays it too (once, whatever re-renders).
  const started = useRef(false)
  const start = useEffectEvent(() => {
    if (started.current || planned === undefined) return
    started.current = true
    if (planned === null) return payment.choose()
    // The gateway as the choice has it for the ORDER's amount (the one chosen for the cart, while
    // it still takes A; else the one that does).
    void payment.pay(planned, planned === ctx.route ? choice.gatewayCode : undefined)
  })
  useEffect(() => start(), [planned])

  const { state } = payment
  if (state.phase === 'redirecting' && state.handoff) {
    return (
      <BankHandoff
        handoff={state.handoff}
        loadFailed={state.bankLoadFailed}
        onGo={payment.goToBankAgain}
        onExpired={() => {
          setExpired(true)
          payment.choose()
        }}
      />
    )
  }
  const paying = state.phase === 'paying' || state.phase === 'starting'
  const error = state.error
  // The bank cannot be used here at all (not configured, or every gateway withdrawn): said as
  // such, with the support line; the bank routes say why they are closed.
  const bankGone =
    error?.problem === 'gateway_broken' ||
    (error?.problem === 'gateway_refresh' && catalog.gateways.length === 0)
  // The route chosen for the cart does not fit the order: said, the shopper chooses.
  const differs = state.phase === 'choosing' && !expired && !resumed
  // An attempt still open: its resume UI instead of an error (and of the routes) until resolved.
  const open = error?.problem === 'attempt_open' && door ? error.openAttempt : null
  return (
    <section
      aria-labelledby="placed-heading"
      className="flex flex-col gap-5 rounded-card bg-white p-5 shadow-card md:p-6"
    >
      <div className="flex flex-col gap-2">
        <h2
          ref={(element) => {
            headings.current.order = element
          }}
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
          {planned === 'pay_on_delivery'
            ? 'در حال تأیید سفارش…'
            : 'در حال آماده\u{200C}سازی پرداخت…'}
        </p>
      )}
      {open && door && (
        <div ref={attemptBox}>
          <OpenAttemptLoader
            attempt={open}
            door={door}
            orderCode={ctx.orderCode}
            fallbackHref={ctx.linkToken ? payLinkPath(ctx.linkToken) : undefined}
            onResolved={resolved}
          />
        </div>
      )}
      {attemptNotice && !open && (
        <p className="rounded-card bg-warning/10 px-4 py-3 text-base leading-7 text-ink-800">
          {attemptNotice}
        </p>
      )}
      {(error || expired) && !open && (
        <PlacedAlert
          error={error}
          bankGone={bankGone}
          linkToken={ctx.linkToken}
          supportPhone={supportPhone}
        />
      )}
      {differs && (
        <p className="rounded-card bg-warning/10 px-4 py-3 text-base leading-7 text-ink-800">
          {ctx.route === 'pay_on_delivery'
            ? `این سفارش ${formatToman(ctx.A)} پرداخت آنلاین دارد؛ روش پرداخت آن را انتخاب کنید.`
            : 'روش پرداخت انتخابی شما برای مبلغ این سفارش در دسترس نیست؛ روش دیگری انتخاب کنید.'}
        </p>
      )}
      {state.phase === 'failed' || state.phase === 'choosing' ? (
        <div className="flex flex-col gap-4">
          {!open && (
            <>
              <h3
                ref={(element) => {
                  headings.current.routes = element
                }}
                tabIndex={-1}
                className="text-lg leading-8 font-bold text-ink-900 outline-none"
              >
                پرداخت سفارش
              </h3>
              <PaymentSection
                choice={choice}
                onDelivery={ctx.D}
                catalog={catalog}
                busy={paying}
                loginNext={thanksPath(ctx.orderCode)}
                placed
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
            </>
          )}
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
