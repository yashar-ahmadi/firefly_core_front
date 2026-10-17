import type { Cart } from '@/lib/api/types/cart'

// Why «ادامهٔ خرید» is held back on the cart page, or null when the cart can go on to checkout.
// Pure.

export const CHECKOUT_EMPTY = 'سبد خرید شما خالی است.'
export const CHECKOUT_PENDING = 'در حال ذخیره\u{0654} تغییرات\u{2026}'
export const CHECKOUT_ISSUES = 'برخی کالاها قابل سفارش نیستند.'

/**
 * Held back while the cart is empty, while a change is waiting or on its way (the checkout must
 * open on the cart as saved), and while a line cannot be ordered as it is (placement would
 * answer `409 order_item_unavailable`).
 */
export function checkoutBlock(cart: Cart, pending: boolean): string | null {
  if (cart.is_empty) return CHECKOUT_EMPTY
  if (pending) return CHECKOUT_PENDING
  const issue = cart.lines.some((line) => line.issue !== null || !line.in_stock)
  return !cart.is_orderable || issue ? CHECKOUT_ISSUES : null
}
