import type { Cart } from '@/lib/api/types/cart'

// The checkout's steps, derived from the cart the API returned (never from what the page
// believes it sent) and the page's own state: a guest's receiver confirmed, a payment route
// the rules allow for the cart's amounts, a done step the shopper reopened. The review is the
// last step: never done (placing the order ends the checkout). Pure.

export const CHECKOUT_STEPS = ['receiver', 'shipping', 'payment', 'review'] as const
export type CheckoutStep = (typeof CHECKOUT_STEPS)[number]
export type StepState = 'done' | 'active' | 'locked'

/**
 * The cart has a destination the shipping rules can price: a city. Signed in, it must be one of
 * the visitor's saved addresses (placement sends no receiver then); a raw province and city (a
 * guest's, kept by an adoption) is not one.
 */
export function destinationReady(cart: Cart, signedIn: boolean): boolean {
  const destination = cart.destination
  if (!destination || destination.city_id === null) return false
  return signedIn ? destination.address !== null : true
}

/** A shipping method is chosen and the API can still price it (a stale one is not). */
export function shippingReady(cart: Cart): boolean {
  return cart.shipping.is_selected && cart.shipping.is_available
}

export interface StepInput {
  cart: Cart
  signedIn: boolean
  /**
   * A guest's receiver: «ادامه» pressed since its last change, its values passing the checks,
   * for the city it names, while the shop takes guest orders (`guest_checkout`).
   */
  receiver: { confirmed: boolean; valid: boolean; city: number | null }
  guestCheckout: boolean
  /** A payment route is chosen (or chosen for the shopper) that the rules allow now. */
  paymentReady: boolean
}

/** Each step's own condition; the review is never done. */
export function doneSteps({
  cart,
  signedIn,
  receiver,
  guestCheckout,
  paymentReady,
}: StepInput): Record<CheckoutStep, boolean> {
  const guestReceiver =
    guestCheckout &&
    receiver.confirmed &&
    receiver.valid &&
    receiver.city === cart.destination?.city_id
  const receiverDone = destinationReady(cart, signedIn) && (signedIn || guestReceiver)
  const shippingDone = receiverDone && shippingReady(cart)
  const paymentDone = shippingDone && paymentReady
  return { receiver: receiverDone, shipping: shippingDone, payment: paymentDone, review: false }
}

/**
 * Whether a step can be the one reopened: every step before it is done. When the cart takes an
 * earlier step back (a destination gone in another tab, a login that makes a guest's raw
 * destination none), that earlier step comes first.
 */
export function canReopen(done: Record<CheckoutStep, boolean>, step: CheckoutStep): boolean {
  return CHECKOUT_STEPS.slice(0, CHECKOUT_STEPS.indexOf(step)).every((before) => done[before])
}

/** The step the shopper is on: the one reopened (while it can be), else the first not done. */
export function activeStep(
  done: Record<CheckoutStep, boolean>,
  editing: CheckoutStep | null,
): CheckoutStep {
  if (editing && canReopen(done, editing)) return editing
  return CHECKOUT_STEPS.find((step) => !done[step]) ?? 'review'
}

/** How a step shows: the active one open, a done one as its summary, the others waiting. */
export function stepState(
  step: CheckoutStep,
  active: CheckoutStep,
  done: Record<CheckoutStep, boolean>,
): StepState {
  if (step === active) return 'active'
  return done[step] ? 'done' : 'locked'
}
