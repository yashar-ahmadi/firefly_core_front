// Where to go after signing in: the `next` of `/login/?next=…`, but only a plain path on this
// site. Anything else (another site in any spelling, a script URL, an auth page) falls back, so
// `next` can neither send a visitor away (an open redirect) nor back to login (a loop). Pure.

/** A base no real URL has: a path that resolves against it to another origin is not a path. */
const BASE = 'http://next.invalid'

/** Backslashes (browsers read them as slashes), whitespace, and C0/C1 control characters. */
const UNSAFE_CHARACTER = /[\\\s\u{0000}-\u{001F}\u{007F}-\u{009F}]/u
/** In the path: an encoded slash or backslash, or an encoded `%` (a second encoding layer). */
const ENCODED_SEPARATOR = /%(?:2f|5c|25)/i
/** The auth pages: after login, going to one of them would start over. */
const AUTH_PAGE = /^\/(?:login|register|forgot-password)(?:\/|$)/

function decoded(pathname: string): string | null {
  try {
    return decodeURIComponent(pathname)
  } catch {
    return null
  }
}

/**
 * `next` when it is a path on this site (`/…`, never `//…`), in its normal form (dot segments
 * resolved); otherwise `fallback`. Rejected: anything not starting with one `/` (a scheme such
 * as `https:` or `javascript:`, a bare host); `//` anywhere in the path; a backslash, whitespace
 * or a control character anywhere (the URL parser drops tabs and newlines, which could join two
 * slashes); an encoded slash, backslash or `%` in the path; and the login, register and
 * forgot-password pages.
 */
export function safeNext(next: string | null | undefined, fallback = '/account/'): string {
  if (typeof next !== 'string' || !next.startsWith('/')) return fallback
  if (UNSAFE_CHARACTER.test(next)) return fallback
  const rawPath = next.split(/[?#]/, 1)[0] ?? ''
  if (rawPath.includes('//') || ENCODED_SEPARATOR.test(rawPath)) return fallback

  let url: URL
  try {
    url = new URL(next, BASE)
  } catch {
    return fallback
  }
  if (url.origin !== BASE || url.pathname.startsWith('//')) return fallback
  const path = decoded(url.pathname)
  if (path === null || path.includes('//') || AUTH_PAGE.test(path)) return fallback
  return `${url.pathname}${url.search}${url.hash}`
}
