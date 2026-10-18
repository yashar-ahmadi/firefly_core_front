import { bffFetch } from '@/lib/api/client'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'
import type { OrderDetail } from '@/lib/api/types/order-detail'
import { isSessionExpiredError } from '@/lib/session/viewer-queries'

// «لغو سفارش» from the account (order digest §3.1.4, §5.14, §8.2): `POST order/<code>/cancel/` with
// an optional reason (≤ 500, for the shop's eyes only). 200 → the order as it is now (cancelled,
// its link revoked); every refusal becomes what the dialog says and whether the order must be
// read again. Money already settled is never "refunded" by this: the shop's support returns it.
// Never throws.

export const CANCEL_REASON_MAX = 500

export type CancelRefusal =
  /** Cancelled already (another tab, the link): the order is read again. */
  | 'already'
  /** A receipt is under review (the order is too, §6.1): not now. The order is read again. */
  | 'receipt_pending'
  /** It is past awaiting payment: support only. The order is read again. */
  | 'not_allowed'
  /** Not this account's, or gone. */
  | 'not_found'
  /** The reason's own error (under the field). */
  | 'field'
  | 'throttled'
  | 'session'
  | 'other'

export type CancelOutcome =
  | { ok: true; order: OrderDetail }
  | { ok: false; refusal: CancelRefusal; detail: string; retryAfter: number | null }

export const CANCEL_COPY: Record<Exclude<CancelRefusal, 'field' | 'other'>, string> = {
  already: 'این سفارش پیش\u{200C}تر لغو شده است.',
  receipt_pending: 'رسید پرداخت این سفارش در حال بررسی است؛ امکان لغو نیست.',
  not_allowed:
    'این سفارش دیگر از این\u{200C}جا لغو نمی\u{200C}شود؛ برای لغو آن با پشتیبانی تماس بگیرید.',
  not_found: 'سفارش پیدا نشد.',
  throttled: 'لطفاً کمی بعد دوباره تلاش کنید.',
  session: 'نشست شما به پایان رسید؛ دوباره وارد شوید.',
}

const REFUSALS: Record<string, 'already' | 'receipt_pending' | 'not_allowed' | 'not_found'> = {
  order_already_cancelled: 'already',
  order_receipt_pending: 'receipt_pending',
  order_cancellation_not_allowed: 'not_allowed',
  not_found: 'not_found',
}

/** Whether the order must be read again after this refusal (it is not what the page shows). */
export const isStaleRefusal = (refusal: CancelRefusal) =>
  refusal === 'already' ||
  refusal === 'receipt_pending' ||
  refusal === 'not_allowed' ||
  refusal === 'not_found'

/** What the shopper is told once it is cancelled: never "refunded" (§3.1.4). */
export function cancelledText(order: OrderDetail): string {
  const { amount_settled_online: online, amount_settled_on_delivery: door } = order.money
  return online > 0 || door > 0
    ? 'سفارش لغو شد. درخواست بازگشت وجه ثبت شد و پشتیبانی آن را انجام می\u{200C}دهد.'
    : 'سفارش لغو شد.'
}

function refusalOf(error: unknown): Extract<CancelOutcome, { ok: false }> {
  const fail = (refusal: CancelRefusal, detail: string, retryAfter: number | null = null) => ({
    ok: false as const,
    refusal,
    detail,
    retryAfter,
  })
  if (isSessionExpiredError(error)) return fail('session', CANCEL_COPY.session)
  if (!(error instanceof ApiError)) return fail('other', GENERIC_ERROR_DETAIL)
  const known = REFUSALS[error.code]
  if (known && (error.status === 404 || error.status === 409))
    return fail(known, CANCEL_COPY[known])
  if (error.status === 429) return fail('throttled', CANCEL_COPY.throttled, error.retryAfter)
  const reason = error.fieldErrors().reason
  if (reason) return fail('field', reason)
  return fail('other', error.detail)
}

export async function cancelOrder(code: string, reason: string): Promise<CancelOutcome> {
  const text = reason.trim()
  try {
    const { data } = await bffFetch<OrderDetail>(`order/${code}/cancel/`, {
      method: 'POST',
      body: text ? { reason: text } : {},
    })
    return { ok: true, order: data }
  } catch (error) {
    return refusalOf(error)
  }
}
