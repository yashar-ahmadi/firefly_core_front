// The payment link the API gives every order (`payment_url`: `${STOREFRONT_URL}/order/pay/<token>`,
// order digest §1.3, §4): its last path segment is the link token, the guest's credential for
// `order/pay/<token>/` and `payment/link/<token>/intent/`. Never a log or analytics value. Pure.

/** The token at the end of `payment_url`, or null. */
export function linkTokenOf(paymentUrl: string | null): string | null {
  if (!paymentUrl) return null
  try {
    const segments = new URL(paymentUrl).pathname.split('/').filter(Boolean)
    const token = segments.at(-1)
    return segments.length >= 2 && token ? decodeURIComponent(token) : null
  } catch {
    return null
  }
}

/** Our payment-link page (Task 4), with the trailing slash the site uses. */
export const payLinkPath = (token: string) => `/order/pay/${encodeURIComponent(token)}/`
