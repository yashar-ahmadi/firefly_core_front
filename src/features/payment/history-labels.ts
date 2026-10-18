import type { BadgeTone } from '@/components/ui/badge'
import type { ReceiptStatus } from '@/lib/api/types/payment'

// The payment history's pills and the receipt's words (order digest §2.1), shared by an order's
// payments and the wallet's payment history. Pure.

/** A payment status's pill colour (its text is the API's `status_display`). */
export const PAYMENT_TONES: Record<string, BadgeTone> = {
  settled: 'success',
  pending: 'warning',
  awaiting_review: 'info',
  failed: 'danger',
  cancelled: 'neutral',
  refunded: 'neutral',
}

/** No display field for a receipt's status (§2.1): the shop's own words. */
export const RECEIPT_WORDS: Record<ReceiptStatus, string> = {
  awaiting_review: 'در انتظار بررسی',
  approved: 'تأیید شده',
  rejected: 'رد شده',
}
