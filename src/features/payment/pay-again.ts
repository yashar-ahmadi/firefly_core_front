import type { PaymentRoute } from '@/lib/api/types/payment'
import type { PaymentDoor } from './api'
import type { PendingPayment } from './pending-payments'

// «پرداخت دوباره» on the result page (order digest §5.10 step 4): which door the new attempt
// goes through. The status endpoint gives neither the order's uuid nor its link token, so the
// door comes from what is known: the order's owner, the order's uuid, read for this account
// (`GET order/<code>/`, use-order-ownership.ts: being answered with the session is not ownership,
// a guest order's payment answers any signed-in visitor); anyone else, the link token this device
// kept (the pending payment saved before the bank, else the recent guest orders). Nothing known
// (the result opened on another device, a visitor whose order this account does not hold): no
// door, never a made-up one; the page sends the shopper to tracking or the SMS link instead. Pure.

/**
 * Where to pay again when no door is known (a guest on another device, or a visitor whose
 * account does not hold the order; its owner always has the uuid's door).
 */
export const NO_DOOR_GUEST =
  'برای پرداخت دوباره، لینک پرداختی را که با پیامک برایتان فرستاده شده باز کنید یا سفارش را از «پیگیری سفارش» پیدا کنید.'

export type PayAgainDoor = { kind: 'known'; door: PaymentDoor } | { kind: 'none' }

export interface PayAgainInput {
  /** The pending payment saved before the bank, on this device (null: none). */
  pending: PendingPayment | null
  /** The payment's order (null: not an order's, e.g. a top-up). */
  orderCode: string | null
  /** The order's uuid, read for this account: its confirmed owner (null: not, or not known). */
  ownOrderUuid: string | null
  /** The order's link token from this device's recent guest orders (null: none). */
  guestToken: string | null
}

export function payAgainDoor({
  pending,
  orderCode,
  ownOrderUuid,
  guestToken,
}: PayAgainInput): PayAgainDoor {
  if (!orderCode) return { kind: 'none' }
  // The owner's door needs the owner's session, and an order this account holds.
  if (ownOrderUuid) return { kind: 'known', door: { kind: 'uuid', orderUuid: ownOrderUuid } }
  // Anyone holding the link may pay through it (the bank routes need no account).
  const token = pending?.linkToken ?? guestToken
  return token ? { kind: 'known', door: { kind: 'link', token } } : { kind: 'none' }
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
