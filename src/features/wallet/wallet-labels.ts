import type { BadgeTone } from '@/components/ui/badge'
import type { WalletCause, WalletDirection, WithdrawalStatus } from '@/lib/api/types/wallet'

// The wallet page's filter options and fallbacks (order digest §2.1, §7, §8.6). The rows say the
// API's own words (`direction_display`, `cause_display`, `status_display`, `method_display`,
// `applies_to_display`); these tables give the filters their labels (the API lists no options)
// and a row a label when its display field is empty. An unknown value is shown as it came, never
// dropped. Pure.

export interface Option<V extends string = string> {
  value: V
  label: string
}

export const DIRECTIONS: readonly Option<WalletDirection>[] = [
  { value: 'credit', label: 'واریز' },
  { value: 'debit', label: 'برداشت' },
]

export const CAUSES: readonly Option<WalletCause>[] = [
  { value: 'top_up', label: 'شارژ از درگاه' },
  { value: 'order_payment', label: 'پرداخت سفارش' },
  { value: 'order_payment_reversal', label: 'برگشت پرداخت سفارش' },
  { value: 'refund', label: 'بازگشت وجه' },
  { value: 'amendment_credit', label: 'اعتبار اصلاحیه سفارش' },
  { value: 'withdrawal', label: 'برداشت به حساب بانکی' },
  { value: 'withdrawal_reversal', label: 'برگشت درخواست برداشت' },
  { value: 'admin_adjustment', label: 'اصلاح دستی' },
]

export type Ordering = 'created' | '-created' | 'amount' | '-amount'

/** The ledger's and the withdrawals' four orderings; the API's default first. */
export const ORDERINGS: readonly Option<Ordering>[] = [
  { value: '-created', label: 'جدیدترین' },
  { value: 'created', label: 'قدیمی\u{200C}ترین' },
  { value: '-amount', label: 'بیشترین مبلغ' },
  { value: 'amount', label: 'کمترین مبلغ' },
]

export const DEFAULT_ORDERING: Ordering = '-created'

export const WITHDRAWAL_STATUSES: readonly Option<WithdrawalStatus>[] = [
  { value: 'requested', label: 'در انتظار بررسی' },
  { value: 'approved', label: 'تأیید شده' },
  { value: 'paid', label: 'پرداخت شده' },
  { value: 'rejected', label: 'رد شده' },
  { value: 'cancelled', label: 'لغو شده' },
]

/** A withdrawal's pill colour (its text: `status_display`). */
export const WITHDRAWAL_TONES: Record<string, BadgeTone> = {
  requested: 'warning',
  approved: 'info',
  paid: 'success',
  rejected: 'danger',
  cancelled: 'neutral',
}

export const PAYMENT_STATUSES: readonly Option[] = [
  { value: 'pending', label: 'در انتظار پرداخت' },
  { value: 'awaiting_review', label: 'در انتظار بررسی' },
  { value: 'settled', label: 'تسویه شده' },
  { value: 'failed', label: 'ناموفق' },
  { value: 'cancelled', label: 'لغو شده' },
  { value: 'refunded', label: 'بازگردانده شده' },
]

export const PAYMENT_METHODS: readonly Option[] = [
  { value: 'bank_gateway', label: 'درگاه بانکی' },
  { value: 'wallet', label: 'کیف پول' },
  { value: 'card_transfer', label: 'کارت به کارت' },
  { value: 'pay_on_delivery', label: 'پرداخت در محل' },
  { value: 'pos', label: 'کارتخوان' },
  { value: 'cash', label: 'نقدی' },
  { value: 'manual_transfer', label: 'انتقال دستی' },
]

export const APPLIES_TO: readonly Option[] = [
  { value: 'online_charge', label: 'پرداخت آنلاین سفارش' },
  { value: 'delivery_collection', label: 'دریافت در محل' },
  { value: 'wallet_topup', label: 'شارژ کیف پول' },
  { value: 'refund_out', label: 'عودت وجه' },
]

/** The label of `value` among `options`, the API's display text first, else the value itself. */
export function labelOf(options: readonly Option[], value: string, display = ''): string {
  return display.trim() || options.find((option) => option.value === value)?.label || value
}

/** Why a payment failed or closed (§8.6: not errors; stored on the row), in the shopper's words. */
const FAILURE_REASONS: Record<string, string> = {
  payment_attempt_expired: 'مهلت این تلاش پرداخت تمام شد و بسته شد.',
  payment_attempt_abandoned: 'این تلاش پرداخت کنار گذاشته شد.',
  payment_attempt_order_cancelled: 'سفارش لغو شد و این پرداخت بسته شد.',
  payment_receipt_rejected: 'رسید کارت به کارت این پرداخت پذیرفته نشد.',
  gateway_rejected: 'بانک تراکنش را نپذیرفت.',
  gateway_capture_not_bookable:
    'پرداخت ثبت نشد. اگر مبلغی از حساب شما کسر شده، بانک حداکثر ظرف ۷۲ ساعت آن را برمی\u{200C}گرداند.',
  gateway_unavailable: 'درگاه پاسخ نداد؛ مبلغی کسر نشده.',
  payment_delivery_collection_voided: 'فروشگاه این دریافت در محل را باطل کرد.',
}

/** null when nothing failed; a reason the storefront does not know says only that it failed. */
export function failureText(reason: string): string | null {
  if (!reason.trim()) return null
  return FAILURE_REASONS[reason] ?? 'این پرداخت انجام نشد.'
}
