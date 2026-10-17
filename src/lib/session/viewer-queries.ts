import type { QueryClient, QueryKey } from '@tanstack/react-query'
import { ApiError } from '@/lib/api/errors'

// The TanStack Query data that belongs to the visitor who is signed in, and what makes it stale
// for good: a login, a logout, or a session that ended by itself. Pure (no React): safe in any
// bundle, the catalog's included.

/** The signed-in visitor's profile (`useMe`). */
export const ME_KEY = ['me'] as const

/**
 * The account summary (`useSummary`): every badge of the account area. Invalidate it after any
 * write that changes a counter (a wishlist toggle, a comment, a payment).
 */
export const SUMMARY_KEY = ['summary'] as const

/**
 * Read only with a session (each query is `enabled: hasSession`), so nothing of them is right
 * for anyone else: removed. The profile, the account summary, everything under `['dashboard']`
 * (the dashboard's lists), under `['wishlist']` (`WISHLIST_IDS_KEY`, the wishlist page), under
 * `['notifications']` (the inbox and its unread count, `UNREAD_NOTIFICATIONS_KEY`) and the
 * address book (`['addresses']`).
 */
const SESSION_QUERIES: readonly QueryKey[] = [
  ME_KEY,
  SUMMARY_KEY,
  ['dashboard'],
  ['wishlist'],
  ['notifications'],
  ['addresses'],
]

/**
 * Read by guests too, but the answer depends on who asks: the cart (`CART_KEY`), and under
 * `['product']` the product payload (`is_in_wishlist`) and its comment lists
 * (`is_current_user`). Reset: what is on screen reads again as the new visitor and shows nothing
 * of the old one meanwhile; a list seeded from the server falls back to that anonymous page.
 * Add a new viewer-dependent key here (blog comment lists, Plan 5).
 */
const VIEWER_AWARE_QUERIES: readonly QueryKey[] = [['cart'], ['product']]

/**
 * Drops what the previous visitor saw, so the next one never sees it (not even for a stale
 * time): call it on login and on logout. Queries in flight are cancelled. Resolves once the
 * queries on screen have been read again; never rejects.
 */
export async function clearViewerQueries(client: QueryClient): Promise<void> {
  for (const queryKey of SESSION_QUERIES) client.removeQueries({ queryKey })
  await Promise.all(VIEWER_AWARE_QUERIES.map((queryKey) => client.resetQueries({ queryKey })))
}

/**
 * The 401 codes that mean the session is gone: no or a rejected token, or an account that was
 * deleted or disabled. The BFF has tried its one refresh by then (and dropped the cookies if
 * that failed). Not a missing or bad API key or a malformed header (configuration problems that
 * logging in again cannot fix), nor a sign-in form's own answers (`auth_invalid_credentials`).
 */
const SESSION_GONE = new Set([
  'not_authenticated',
  'token_not_valid',
  'authentication_failed',
  'user_not_found',
  'user_inactive',
])

/** Whether a session-only call failed because the session is gone (see `useSessionExpired`). */
export function isSessionExpiredError(error: unknown): error is ApiError {
  return error instanceof ApiError && error.status === 401 && SESSION_GONE.has(error.code)
}
