'use client'

import { useEffect, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { ListError } from '@/features/account/lists/list-error'
import { useCart } from '@/features/cart/hooks'
import { CHECKOUT_ISSUES, checkoutBlock } from '@/features/cart/checkout-block'
import { CartNotices } from '@/features/cart/components/cart-notices'
import type { PaymentCatalog } from '@/features/payment/catalog'
import { usePaymentCatalog } from '@/features/payment/use-payment-catalog'
import { useRouteChoice } from '@/features/payment/use-route-choice'
import { useSession } from '@/lib/session/session-context'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { focusCheckoutHeading } from './checkout-heading'
import { CheckoutSkeleton, EmptyCheckout, SessionEnded, UnorderableBanner } from './checkout-states'
import { shippingReady, stepState, type CheckoutStep, type StepState } from './checkout-steps'
import { CheckoutSummaryAside, CheckoutSummaryFolded } from './checkout-summary'
import {
  PaymentSection,
  preloadAhead,
  ReviewSection,
  ShippingSection,
  StepLoading,
} from './lazy-steps'
import { PlacedOrderPanel } from './placed/placed-loader'
import { ReceiverSection } from './receiver-section'
import { stepHeadingId, StepSection } from './step-header'
import { PaymentSummary, ReceiverSummary, ShippingSummary } from './step-summaries'
import type { CheckoutTerms } from './terms-checks'
import { useCheckout } from './use-checkout'
import { MOVES_STEP, usePlaceOrder } from './use-place-order'

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

/**
 * When the step changes while the shopper works in the page, its heading takes the focus: the
 * focus is in the page, or was until what had it went with the step that closed (a radio of the
 * receiver step). Never on its own after a load (nothing focused there yet), nor away from a
 * field of the new step that took it (a refused receiver's first field in error).
 */
function useStepFocus(step: CheckoutStep) {
  const page = useRef<HTMLDivElement>(null)
  const last = useRef(step)
  const inPage = useRef(false)
  useEffect(() => {
    const track = (event: FocusEvent) => {
      const target = event.target as Node | null
      inPage.current = !!target && (page.current?.contains(target) ?? false)
    }
    document.addEventListener('focusin', track)
    return () => document.removeEventListener('focusin', track)
  }, [])
  useEffect(() => {
    if (last.current === step) return
    last.current = step
    const active = document.activeElement
    const lost = active === null || active === document.body
    const heading = document.getElementById(stepHeadingId(step))
    // Already inside the new step (its first field in error took it): it stays there.
    if (heading?.closest('section')?.contains(active)) return
    if (lost ? inPage.current : (page.current?.contains(active) ?? false)) heading?.focus()
  }, [step])
  return page
}

export interface CheckoutPageProps {
  /** The payment catalog from the server's cache, its texts sanitised there. */
  catalog: PaymentCatalog
  /** The operator's sentences to accept, sanitised on the server. */
  terms: CheckoutTerms
  /** The shop's support line (E.164), for a payment the shop cannot take. */
  supportPhone: string | null
}

export function CheckoutPage({ catalog: initial, terms, supportPhone }: CheckoutPageProps) {
  const catalog = usePaymentCatalog(initial)
  const { data: current } = useCart()
  const { hasSession } = useSession()
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
  const checkout = useCheckout({ paymentReady: payment.chosen !== null })
  const placement = usePlaceOrder(checkout, payment)
  const { cart, cartQuery, signedIn, done, step } = checkout
  const expire = useSessionExpired()
  const page = useStepFocus(step)

  const { error } = cartQuery
  useEffect(() => {
    if (signedIn && isSessionExpiredError(error)) expire()
  }, [signedIn, error, expire])

  if (placement.placed) {
    return <PlacedOrderPanel ctx={placement.placed} catalog={catalog} supportPhone={supportPhone} />
  }
  if (checkout.sessionEnded) return <SessionEnded />
  if (!cart) {
    if (!cartQuery.isError) return <CheckoutSkeleton />
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
  if (cart.is_empty) return <EmptyCheckout />

  const blocked = checkoutBlock(cart, false) === CHECKOUT_ISSUES
  // A refusal whose fix is in an earlier step is said at the top, until the review again.
  const moved =
    placement.notice && MOVES_STEP.has(placement.notice.problem) && step !== 'review'
      ? placement.notice
      : null
  const state = (of: CheckoutStep): StepState => (blocked ? 'locked' : stepState(of, step, done))
  const edit = (of: CheckoutStep) => (blocked ? undefined : () => checkout.edit(of))
  // The shopper at work in the page: the bodies of the steps ahead are fetched meanwhile (each
  // loads by itself when its step opens).
  const ahead = () => preloadAhead(step, signedIn)
  return (
    <div
      ref={page}
      onPointerOver={ahead}
      onFocus={ahead}
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6"
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
            catalogMissing={catalog.methods === null}
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
          />
        </StepSection>
      </div>
      <CheckoutSummaryAside cart={cart} />
    </div>
  )
}
