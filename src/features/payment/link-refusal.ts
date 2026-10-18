import { ApiError, NETWORK_ERROR_DETAIL } from '@/lib/api/errors'

// Why the payment link's page does not open (order digest §3.1.9, §8.2), in the server's order
// of refusals, and what the page says: our own title for each, the API's Persian detail under it
// where it has one worth reading, and our next steps (tracking, support). Pure, and safe on the
// server (the page renders a refusal there): nothing here comes from a client module.

/** A 429's sentence (the account lists' own, which live in a client module). */
const THROTTLED = 'لطفاً کمی بعد دوباره تلاش کنید.'

export type LinkRefusalKind =
  /** 404 `order_payment_link_invalid`: an unknown token, or a cancelled order (revoked). */
  | 'invalid'
  /** 410 `order_payment_link_expired`: the deadline passed (also an old order already paid). */
  | 'expired'
  /** 409 `order_already_settled`: everything owed online has arrived. */
  | 'settled'
  /** 409 `order_collected_on_delivery`: a confirmed pay-on-delivery order. */
  | 'collected'
  /** 409 `order_not_payable`: owed but not payable now (a receipt under review, say). */
  | 'not_payable'
  /** 429: the 30/min `order_payment_link` budget. */
  | 'throttled'
  /** No answer, or an answer we cannot read. */
  | 'unavailable'

export interface LinkRefusal {
  kind: LinkRefusalKind
  /** The API's sentence (or ours for a 429 or no answer). */
  detail: string
  /** A 429's wait, in seconds. */
  retryAfter: number | null
}

const KINDS: Record<string, LinkRefusalKind> = {
  order_payment_link_invalid: 'invalid',
  order_payment_link_expired: 'expired',
  order_already_settled: 'settled',
  order_collected_on_delivery: 'collected',
  order_not_payable: 'not_payable',
}

export function linkRefusalOf(error: unknown): LinkRefusal {
  if (!(error instanceof ApiError) || error.status === 0) {
    return { kind: 'unavailable', detail: NETWORK_ERROR_DETAIL, retryAfter: null }
  }
  if (error.status === 429) {
    return { kind: 'throttled', detail: THROTTLED, retryAfter: error.retryAfter }
  }
  const kind = KINDS[error.code] ?? (error.status === 404 ? 'invalid' : 'unavailable')
  return { kind, detail: error.detail, retryAfter: null }
}

export interface RefusalCopy {
  title: string
  /** Ours, after the API's detail (null: the detail alone). */
  note: string | null
  /** Show the API's detail (the 404's says no more than the title). */
  detail: boolean
  /** Offer to load the page again (a wait, no answer). */
  retry: boolean
}

export const REFUSAL_COPY: Record<LinkRefusalKind, RefusalCopy> = {
  invalid: {
    title: 'لینک معتبر نیست',
    note: 'این لینک پرداخت درست نیست، یا سفارش آن لغو شده است. وضعیت سفارش را با کد سفارش و شماره\u{0654} موبایل پیگیری کنید.',
    detail: false,
    retry: false,
  },
  expired: {
    title: 'مهلت پرداخت تمام شده',
    note: 'اگر این سفارش را پیش\u{200C}تر پرداخت کرده\u{200C}اید، وضعیت آن را با پیگیری سفارش ببینید؛ برای پرداخت یا هر پرسشی با پشتیبانی تماس بگیرید.',
    detail: true,
    retry: false,
  },
  settled: {
    title: 'پرداخت آنلاین این سفارش انجام شده',
    note: 'اگر بخشی از مبلغ سفارش هنگام تحویل دریافت می\u{200C}شود، آن را به پیک بپردازید. وضعیت سفارش را با پیگیری سفارش ببینید.',
    detail: true,
    retry: false,
  },
  collected: {
    title: 'سفارش تأیید شده؛ مبلغ هنگام تحویل',
    note: 'این سفارش پرداخت آنلاین ندارد؛ مبلغ آن را هنگام تحویل بپردازید.',
    detail: true,
    retry: false,
  },
  not_payable: {
    title: 'سفارش فعلاً قابل پرداخت نیست',
    note: 'اگر رسید کارت به کارت ثبت کرده\u{200C}اید، در حال بررسی است و نتیجه با پیامک اعلام می\u{200C}شود. وضعیت سفارش را با پیگیری سفارش ببینید.',
    detail: true,
    retry: false,
  },
  throttled: {
    title: 'کمی صبر کنید',
    note: null,
    detail: true,
    retry: true,
  },
  unavailable: {
    title: 'لینک پرداخت اکنون خوانده نشد',
    note: null,
    detail: true,
    retry: true,
  },
}
