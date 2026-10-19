// The install prompt's names (Plan 5 Task 6), shared by the registration script
// (register-sw.tsx: it counts the visits, decides whether this device may be offered the
// install, and keeps the browser's install offer) and the prompt (install-prompt.tsx,
// install-offer.ts). Pure constants. The verdict's own names are in install-flag.ts: the shop
// layout's gate reads those alone.

/** Visits counted on this device (localStorage), one per tab session (sessionStorage). */
export const VISITS_KEY = 'ff-pwa-visits'
export const SESSION_KEY = 'ff-pwa-session'
/** Set once the prompt is dismissed, answered or the shop installed: it never comes back. */
export const DISMISSED_KEY = 'ff-pwa-dismissed'
/** Told by the registration script when the browser's install offer arrives. */
export const INSTALLABLE_EVENT = 'ff:installable'
/** Where the registration script keeps the browser's install offer. */
export const OFFER_KEPT = '__ffInstall'

/** A phone: below Tailwind's `md` (48rem), where the shop shows its bottom navigation. */
export const PHONE_QUERY = '(max-width: 47.99rem)'
export const STANDALONE_QUERY = '(display-mode: standalone)'
/**
 * The visitor's own pages, where the prompt never shows: the account, the cart, the checkout,
 * the payment pages, an order's links, sign-in (the service worker's never-cached pages).
 */
export const NO_PROMPT_PATH =
  /^\/(?:account|cart|checkout|payment|order|login|register|forgot-password)(?:\/|$)/

/** The second visit on, the prompt may show. */
export const VISITS_BEFORE_PROMPT = 2
