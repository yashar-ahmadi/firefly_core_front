import type { PaymentRoute } from '@/lib/api/types/payment'
import type { PaymentDoor } from './api'
import type { PendingPayment } from './pending-payments'

// «پرداخت دوباره» on the result page (order digest §5.10 step 4): which door the new attempt
// goes through. The status endpoint gives neither the order's uuid nor its link token, so the
// door comes from what this device kept: the pending payment saved before the bank (its order
// uuid, for its owner, or its link token), else, not the owner, the recent guest orders' token,
// else, the owner, the order looked up by its code (`GET order/<code>/` → `uuid`, on the press).
// Not the owner: a guest, or a signed-in payer of another account's order or a guest's (its
// status was read without the session, §11 #7); their account holds no such order. Nothing
// known (the result opened on another device): no door, never a made-up one; the page sends the
// shopper to tracking or the SMS link instead. Pure.

/** Where to pay again when this device knows no door: a guest's (or another payer's) words. */
export const NO_DOOR_GUEST =
  'برای پرداخت دوباره، لینک پرداختی را که با پیامک برایتان فرستاده شده باز کنید یا سفارش را از «پیگیری سفارش» پیدا کنید.'
/** The same for the order's owner. */
export const NO_DOOR_USER = 'برای پرداخت دوباره به صفحهٔ سفارش بروید.'

export type PayAgainDoor =
  | { kind: 'known'; door: PaymentDoor }
  /** The owner: the order's uuid is read by its code when the shopper presses. */
  | { kind: 'lookup'; orderCode: string }
  | { kind: 'none' }

export interface PayAgainInput {
  /** The pending payment saved before the bank, on this device (null: none). */
  pending: PendingPayment | null
  /** The payment's order (null: not an order's, e.g. a top-up). */
  orderCode: string | null
  /** Signed in as the order's owner (its payment was read with the session). */
  owner: boolean
  /** The order's link token from this device's recent guest orders (null: none). */
  guestToken: string | null
}

export function payAgainDoor({
  pending,
  orderCode,
  owner,
  guestToken,
}: PayAgainInput): PayAgainDoor {
  if (!orderCode) return { kind: 'none' }
  // The owner's door needs the owner's session.
  if (owner && pending?.orderUuid) {
    return { kind: 'known', door: { kind: 'uuid', orderUuid: pending.orderUuid } }
  }
  // Anyone holding the link may pay through it (the bank routes need no account).
  const token = pending?.linkToken ?? guestToken
  if (token) return { kind: 'known', door: { kind: 'link', token } }
  return owner ? { kind: 'lookup', orderCode } : { kind: 'none' }
}

/**
 * The route of the new attempt: the bank again, or the wallet and the bank when the shopper had
 * chosen them and is still signed in (the wallet's part was given back when the attempt failed).
 */
export function payAgainRoute(pending: PendingPayment | null, hasSession: boolean): PaymentRoute {
  return pending?.route === 'wallet_and_gateway' && hasSession
    ? 'wallet_and_gateway'
    : 'bank_gateway'
}
