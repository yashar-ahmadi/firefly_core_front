// The checkout page's heading (src/app/(checkout)/checkout/page.tsx): where the focus waits when
// what had it leaves the page (a dismissed notice). A plain module: the server page and the
// client components both read it.

export const CHECKOUT_HEADING_ID = 'checkout-heading'

/** Focuses the checkout page's heading (focusable from code only). */
export function focusCheckoutHeading(): void {
  document.getElementById(CHECKOUT_HEADING_ID)?.focus()
}
