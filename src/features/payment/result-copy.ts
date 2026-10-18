import type { PaymentStatusInfo } from '@/lib/api/types/payment'
import { toPersianDigits } from '@/lib/format'

// The payment result page's words (order digest §5.10, §5.11): what the page says about a
// payment once its status is read. The STATUS is the truth (Review Focus #3): the bank return's
// `result` and `code` only choose among the sentences a status allows, so `result=success` with
// a payment still pending says «در حال بررسی…», never success. The table's sentences are copied
// verbatim (a test compares them with the digest); the wallet top-up's failures say «کیف پول»
// where the table, written for orders, says «سفارش». Pure.

/** The bank return's `result` query value. */
export type ReturnResult = 'success' | 'failed' | 'pending'

/** What the page knows of the payment: its status read, and the return's own `result`. */
export type PaymentStatusView = Pick<
  PaymentStatusInfo,
  'status' | 'applies_to' | 'failure_reason' | 'order_code'
> & { result?: ReturnResult | null }

export type ResultTone = 'success' | 'pending' | 'error' | 'info'

/**
 * What the page offers (it builds the links: who is signed in, which door is known):
 * - `order`: the order's own page when signed in, tracking for a guest;
 * - `pay_again`: a new attempt with a new key, only through a door the page knows;
 * - `other_route`: the order's payment page, to choose another route;
 * - `wallet`: the wallet page; `support`: the support line;
 * - `orders`: the orders (signed in) and tracking.
 */
export type ResultAction = 'order' | 'pay_again' | 'other_route' | 'wallet' | 'support' | 'orders'

export interface ResultCopy {
  tone: ResultTone
  title: string
  body: string
  actions: ResultAction[]
  /** Show the payment's reference (its id) for support. */
  reference?: boolean
}

const ZWNJ = '\u{200C}'

/** Verbatim from the digest's table (§5.10) and its polling policy (§5.11). */
export const COPY = {
  settled: 'پرداخت با موفقیت انجام شد. سفارش {order_code} در حال انجام است.',
  topUp: 'کیف پول شما شارژ شد.',
  rejected: 'بانک تراکنش را نپذیرفت. سفارش هنوز قابل پرداخت است.',
  notBookable: `پرداخت روی سفارش ثبت نشد. اگر مبلغی از حساب شما کسر شده، بانک حداکثر ظرف ۷۲ ساعت آن را برمی${ZWNJ}گرداند.`,
  unavailable: 'درگاه پاسخ نداد؛ مبلغی کسر نشده.',
  verifying: 'در حال بررسی نتیجهٔ پرداخت…',
  parked: `پرداخت شما دریافت شد ولی روی سفارش ثبت نشد؛ پشتیبانی پیگیری می${ZWNJ}کند.`,
  unknown: 'نتیجه نامشخص است؛ در حال بررسی…',
  expired: 'نتیجهٔ پرداخت مشخص نشد. اگر مبلغی کسر شده با پشتیبانی تماس بگیرید.',
  refunded: 'مبلغ این پرداخت به شما بازگردانده شده است.',
  invalid: 'بازگشت از بانک نامعتبر بود',
  stopped: `نتیجه هنوز مشخص نیست؛ بعداً در سفارش${ZWNJ}ها/پیگیری ببینید`,
} as const

/** Ours, for the rows the table names without a sentence, and for the wallet top-up. */
const OURS = {
  failed: `پرداخت انجام نشد. اگر مبلغی از حساب شما کسر شده، بانک آن را برمی${ZWNJ}گرداند.`,
  abandoned: 'این تلاش پرداخت بسته شده است.',
  orderCancelled: 'این سفارش لغو شده و پرداخت آن بسته شد.',
  review: `رسید پرداخت شما ثبت شده و در صف بررسی است؛ نتیجه با پیامک اعلام می${ZWNJ}شود.`,
  topUpRejected: 'بانک تراکنش را نپذیرفت. کیف پول شما شارژ نشد.',
  topUpNotBookable: `مبلغ به کیف پول شما اضافه نشد. اگر مبلغی از حساب شما کسر شده، بانک حداکثر ظرف ۷۲ ساعت آن را برمی${ZWNJ}گرداند.`,
  topUpFailed: `کیف پول شما شارژ نشد. اگر مبلغی از حساب شما کسر شده، بانک آن را برمی${ZWNJ}گرداند.`,
  topUpParked: `پرداخت شما دریافت شد ولی به کیف پول شما اضافه نشد؛ پشتیبانی پیگیری می${ZWNJ}کند.`,
  topUpClosed: 'این تلاش شارژ کیف پول بسته شده است.',
} as const

const PARKED_CODES = new Set(['gateway_capture_parked', 'gateway_amount_mismatch'])

/** The page's words before the first status read, and for a payment read again by hand. */
export const CHECKING: ResultCopy = {
  tone: 'pending',
  title: 'در حال بررسی پرداخت',
  body: COPY.verifying,
  actions: [],
}

/** §5.10 step 2: the bank came back without a payment (an unknown callback). */
export const INVALID_RETURN: ResultCopy = {
  tone: 'error',
  title: COPY.invalid,
  body: `اطلاعات پرداخت در این بازگشت نبود. وضعیت سفارش خود را در سفارش${ZWNJ}ها یا پیگیری سفارش ببینید.`,
  actions: ['orders'],
}

/** §5.11: still not final after 15 minutes of reads (the page offers one more by hand). */
export const STOPPED: ResultCopy = {
  tone: 'info',
  title: 'بررسی خودکار متوقف شد',
  body: COPY.stopped,
  actions: ['orders'],
}

/** The status cannot be read here: no such payment (404), or refused even without a session. */
export const UNREADABLE: ResultCopy = {
  tone: 'error',
  title: 'وضعیت پرداخت خوانده نشد',
  body: `وضعیت این پرداخت اینجا خوانده نشد. وضعیت سفارش خود را در سفارش${ZWNJ}ها یا پیگیری سفارش ببینید.`,
  actions: ['orders', 'support'],
}

function orderCopy(view: PaymentStatusView, code: string | null): ResultCopy {
  const reason = view.failure_reason || code || ''
  switch (view.status) {
    case 'settled': {
      const order = view.order_code ? toPersianDigits(view.order_code) : ''
      const body = order
        ? COPY.settled.replace('{order_code}', order)
        : 'پرداخت با موفقیت انجام شد.'
      return { tone: 'success', title: 'پرداخت موفق', body, actions: ['order'] }
    }
    case 'failed':
      if (reason === 'gateway_capture_not_bookable')
        return {
          tone: 'error',
          title: 'پرداخت ثبت نشد',
          body: COPY.notBookable,
          actions: ['order'],
        }
      if (reason === 'payment_attempt_expired') return expiredCopy(['support', 'order'])
      return {
        tone: 'error',
        title: 'پرداخت ناموفق',
        body:
          reason === 'gateway_rejected'
            ? COPY.rejected
            : reason === 'gateway_unavailable'
              ? COPY.unavailable
              : OURS.failed,
        actions: ['pay_again', 'other_route'],
      }
    case 'cancelled':
      if (reason === 'payment_attempt_expired') return expiredCopy(['support', 'order'])
      return {
        tone: 'info',
        title: reason === 'payment_attempt_order_cancelled' ? 'سفارش لغو شده' : 'پرداخت بسته شد',
        body: reason === 'payment_attempt_order_cancelled' ? OURS.orderCancelled : OURS.abandoned,
        actions: ['order'],
      }
    case 'refunded':
      return { tone: 'info', title: 'مبلغ بازگردانده شد', body: COPY.refunded, actions: [] }
    case 'awaiting_review':
      return {
        tone: 'pending',
        title: 'رسید در حال بررسی است',
        body: OURS.review,
        actions: ['order'],
      }
    default:
      return pendingCopy(view, code, COPY.parked, ['order', 'support'])
  }
}

function topUpCopy(view: PaymentStatusView, code: string | null): ResultCopy {
  const reason = view.failure_reason || code || ''
  switch (view.status) {
    case 'settled':
      return { tone: 'success', title: 'شارژ موفق', body: COPY.topUp, actions: ['wallet'] }
    case 'failed':
      if (reason === 'payment_attempt_expired') return expiredCopy(['support', 'wallet'])
      return {
        tone: 'error',
        title: 'شارژ کیف پول انجام نشد',
        body:
          reason === 'gateway_rejected'
            ? OURS.topUpRejected
            : reason === 'gateway_capture_not_bookable'
              ? OURS.topUpNotBookable
              : reason === 'gateway_unavailable'
                ? COPY.unavailable
                : OURS.topUpFailed,
        actions: ['wallet'],
      }
    case 'cancelled':
      if (reason === 'payment_attempt_expired') return expiredCopy(['support', 'wallet'])
      return { tone: 'info', title: 'شارژ بسته شد', body: OURS.topUpClosed, actions: ['wallet'] }
    case 'refunded':
      return { tone: 'info', title: 'مبلغ بازگردانده شد', body: COPY.refunded, actions: ['wallet'] }
    default:
      return pendingCopy(view, code, OURS.topUpParked, ['wallet', 'support'])
  }
}

const expiredCopy = (actions: ResultAction[]): ResultCopy => ({
  tone: 'error',
  title: 'بررسی پرداخت به نتیجه نرسید',
  body: COPY.expired,
  actions,
})

/** Still pending: parked by the bank, or still being verified (the page keeps reading). */
function pendingCopy(
  view: PaymentStatusView,
  code: string | null,
  parked: string,
  parkedActions: ResultAction[],
): ResultCopy {
  if (code && PARKED_CODES.has(code))
    return {
      tone: 'info',
      title: 'پرداخت در دست پیگیری',
      body: parked,
      actions: parkedActions,
      reference: true,
    }
  // An unexpected error on the bank's return: it said `failed` with no code.
  if (view.result === 'failed' && !code) return { ...CHECKING, body: COPY.unknown }
  return CHECKING
}

/** The page's words for a payment's status (`code` from the bank return, wording only). */
export function resultCopy(status: PaymentStatusView, code: string | null): ResultCopy {
  return status.applies_to === 'wallet_topup' ? topUpCopy(status, code) : orderCopy(status, code)
}
