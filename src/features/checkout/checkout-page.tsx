'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { ListError } from '@/features/account/lists/list-error'
import { useCart } from '@/features/cart/hooks'
import { CHECKOUT_ISSUES, checkoutBlock } from '@/features/cart/checkout-block'
import { CartNotices } from '@/features/cart/components/cart-notices'
import type { PaymentCatalog } from '@/features/payment/catalog'
import { usePaymentCatalog } from '@/features/payment/use-payment-catalog'
import { useRouteChoice } from '@/features/payment/use-route-choice'
import { useFeature } from '@/features/settings/feature-context'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { focusCheckoutHeading } from './checkout-heading'
import { CheckoutSkeleton, EmptyCheckout, SessionEnded, UnorderableBanner } from './checkout-states'
import { shippingReady, stepState, type CheckoutStep, type StepState } from './checkout-steps'
import { CheckoutSummaryAside, CheckoutSummaryFolded } from './checkout-summary'
import {
  loadBody,
  PaymentSection,
  preloadAhead,
  ReviewSection,
  ShippingSection,
  StepLoading,
} from './lazy-steps'
import { readLastPlaced } from './placed/last-placed'
import { PlacedOrderPanel } from './placed/placed-loader'
import { ReceiverSection } from './receiver-section'
import { StepSection } from './step-header'
import { PaymentSummary, ReceiverSummary, ShippingSummary } from './step-summaries'
import type { PlacedContext } from './placed-order'
import type { CheckoutTerms } from './terms-checks'
import { useCheckout } from './use-checkout'
import { saidAtTop, usePlaceOrder } from './use-place-order'
import { useStepFocus } from './use-step-focus'

// `/checkout/` (spec §8.7): one page, its steps in order (receiver and destination, shipping,
// payment, review and placement), each a section of its own, the summary of the API's amounts
// beside them (folded at the top on phones). Only the open step's body is code loaded with the
// page (lazy-steps.tsx); the others are their headings and, done, their summaries. Only a cart
// that can be ordered gets the steps: an empty one (or a guest cart that is gone) shows the way
// back, one with lines that cannot be ordered sends the shopper back to the cart. Once the order
// is placed, the page is its payment (PlacedOrderPanel).

const TITLES: Record<CheckoutStep, string> = {
  receiver: 'گیرنده و آدرس',
  shipping: 'روش ارسال',
  payment: 'پرداخت',
  review: 'بازبینی و ثبت سفارش',
}

export interface CheckoutPageProps {
  /** The payment catalog from the server's cache, its texts sanitised there. */
  catalog: PaymentCatalog
  /** The operator's sentences to accept, sanitised on the server. */
  terms: CheckoutTerms
  /** The shop's support line (E.164), for a payment the shop cannot take. */
  supportPhone: string | null
  /** The operator's `terms` and `return-policy` dialog links (DynamicSlot), for the review. */
  termsLinks?: ReactNode
}

export function CheckoutPage({
  catalog: initial,
  terms,
  supportPhone,
  termsLinks,
}: CheckoutPageProps) {
  const catalog = usePaymentCatalog(initial)
  const { data: current } = useCart()
  const { hasSession } = useSession()
  // The receiver's body for a guest: the form, or the way to log in (no guest orders).
  const guests = useFeature('guest_checkout').enabled
  // The routes for the cart's amounts, once shipping prices them (A is final then).
  const payment = useRouteChoice({
    catalog,
    amounts:
      current && shippingReady(current)
        ? {
            online: current.amount_charged_online,
            onDelivery: current.amount_to_collect_on_delivery,
          }
        : null,
    isGuest: !hasSession,
  })
  // Once placed, the page is the order's payment: nothing more is chosen for the closed cart.
  const [placed, setPlaced] = useState<PlacedContext | null>(null)
  const checkout = useCheckout({ paymentReady: payment.chosen !== null, halted: placed !== null })
  const placement = usePlaceOrder(checkout, payment, setPlaced)
  const { cart, cartQuery, signedIn, done, step } = checkout
  const expire = useSessionExpired()
  const page = useStepFocus(step)
  // The page arrives in one piece behind its skeleton: the choices made for the shopper first
  // (use-auto-choices; shown in their steps, each opened and closed a step in turn, moving the
  // steps below it), then the open step's body (arriving over its step's skeleton, it pushed the
  // later steps down). A choice made again later, or a step opened later, shows in its step.
  // Never for an empty cart, which has no step to show; a body asked for before a choice started
  // lets nothing arrive.
  const ready =
    cart?.is_empty === false && !checkout.autoDestination.working && !checkout.autoShipping.working
  const [arrived, setArrived] = useState(false)
  useEffect(() => {
    let live = ready && !arrived
    if (live) void loadBody(step, signedIn, guests).then(() => live && setArrived(true))
    return () => void (live = false)
  }, [ready, arrived, step, signedIn, guests])
  // A choice that hangs (its read or write unanswered) holds the skeleton no longer: named after
  // 3 s, the steps after 8 s (before a write's own 10 s), each step's own skeleton, or the
  // shopper's choice (the picker), taking over. The clock stops once the page has arrived.
  const [waited, setWaited] = useState(0)
  useEffect(() => {
    if (arrived) return
    const timers = [3e3, 8e3].map((ms, at) => setTimeout(() => setWaited(at + 1), ms))
    return () => timers.forEach(clearTimeout)
  }, [arrived])

  const { error } = cartQuery
  useEffect(() => {
    if (signedIn && isSessionExpiredError(error)) expire()
  }, [signedIn, error, expire])

  if (placed) return <PlacedOrderPanel ctx={placed} catalog={catalog} supportPhone={supportPhone} />
  if (checkout.sessionEnded) return <SessionEnded />
  if (!cart && cartQuery.isError) {
    return (
      <ListError
        message="سبد خرید بارگذاری نشد."
        error={error}
        errorAt={cartQuery.errorUpdatedAt}
        onRetry={() => void cartQuery.refetch()}
        retrying={cartQuery.isFetching}
      />
    )
  }
  // Empty after an order placed in this tab (a reload, Back from the bank): that order, first.
  if (cart?.is_empty) return <EmptyCheckout placed={readLastPlaced()} />
  // The cart on its way, or the page not arrived yet (above).
  if (!cart || !(arrived || waited > 1)) return <CheckoutSkeleton slow={waited > 0} />

  const blocked = checkoutBlock(cart, false) === CHECKOUT_ISSUES
  // A refusal whose fix is in an earlier step is said at the top, until the review again.
  const moved =
    placement.notice && saidAtTop(placement.notice.problem) && step !== 'review'
      ? placement.notice
      : null
  const state = (of: CheckoutStep): StepState => (blocked ? 'locked' : stepState(of, step, done))
  const edit = (of: CheckoutStep) => (blocked ? undefined : () => checkout.edit(of))
  // The shopper at work in the page: the bodies of the steps ahead are fetched meanwhile (each
  // loads by itself when its step opens).
  const ahead = () => preloadAhead(step, signedIn, guests)
  return (
    <div
      ref={page}
      onPointerOver={ahead}
      onFocus={ahead}
      // A screen tall at least, as the skeleton before it: the footer stays below the fold while
      // the steps open, close and get their bodies.
      className="grid min-h-dvh content-start gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <CheckoutSummaryFolded cart={cart} />
        {blocked && <UnorderableBanner />}
        <CartNotices cart={cart} onEmpty={focusCheckoutHeading} />
        {moved && (
          <p
            role="alert"
            className="rounded-card bg-danger/10 px-4 py-3 text-base leading-7 font-medium text-ink-900"
          >
            {moved.message}
          </p>
        )}
        <StepSection
          step="receiver"
          number={1}
          title={TITLES.receiver}
          state={state('receiver')}
          summary={<ReceiverSummary checkout={checkout} />}
          onEdit={edit('receiver')}
        >
          <ReceiverSection checkout={checkout} />
        </StepSection>
        <StepSection
          step="shipping"
          number={2}
          title={TITLES.shipping}
          state={state('shipping')}
          summary={<ShippingSummary cart={cart} />}
          onEdit={edit('shipping')}
        >
          {checkout.autoShipping.working && checkout.editing !== 'shipping' ? (
            // The operator's default being chosen (use-auto-choices): the options' code loads
            // only if the shopper is asked after all.
            <StepLoading label={'در حال انتخاب روش ارسال پیش\u{200C}فرض'} />
          ) : (
            <ShippingSection checkout={checkout} />
          )}
        </StepSection>
        <StepSection
          step="payment"
          number={3}
          title={TITLES.payment}
          state={state('payment')}
          summary={<PaymentSummary payment={payment} />}
          onEdit={edit('payment')}
        >
          <PaymentSection
            choice={payment}
            onDelivery={cart.amount_to_collect_on_delivery}
            catalog={catalog}
            // The shopper's own choice keeps the step open (a gateway to choose, say).
            onChoose={() => checkout.edit('payment')}
            footer={
              checkout.editing === 'payment' &&
              payment.chosen && (
                <Button variant="outline" className="self-start" onClick={checkout.finishEditing}>
                  ادامه با این روش پرداخت
                </Button>
              )
            }
          />
        </StepSection>
        <StepSection step="review" number={4} title={TITLES.review} state={state('review')}>
          <ReviewSection
            checkout={checkout}
            payment={payment}
            placement={placement}
            terms={terms}
            termsLinks={termsLinks}
          />
        </StepSection>
      </div>
      <CheckoutSummaryAside cart={cart} />
    </div>
  )
}
