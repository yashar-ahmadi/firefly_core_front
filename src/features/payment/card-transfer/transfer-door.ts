import { findGuestOrder } from '@/features/orders/guest-orders'
import { linkTokenOf } from '@/features/orders/pay-link'
import type { OwnOrder } from '../order-lookup'
import { payAgainDoor, type PayAgainDoor } from '../pay-again'
import { getPending } from '../pending-payments'

// The order behind a card-transfer page, as far as this device knows it (order digest §5.7,
// §5.10 step 4): the payment's status gives only its order code. Its door for a new attempt
// (pay-again.ts: the confirmed owner's order uuid, else the link token of the pending payment
// saved before this page or of a recent guest order), and its payment link's token, which leads
// to the attempt's real cut-off (the link page's `open_attempt.expires_at`) and to the order's
// route choice (the link page works signed in too, digest §5.7 step 2). Nothing is made up and
// nothing is read here: the owner's order comes read already (use-order-ownership.ts, once per
// page). Tokens are credentials: never logged.

export interface TransferOrder {
  uuid: string
  orderCode: string | null
  /** The order, read for this account (its confirmed owner); null: not this account's. */
  own: OwnOrder | null
}

/** The door for a new attempt on this order. */
export function transferDoor({ uuid, orderCode, own }: TransferOrder): PayAgainDoor {
  const guest = !own && orderCode ? findGuestOrder(orderCode) : null
  return payAgainDoor({
    pending: getPending(uuid),
    orderCode,
    ownOrderUuid: own?.uuid ?? null,
    guestToken: guest?.linkToken ?? null,
  })
}

/** The token this device holds for the order's link. */
export function storedLinkToken({ uuid, orderCode }: TransferOrder): string | null {
  return (
    getPending(uuid)?.linkToken ?? (orderCode ? findGuestOrder(orderCode)?.linkToken : null) ?? null
  )
}

/** The order's link token: kept on this device, else the confirmed owner's order's link. */
export function orderLinkToken(order: TransferOrder): string | null {
  return storedLinkToken(order) ?? (order.own ? linkTokenOf(order.own.payment_url) : null)
}
