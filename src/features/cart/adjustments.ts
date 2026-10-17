import type { CartAdjustment } from '@/lib/api/types/cart'
import { toPersianDigits } from '@/lib/format'

// The cart's one-time `adjustments` (a merge after login, a reorder, a shipping-options read;
// cart digest §3.11): lines whose quantity the API lowered or dropped. Pure.

/** The toast's title when an answer carries adjustments. */
export const ADJUSTMENTS_TITLE = 'سبد خرید شما به‌روز شد'

/** One sentence per line: a dropped line is said apart from a lowered quantity. */
export function adjustmentText({
  product_name: name,
  requested,
  applied,
  was_dropped: dropped,
}: CartAdjustment): string {
  if (dropped || applied === 0) return `«${name}» دیگر قابل سفارش نیست و از سبد حذف شد.`
  return `تعداد «${name}» از ${toPersianDigits(requested)} به ${toPersianDigits(applied)} کاهش یافت.`
}
