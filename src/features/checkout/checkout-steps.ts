import type { Cart } from '@/lib/api/types/cart'

// The checkout's steps, derived from the cart the API returned (never from what the page
// believes it sent) and the page's own state: a guest's receiver confirmed, a done step the
// shopper reopened. Pure. Task 3 adds the payment and review steps' own conditions here.

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
  /** A guest pressed «ادامه» with a receiver for the city it names. */
  receiver: { confirmed: boolean; city: number | null }
}

/** Each step's own condition. Task 2 builds the first two: payment and review are never done. */
export function doneSteps({ cart, signedIn, receiver }: StepInput): Record<CheckoutStep, boolean> {
  const guestReceiver = receiver.confirmed && receiver.city === cart.destination?.city_id
  const receiverDone = destinationReady(cart, signedIn) && (signedIn || guestReceiver)
  const shippingDone = receiverDone && shippingReady(cart)
  return { receiver: receiverDone, shipping: shippingDone, payment: false, review: false }
}

/** The step the shopper is on: the one reopened, else the first not done. */
export function activeStep(
  done: Record<CheckoutStep, boolean>,
  editing: CheckoutStep | null,
): CheckoutStep {
  if (editing) return editing
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
