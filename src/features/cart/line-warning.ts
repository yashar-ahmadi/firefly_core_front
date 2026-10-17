import type { CartLine } from '@/lib/api/types/cart'
import { formatNumber } from '@/lib/format'

// What a cart line says when it cannot be ordered as it is (cart digest §5.4): the mini-cart's
// and the cart page's lines, and the cart page's notices. Pure.

const UNAVAILABLE = 'این کالا در حال حاضر موجود نیست.'

/** Why the line cannot be ordered as it is; the quantity is never auto-clamped. */
export function lineWarning(line: CartLine): string | null {
  const unit = line.unit_name ?? 'عدد'
  switch (line.issue) {
    case 'unavailable':
      return UNAVAILABLE
    case 'insufficient_stock':
      return `موجودی کافی نیست؛ حداکثر ${formatNumber(line.available_quantity)} ${unit}.`
    case 'above_order_limit':
      return `بیشتر از سقف سفارش؛ حداکثر ${formatNumber(line.order_limit_max)} ${unit}.`
    case 'below_order_limit':
      return `کمتر از حداقل سفارش؛ حداقل ${formatNumber(line.order_limit_min)} ${unit}.`
    default:
      return line.in_stock ? null : UNAVAILABLE
  }
}
