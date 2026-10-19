'use client'

import dynamic from 'next/dynamic'
import { useEffect, useEffectEvent, useRef, useState, type ReactNode } from 'react'
import { AuthForm } from '@/components/form/auth-form'
import { useSubmitWait } from '@/components/form/code-timers'
import { SubmitButton } from '@/components/form/submit-button'
import { Field } from '@/components/ui/field'
import { buttonClasses } from '@/components/ui/button-styles'
import { Textarea } from '@/components/ui/textarea'
import { throttleWait } from '@/features/account/lists/list-error'
import { CartSummary } from '@/features/cart/components/cart-summary'
import type { RouteChoiceState } from '@/features/payment/use-route-choice'
import { CUSTOMER_NOTE_MAX } from '@/lib/api/types/order'
import { toPersianDigits } from '@/lib/format'
import { ensurePlacementKey } from './placement-key-reach'
import { preloadPlacedPanel } from './placed/placed-loader'
import { ReviewDetails, ReviewLines } from './review-parts'
import { missingTerms, TermsChecks, type CheckoutTerms, type TermKey } from './terms-checks'
import { TotalChangedBody, type TotalChangedProps } from './total-changed-body'
import type { Checkout } from './use-checkout'
import { NoticeBox } from './placement-notice'
import { MOVES_STEP, type Placement } from './use-place-order'

// «بازبینی و ثبت سفارش» (spec §8.7; order digest §5.1–5.2; cart digest §6 step 9): reaching it
// makes the purchase's placement key and reads the cart again (prices are live; the steps go
// back by themselves when the cart says so); then the lines, where and how it goes and is paid,
// the API's summary (the online and at-the-door shares), an optional note, the operator's
// sentences to accept, and «ثبت سفارش و پرداخت», which waits for that read. A refusal is said
// here, next to the button.

/** The "total changed" dialog, loaded on that refusal; without its chunk, the same in place. */
const TotalChangedDialog = dynamic(() =>
  import('./total-changed-dialog')
    .then((module) => module.TotalChangedDialog)
    .catch(() => TotalChangedInline),
)

function TotalChangedInline({
  cart,
  previous,
  canConfirm,
  onReview,
  onConfirm,
}: TotalChangedProps) {
  return (
    <div role="alert" className="flex flex-col gap-3 rounded-card bg-warning/10 p-4">
      <p className="text-lg leading-8 font-bold text-ink-900">مبلغ سفارش تغییر کرد</p>
      <TotalChangedBody cart={cart} previous={previous} />
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClasses({ variant: 'outline' })} onClick={onReview}>
          بازبینی دوباره
        </button>
        {canConfirm && (
          <button type="button" className={buttonClasses()} onClick={() => onConfirm(cart.total)}>
            ثبت سفارش با مبلغ جدید
          </button>
        )}
      </div>
    </div>
  )
}

/** `run` once the browser is idle (a short timeout where it cannot say). */
function whenIdle(run: () => void): void {
  if (typeof window.requestIdleCallback === 'function') {
    window.requestIdleCallback(run, { timeout: 2000 })
  } else {
    setTimeout(run, 1)
  }
}

export interface ReviewSectionProps {
  checkout: Checkout
  payment: RouteChoiceState
  placement: Placement
  terms: CheckoutTerms
  /** The operator's terms dialog links (rendered by the route), beside the terms' checkbox. */
  termsLinks?: ReactNode
}

export function ReviewSection({
  checkout,
  payment,
  placement,
  terms,
  termsLinks,
}: ReviewSectionProps) {
  const cart = checkout.cart!
  // The cart read again on arrival (prices are live): the button works once it is back; a read
  // that failed says so, with another try (never a press on a cart not read).
  const [check, setCheck] = useState<'reading' | 'done' | 'failed'>('reading')
  const verify = () =>
    checkout.cartQuery.refetch().then(({ isError }) => setCheck(isError ? 'failed' : 'done'))
  const reached = useEffectEvent(() => {
    ensurePlacementKey()
    void verify()
  })
  useEffect(() => reached(), [])
  const verified = check === 'done'

  const [accepted, setAccepted] = useState({ accept: false, legalAge: false })
  const [termErrors, setTermErrors] = useState<TermKey[]>([])
  const form = useRef<HTMLDivElement>(null)
  const lock = useSubmitWait(throttleWait(placement.throttle?.error, placement.throttle?.at ?? 0))

  /** Every confirmation, the dialog's too: the cart read, the sentences ticked, no wait. */
  function submit(total?: number) {
    if (placement.placing || lock.locked || !verified) return
    const missing = missingTerms(terms, accepted)
    setTermErrors(missing)
    if (missing.length > 0) {
      placement.closeTotalChanged()
      form.current?.querySelector<HTMLElement>(`[data-term="${missing[0]}"]`)?.focus()
      return
    }
    void placement.place(total)
  }

  const changed = placement.totalChanged
  const online = cart.amount_charged_online > 0
  // The payment that follows the press is fetched once the shopper works in the form (a press
  // in it, the focus in it: a box ticked, the button reached), when the browser is idle; never
  // on the step's arrival alone (a returning shopper lands here: the JavaScript budget).
  const working = useRef(false)
  const reach = () => {
    if (working.current) return
    working.current = true
    whenIdle(preloadPlacedPanel)
  }
  return (
    <div ref={form} className="flex flex-col gap-5" onPointerDown={reach} onFocus={reach}>
      <ReviewLines cart={cart} />
      <ReviewDetails checkout={checkout} payment={payment} />
      <CartSummary
        cart={cart}
        variant="checkout"
        title="مبالغ سفارش"
        className="rounded-card bg-ink-50 p-4"
      />
      <AuthForm className="gap-4" onSubmit={submit}>
        <Field
          label={
            <>
              توضیحات سفارش <span className="font-normal text-ink-600">(اختیاری)</span>
            </>
          }
          hint={`حداکثر ${toPersianDigits(CUSTOMER_NOTE_MAX)} نویسه`}
          error={placement.noteError}
        >
          <Textarea
            name="customer-note"
            rows={3}
            maxLength={CUSTOMER_NOTE_MAX}
            value={placement.note}
            onChange={(event) => placement.setNote(event.currentTarget.value)}
          />
        </Field>
        <TermsChecks
          terms={terms}
          links={termsLinks}
          accepted={accepted}
          errors={termErrors}
          onChange={(key, checked) => {
            setAccepted((current) => ({ ...current, [key]: checked }))
            if (checked) setTermErrors((current) => current.filter((item) => item !== key))
          }}
        />
        {placement.notice && !MOVES_STEP.has(placement.notice.problem) && (
          <NoticeBox notice={placement.notice} cart={cart} />
        )}
        <SubmitButton
          busy={placement.placing || check === 'reading'}
          disabled={check === 'failed'}
          lock={lock}
          className="sm:w-auto sm:self-start"
        >
          {online ? 'ثبت سفارش و پرداخت' : 'ثبت و تأیید سفارش'}
        </SubmitButton>
        {check === 'reading' && (
          <p role="status" className="text-sm leading-6 text-ink-600">
            {'در حال به\u{200C}روزرسانی سبد خرید…'}
          </p>
        )}
        {check === 'failed' && (
          <div role="alert" className="flex flex-wrap items-center gap-3 text-base leading-7">
            <span className="text-danger">
              {'سبد خرید به\u{200C}روز نشد؛ پیش از ثبت سفارش دوباره تلاش کنید.'}
            </span>
            <button
              type="button"
              className={buttonClasses({ variant: 'outline', size: 'sm' })}
              onClick={() => {
                setCheck('reading')
                void verify()
              }}
            >
              تلاش دوباره
            </button>
          </div>
        )}
      </AuthForm>
      {changed && (
        <TotalChangedDialog
          cart={cart}
          previous={changed.previous}
          canConfirm={payment.chosen !== null}
          onReview={placement.closeTotalChanged}
          onConfirm={submit}
        />
      )}
    </div>
  )
}
