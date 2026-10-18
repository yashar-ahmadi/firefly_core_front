'use client'

import { useEffect, useRef } from 'react'
import { ListError } from '@/features/account/lists/list-error'
import { CHECKOUT_ISSUES, checkoutBlock } from '@/features/cart/checkout-block'
import { CartNotices } from '@/features/cart/components/cart-notices'
import { useSessionExpired } from '@/lib/session/use-session-expired'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { focusCheckoutHeading } from './checkout-heading'
import { CheckoutSkeleton, EmptyCheckout, SessionEnded, UnorderableBanner } from './checkout-states'
import { stepState, type CheckoutStep, type StepState } from './checkout-steps'
import { CheckoutSummaryAside, CheckoutSummaryFolded } from './checkout-summary'
import { ReceiverSection } from './receiver-section'
import { ShippingSection } from './shipping-section'
import { stepHeadingId, StepSection } from './step-header'
import { ReceiverSummary, ShippingSummary } from './step-summaries'
import { useCheckout } from './use-checkout'

// `/checkout/` (spec §8.7): one page, its steps in order (receiver and destination, shipping;
// Task 3: payment, review and placement), each a section of its own, the summary of the API's
// amounts beside them (folded at the top on phones). Only a cart that can be ordered gets the
// steps: an empty one (or a guest cart that is gone) shows the way back, one with lines that
// cannot be ordered sends the shopper back to the cart.

const TITLES: Record<CheckoutStep, string> = {
  receiver: 'گیرنده و آدرس',
  shipping: 'روش ارسال',
  payment: 'پرداخت',
  review: 'بازبینی و ثبت سفارش',
}

/**
 * When the step changes while the shopper works in the page, its heading takes the focus: the
 * focus is in the page, or was until what had it went with the step that closed (a radio of the
 * receiver step). Never on its own after a load (nothing focused there yet).
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
    if (lost ? inPage.current : (page.current?.contains(active) ?? false)) {
      document.getElementById(stepHeadingId(step))?.focus()
    }
  }, [step])
  return page
}

export function CheckoutPage() {
  const checkout = useCheckout()
  const { cart, cartQuery, signedIn, done, step } = checkout
  const expire = useSessionExpired()
  const page = useStepFocus(step)

  const { error } = cartQuery
  useEffect(() => {
    if (signedIn && isSessionExpiredError(error)) expire()
  }, [signedIn, error, expire])

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
  const state = (of: CheckoutStep): StepState => (blocked ? 'locked' : stepState(of, step, done))
  const edit = (of: CheckoutStep) => (blocked ? undefined : () => checkout.edit(of))
  return (
    <div
      ref={page}
      className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_24rem] lg:items-start lg:gap-6"
    >
      <div className="flex min-w-0 flex-col gap-4">
        <CheckoutSummaryFolded cart={cart} />
        {blocked && <UnorderableBanner />}
        <CartNotices cart={cart} onEmpty={focusCheckoutHeading} />
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
          <ShippingSection checkout={checkout} />
        </StepSection>
        <StepSection step="payment" number={3} title={TITLES.payment} state={state('payment')}>
          <p className="text-base leading-7 text-ink-700">
            {'روش\u{200C}های پرداخت به\u{200C}زودی در این بخش نمایش داده می\u{200C}شوند.'}
          </p>
        </StepSection>
        <StepSection step="review" number={4} title={TITLES.review} state={state('review')} />
      </div>
      <CheckoutSummaryAside cart={cart} />
    </div>
  )
}
