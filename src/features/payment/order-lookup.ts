import { bffFetch } from '@/lib/api/client'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'
import { IntentError, type PaymentDoor } from './api'

// A signed-in owner's order read by its code (`GET order/<code>/`, order digest §3.1.3), for what
// a payment's status does not give: the order's uuid (the owner's door for a new intent) and its
// `payment_url` (the link's token: the attempt's real cut-off on the link page, and its routes).
// Shared by the result page's «پرداخت دوباره» and the card-transfer page. The uuid and the link
// are bearer credentials: never logged.

export const LOOKUP_FAILED =
  'این سفارش در حساب شما خوانده نشد؛ برای پرداخت از صفحهٔ سفارش یا لینک پرداخت پیامک\u{200C}شده استفاده کنید.'

/** The fields of `OrderDetail` read here. */
export interface OwnOrder {
  uuid: string
  payment_url: string | null
}

/** Throws `ApiError`. */
export async function readOwnOrder(orderCode: string): Promise<OwnOrder> {
  return (await bffFetch<OwnOrder>(`order/${orderCode}/`)).data
}

/** The lookup failed for another reason than the session (its order is not in this account). */
export class LookupError extends Error {}

/**
 * `GET order/<code>/` → its uuid: the owner's door. A session found gone ends like an intent's
 * 401 (`IntentError('session')`); any other failure is a `LookupError`.
 */
export async function lookupDoor(orderCode: string): Promise<PaymentDoor> {
  try {
    return { kind: 'uuid', orderUuid: (await readOwnOrder(orderCode)).uuid }
  } catch (error) {
    if (isSessionExpiredError(error)) throw new IntentError('session', error)
    throw new LookupError()
  }
}
