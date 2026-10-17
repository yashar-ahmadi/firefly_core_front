// The cart page's heading (src/app/(shop)/cart/page.tsx): where the focus waits when what had it
// leaves the page (a dismissed notice, a removal undone from its toast). A plain module: the
// server page and the client components both read it.

export const CART_HEADING_ID = 'cart-heading'

/** Focuses the cart page's heading (focusable from code only). */
export function focusCartHeading(): void {
  document.getElementById(CART_HEADING_ID)?.focus()
}
