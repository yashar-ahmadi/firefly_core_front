import { bffFetch } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'
import type { OrderPaymentLink } from '@/lib/api/types/order'
import { linkRefusalOf, type LinkRefusal } from './link-refusal'

// The payment link's calls from the browser, through the BFF (order digest §3.1.9–3.1.10): the
// page read again after the shopper acted (never in a loop: 30/min `order_payment_link`), and
// the guest's cancellation through the link (`POST order/pay/<token>/cancel/`, an optional
// reason of at most 500 characters). Never throw. The token is a credential: path only.

export type LinkRead = { ok: true; link: OrderPaymentLink } | { ok: false; refusal: LinkRefusal }

export async function readLink(token: string): Promise<LinkRead> {
  try {
    return { ok: true, link: (await bffFetch<OrderPaymentLink>(`order/pay/${token}/`)).data }
  } catch (error) {
    return { ok: false, refusal: linkRefusalOf(error) }
  }
}

/** The reason's own limit (`OrderCancelSerializer.reason`). */
export const CANCEL_REASON_MAX = 500

export type CancelOrderOutcome =
  | { ok: true; link: OrderPaymentLink }
  /** The link itself refuses now (cancelled meanwhile, expired, paid): the page shows it. */
  | { ok: false; refusal: LinkRefusal }
  /** Said in the dialog: `order_cancellation_not_allowed`, the reason's own error, a wait. */
  | { ok: false; refusal: null; detail: string; field: boolean }

const LINK_REFUSALS = new Set([
  'order_payment_link_invalid',
  'order_payment_link_expired',
  'order_already_settled',
  'order_collected_on_delivery',
  'order_not_payable',
])

export async function cancelOrder(token: string, reason: string): Promise<CancelOrderOutcome> {
  const body = reason.trim() ? { reason: reason.trim() } : {}
  try {
    const { data } = await bffFetch<OrderPaymentLink>(`order/pay/${token}/cancel/`, {
      method: 'POST',
      body,
    })
    return { ok: true, link: data }
  } catch (error) {
    if (error instanceof ApiError && LINK_REFUSALS.has(error.code)) {
      return { ok: false, refusal: linkRefusalOf(error) }
    }
    const refusal = linkRefusalOf(error)
    const own = error instanceof ApiError ? error.fieldErrors().reason : undefined
    return {
      ok: false,
      refusal: null,
      detail: own ?? refusal.detail,
      field: own !== undefined,
    }
  }
}
