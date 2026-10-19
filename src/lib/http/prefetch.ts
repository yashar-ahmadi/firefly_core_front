/**
 * What kind of prefetch a request is, or null for a real visit. Pure.
 *
 * - `router`: the Next.js App Router (`<Link>` prefetches send `next-router-prefetch: 1`, `2` or
 *   `3`). It is a fetch from our own code and nothing is shown from it.
 * - `speculative`: the browser's own: `Sec-Purpose: prefetch` (with parameters, e.g.
 *   `prefetch;prerender`), or the older `Purpose: prefetch`, alone or beside it. Whether the
 *   answer is kept and shown on the click depends on which (`isQuietPrefetch` below).
 */
export type PrefetchKind = 'router' | 'speculative'

/** Whether a `Sec-Purpose` value holds the token `prefetch` (a structured-header list:
 * `prefetch;prerender` is the token `prefetch` with a parameter). */
function hasPrefetchToken(secPurpose: string | null): boolean {
  if (secPurpose === null) return false
  return secPurpose
    .split(',')
    .some((item) => item.split(';', 1)[0]?.trim().toLowerCase() === 'prefetch')
}

const purposePrefetch = (headers: Headers) =>
  headers.get('purpose')?.trim().toLowerCase() === 'prefetch'

export function prefetchKind(headers: Headers): PrefetchKind | null {
  if (headers.has('next-router-prefetch')) return 'router'
  if (purposePrefetch(headers) || hasPrefetchToken(headers.get('sec-purpose'))) return 'speculative'
  return null
}

/**
 * Whether the proxy only marks this request's render with its route kind, and does nothing else
 * (no redirect lookup, which would count a hit, no session refresh, no account guard): a router
 * prefetch, or a browser's `Purpose: prefetch` without `Sec-Purpose`. One rule decides: a
 * prefetch the browser can show on the click (kept) gets what a visit gets; only one it never
 * shows may be quiet.
 *
 * - A router prefetch is an RSC request (`rsc: 1`) with `next-router-prefetch`, as the router
 *   sends both; the prefetch header on a document request is no prefetch of the router's, and
 *   gets what a visit gets. The router's headers reach the proxy only because of
 *   `skipProxyUrlNormalize` (next.config.ts); tests/fixtures/rsc-request-shapes.json holds what
 *   really arrives, with and without it.
 * - `Sec-Purpose` with the token `prefetch` is never quiet, whatever else comes with it: a
 *   speculation-rules prefetch is kept and shown on the click even though every page here is
 *   `no-store` (Chromium 141, captured: tests/fixtures/browser-prefetch-shapes.json), and so is a
 *   prefetch ahead of a prerender, which Chromium sent with both `Sec-Purpose: prefetch;prerender`
 *   and the older `Purpose: prefetch` while it moved to the new header (Chromium CL 5df53e05, "the
 *   Purpose header is unchanged"). It goes through the redirect lookup and the refresh like a
 *   visit.
 * - `Purpose: prefetch` alone is the older `<link rel=prefetch>` header (older Chromium, WebKit),
 *   whose answer goes through the HTTP cache, which keeps nothing `no-store`: the click is a
 *   visit of its own. Current Chromium sends `Sec-Purpose` for that too. Were a page ever
 *   answered cacheable, this would have to change.
 */
export function isQuietPrefetch(headers: Headers): boolean {
  return (
    (headers.get('rsc') === '1' && headers.has('next-router-prefetch')) ||
    (purposePrefetch(headers) && !hasPrefetchToken(headers.get('sec-purpose')))
  )
}
