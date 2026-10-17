import { loginHref } from '@/lib/links/login'

// The account area's session guard (ruling P3-R3). Pure: used by the proxy and the account layout.
//
// Where the guard runs, and why there: a Next.js layout gets neither the pathname nor the query
// (it is not even rendered again on a navigation inside its segment), so it cannot name the page
// it guards. The proxy can: it sees every page request and client navigation with its full URL,
// after its own token refresh. It sends a visitor without a session to login there, with the
// page and its query as `next` (`accountLoginPath`). The account layout checks the refresh
// cookie again for the requests the proxy's matcher skips (router prefetches), which are never
// shown as they are: their `next` is the dashboard.

/** Pages that are nothing without a session: the account area (ruling P3-R1). */
const ACCOUNT_PATH = /^\/account(?:\/|$)/

/** Whether `pathname` is in the account area. */
export function isAccountPath(pathname: string): boolean {
  return ACCOUNT_PATH.test(pathname)
}

/** Next's cache-busting parameter of a client navigation (`?_rsc=…`): never part of a page URL. */
const RSC_PARAM = '_rsc'

/**
 * `/login/?next=<the page and its query>` (`loginHref`) for an account URL. The query is kept byte
 * for byte: only Next's `_rsc` pair is cut out of the raw string (re-serialising it would change
 * `%20`, `+` and other spellings).
 */
export function accountLoginPath(url: Pick<URL, 'pathname' | 'search'>): string {
  const pairs = url.search.replace(/^\?/, '').split('&')
  const kept = pairs.filter((pair) => pair.split('=', 1)[0] !== RSC_PARAM)
  let search = url.search
  if (kept.length !== pairs.length) search = kept.some(Boolean) ? `?${kept.join('&')}` : ''
  return loginHref(`${url.pathname}${search}`)
}

/** Where the account layout sends a request without a session (it cannot know the page). */
export const ACCOUNT_LOGIN_FALLBACK = loginHref('/account/')
