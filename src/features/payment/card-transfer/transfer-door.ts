import { findGuestOrder } from '@/features/orders/guest-orders'
import { linkTokenOf } from '@/features/orders/pay-link'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { readOwnOrder } from '../order-lookup'
import { payAgainDoor, type PayAgainDoor } from '../pay-again'
import { getPending } from '../pending-payments'

// The order behind a card-transfer page, as far as this device knows it (order digest §5.7,
// §5.10 step 4): the payment's status gives only its order code. Its door for a new attempt
// (pay-again.ts: the pending payment saved before this page, a recent guest order's token, or,
// for the order's signed-in owner, a lookup by code), and its payment link's token, which leads
// to the attempt's real cut-off (the link page's `open_attempt.expires_at`) and to the order's
// route choice (the link page works signed in too, digest §5.7 step 2). Nothing is made up: no
// token known and no owner to look it up for → none. Tokens are credentials: never logged.

export interface TransferOrder {
  uuid: string
  orderCode: string | null
  /** Signed in as the payment's owner (its status was read with the session). */
  owner: boolean
}

/** The door for a new attempt on this order. */
export function transferDoor({ uuid, orderCode, owner }: TransferOrder): PayAgainDoor {
  const guest = !owner && orderCode ? findGuestOrder(orderCode) : null
  return payAgainDoor({
    pending: getPending(uuid),
    orderCode,
    owner,
    guestToken: guest?.linkToken ?? null,
  })
}

/** The token this device holds for the order's link, with no request. */
export function storedLinkToken({ uuid, orderCode }: TransferOrder): string | null {
  return (
    getPending(uuid)?.linkToken ?? (orderCode ? findGuestOrder(orderCode)?.linkToken : null) ?? null
  )
}

/**
 * The order's link token: kept on this device, or the owner's order read by its code (null when
 * it cannot be read). A session found gone is thrown (`isSessionExpiredError`): end it.
 */
export async function findLinkToken(order: TransferOrder): Promise<string | null> {
  const stored = storedLinkToken(order)
  if (stored || !order.owner || !order.orderCode) return stored
  try {
    return linkTokenOf((await readOwnOrder(order.orderCode)).payment_url)
  } catch (error) {
    if (isSessionExpiredError(error)) throw error
    return null
  }
}
