import { bffFetch } from '@/lib/api/client'

// A signed-in owner's order read by its code (`GET order/<code>/`, order digest §3.1.3), for what
// a payment's status does not give: whether the order is this account's at all (the API answers
// it to its owner only: 404 otherwise), its uuid (the owner's door for a new intent) and its
// `payment_url` (the link's token: the attempt's real cut-off on the link page, and its routes).
// Read once per page (use-order-ownership.ts). The uuid and the link are bearer credentials:
// never logged.

/** The fields of `OrderDetail` read here. */
export interface OwnOrder {
  uuid: string
  payment_url: string | null
}

/** Throws `ApiError`. */
export async function readOwnOrder(orderCode: string, signal?: AbortSignal): Promise<OwnOrder> {
  return (await bffFetch<OwnOrder>(`order/${orderCode}/`, { signal })).data
}
