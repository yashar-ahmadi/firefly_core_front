'use client'

import dynamic from 'next/dynamic'
import { Skeleton } from '@/components/ui/skeleton'
import { reloadPage } from '@/lib/navigation/hard-navigation'
import type { CheckoutStep } from './checkout-steps'

// The checkout's step bodies (Task 3's amendment: the JS budget counts what visitors load). The
// page itself is the steps' frame: each step's numbered heading, a done step's summary in a
// line, a locked step's heading alone. Only the open step's body is code the page fetches, when
// it opens: the guest's receiver form or the signed-in address picker, the shipping options, the
// payment routes, the review. A shopper back at the checkout with everything chosen loads the
// review's alone. Each body is its own chunk; while it comes, its section keeps its heading (the
// focus can go there at once) over a skeleton. A chunk that cannot load (a deploy since the page
// loaded, the connection) says so in its section with a reload; the cart and the receiver's
// draft are kept. The shopper at work in the page fetches the bodies of the steps still ahead
// meanwhile (`preloadAhead`).

/** One request however often it is asked for; a failed one may be asked again. */
function once<T>(importer: () => Promise<T>): () => Promise<T> {
  let loading: Promise<T> | null = null
  return () =>
    (loading ??= importer().catch((error: unknown) => {
      loading = null
      throw error
    }))
}

const guestForm = once(() => import('./guest-receiver-form'))
const addressPicker = once(() => import('./address-picker'))
const shipping = once(() => import('./shipping-section'))
const payment = once(() => import('./payment-section'))
const review = once(() => import('./review-section'))

/** A step's body on its way, or a choice being made for the shopper: a skeleton, named. */
export function StepLoading({
  label = 'در حال بارگذاری',
  room = false,
}: {
  label?: string
  /**
   * Keeps the guest receiver form's room (`guest-form-room` in globals.css), so the steps below
   * stay put when the form comes (Plan 5 Task 8: the swap was a CLS of 0.45 on a phone).
   */
  room?: boolean
}) {
  return (
    <div
      role="status"
      aria-label={label}
      // Whole strings: Prettier's Tailwind plugin trims the space a joined class would need.
      className={room ? 'flex guest-form-room flex-col gap-3' : 'flex flex-col gap-3'}
    >
      {/* Read out by the live region (its name alone is not announced). */}
      <span className="sr-only">{`${label}…`}</span>
      <Skeleton className="h-16 rounded-card" />
      <Skeleton className="h-16 rounded-card" />
    </div>
  )
}

function StepUnavailable() {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center gap-3 text-base leading-7 text-ink-800"
    >
      <span>این بخش بارگذاری نشد.</span>
      <button
        type="button"
        onClick={reloadPage}
        className="h-11 rounded-control border border-ink-300 bg-white px-4 font-medium text-ink-800 hover:bg-ink-50"
      >
        بارگذاری دوباره
      </button>
    </div>
  )
}

export const GuestReceiverForm = dynamic(
  () =>
    guestForm()
      .then((module) => module.GuestReceiverForm)
      .catch(() => StepUnavailable),
  { loading: () => <StepLoading room /> },
)

export const AddressPicker = dynamic(
  () =>
    addressPicker()
      .then((module) => module.AddressPicker)
      .catch(() => StepUnavailable),
  { loading: () => <StepLoading /> },
)

export const ShippingSection = dynamic(
  () =>
    shipping()
      .then((module) => module.ShippingSection)
      .catch(() => StepUnavailable),
  { loading: () => <StepLoading /> },
)

export const PaymentSection = dynamic(
  () =>
    payment()
      .then((module) => module.PaymentSection)
      .catch(() => StepUnavailable),
  { loading: () => <StepLoading /> },
)

export const ReviewSection = dynamic(
  () =>
    review()
      .then((module) => module.ReviewSection)
      .catch(() => StepUnavailable),
  { loading: () => <StepLoading /> },
)

const BODIES: Record<CheckoutStep, (signedIn: boolean) => Promise<unknown>> = {
  receiver: (signedIn) => (signedIn ? addressPicker() : guestForm()),
  shipping: () => shipping(),
  payment: () => payment(),
  review: () => review(),
}
const ORDER: CheckoutStep[] = ['receiver', 'shipping', 'payment', 'review']

/**
 * Fetches the bodies of the steps after `step` (the shopper at work in the page: a pointer over
 * it, a focus in it), never on arrival alone. Never rejects.
 */
export function preloadAhead(step: CheckoutStep, signedIn: boolean): void {
  for (const next of ORDER.slice(ORDER.indexOf(step) + 1)) {
    void BODIES[next](signedIn).catch(() => undefined)
  }
}
