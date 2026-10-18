import { adjustmentText } from '@/features/cart/adjustments'
import type { CartReorderResult } from '@/lib/api/types/cart'
import { toPersianDigits } from '@/lib/format'

// What «خرید دوباره» says (cart digest §3.12): built from the answer's own fields, never from its
// `msg`: how many of the order's lines went into the cart (`added_lines`: the variants whose
// quantity grew), each line whose quantity the cart lowered or dropped (`adjustments`), and each
// line no longer sold (`reorder_skipped`, by name). Pure.

export interface ReorderNotice {
  /** Something went into the cart (a success), or nothing could (information). */
  tone: 'success' | 'info'
  title: string
  lines: string[]
}

const skipped = ({
  product_name: name,
  variant_name: variant,
}: CartReorderResult['reorder_skipped'][number]) =>
  `«${variant ? `${name} (${variant})` : name}» دیگر فروخته نمی\u{200C}شود.`

export function reorderNotice(result: CartReorderResult): ReorderNotice {
  const added = result.added_lines
  return {
    tone: added > 0 ? 'success' : 'info',
    title:
      added > 0
        ? `${toPersianDigits(added)} قلم کالا از این سفارش به سبد خرید اضافه شد.`
        : 'هیچ\u{200C}کدام از اقلام این سفارش اکنون قابل خرید نیست.',
    lines: [...result.adjustments.map(adjustmentText), ...result.reorder_skipped.map(skipped)],
  }
}

/** A lost answer: the cart is read again; nothing is sent a second time (not idempotent). */
export const REORDER_LOST =
  'پاسخی نرسید. سبد خرید دوباره خوانده شد؛ پیش از تلاش دوباره آن را ببینید.'
export const REORDER_THROTTLED =
  'خرید دوباره بیش از حد مجاز تلاش شده است؛ پس از پایان زمان روی دکمه دوباره تلاش کنید.'
