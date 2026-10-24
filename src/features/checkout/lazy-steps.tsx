'use client'

import { useEffect, useState, type ComponentType } from 'react'
import { Skeleton } from '@/components/ui/skeleton'
import { reloadPage } from '@/lib/navigation/hard-navigation'
import type { CheckoutStep } from './checkout-steps'

// The checkout's step bodies (Task 3's amendment: the JS budget counts what visitors load). The
// page itself is the steps' frame: each step's numbered heading, a done step's summary in a
// line, a locked step's heading alone. Only the open step's body is code the page fetches, when
// it opens: the guest's receiver form, the signed-in address picker or, in a shop that takes no
// guest orders, the guest's way to log in; the shipping options, the payment routes, the review. A shopper back at the checkout with everything chosen loads the
// review's alone. Each body is its own chunk; while it comes, its section keeps its heading (the
// focus can go there at once) over a skeleton. A chunk that cannot load (a deploy since the page
// loaded, the connection) says so in its section with a reload; the cart and the receiver's
// draft are kept. The shopper at work in the page fetches the bodies of the steps still ahead
// meanwhile (`preloadAhead`).

/** A step's body on its way, or a choice being made for the shopper: a skeleton, named. */
export function StepLoading({ label = 'در حال بارگذاری' }: { label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex flex-col gap-3">
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

/**
 * A step's body from its own chunk: its step's skeleton until the code is in, then the body, at
 * once when the code is in already (the page arrives with its open step's body: `loadBody`;
 * `next/dynamic` showed its skeleton for a frame and React held it 300 ms more, and the body's
 * arrival then moved the steps below). One request however often `load` is asked for; a failed
 * one may be asked again (a preload's failure is not the body's), and a body whose code cannot
 * load says so (StepUnavailable).
 */
function stepBody<P extends object>(importer: () => Promise<ComponentType<P>>) {
  let Body: ComponentType<P> | undefined
  let loading: Promise<unknown> | undefined
  const load = () =>
    (loading ??= importer().then(
      (component) => (Body = component),
      (error: unknown) => {
        loading = undefined
        throw error
      },
    ))
  function LazyBody(props: P) {
    const [, setLoaded] = useState(false)
    useEffect(() => {
      if (!Body)
        void load()
          .catch(() => (Body = StepUnavailable as ComponentType<P>))
          .then(() => setLoaded(true))
    }, [])
    return Body ? <Body {...props} /> : <StepLoading />
  }
  LazyBody.load = load
  return LazyBody
}

export const GuestReceiverForm = stepBody(() =>
  import('./guest-receiver-form').then((module) => module.GuestReceiverForm),
)
export const AddressPicker = stepBody(() =>
  import('./address-picker').then((module) => module.AddressPicker),
)
export const LoginPrompt = stepBody(() =>
  import('./login-prompt').then((module) => module.LoginPrompt),
)
export const ShippingSection = stepBody(() =>
  import('./shipping-section').then((module) => module.ShippingSection),
)
export const PaymentSection = stepBody(() =>
  import('./payment-section').then((module) => module.PaymentSection),
)
export const ReviewSection = stepBody(() =>
  import('./review-section').then((module) => module.ReviewSection),
)

/** The steps' bodies, in the steps' order (`guests`: the shop takes guest orders). */
const BODIES: Record<CheckoutStep, (signedIn: boolean, guests: boolean) => Promise<unknown>> = {
  receiver: (signedIn, guests) =>
    (signedIn ? AddressPicker : guests ? GuestReceiverForm : LoginPrompt).load(),
  shipping: ShippingSection.load,
  payment: PaymentSection.load,
  review: ReviewSection.load,
}
const ORDER = Object.keys(BODIES) as CheckoutStep[]

/** Loads the body of `step` (the page arrives once its open step's is in). Never rejects. */
export const loadBody = (
  step: CheckoutStep,
  signedIn: boolean,
  guests: boolean,
): Promise<unknown> => BODIES[step](signedIn, guests).catch(() => undefined)

/**
 * Fetches the bodies of the steps after `step` (the shopper at work in the page: a pointer over
 * it, a focus in it), never on arrival alone. Never rejects.
 */
export function preloadAhead(step: CheckoutStep, signedIn: boolean, guests: boolean): void {
  for (const next of ORDER.slice(ORDER.indexOf(step) + 1)) void loadBody(next, signedIn, guests)
}
