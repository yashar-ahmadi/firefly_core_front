/**
 * What kind of prefetch a request is, or null for a real visit. Pure.
 *
 * - `router`: the Next.js App Router (`<Link>` prefetches send `next-router-prefetch: 1`, `2` or
 *   `3`). It is a fetch from our own code and nothing is shown from it.
 * - `speculative`: the browser's own speculation, `Sec-Purpose: prefetch` in current browsers
 *   (with parameters, e.g. `prefetch;prerender`) or `Purpose: prefetch` in older ones and for
 *   `<link rel="prefetch">`. A 2xx answer is kept and served when the visitor clicks, so the
 *   click itself never reaches the server.
 */
export type PrefetchKind = 'router' | 'speculative'

export function prefetchKind(headers: Headers): PrefetchKind | null {
  if (headers.has('next-router-prefetch')) return 'router'
  if (headers.get('purpose')?.trim().toLowerCase() === 'prefetch') return 'speculative'
  const secPurpose = headers.get('sec-purpose')
  if (secPurpose === null) return null
  // A structured-header list: `prefetch;prerender` is the token `prefetch` with a parameter.
  const prefetch = secPurpose
    .split(',')
    .some((item) => item.split(';', 1)[0]?.trim().toLowerCase() === 'prefetch')
  return prefetch ? 'speculative' : null
}

/**
 * Whether the proxy only marks this request's render with its route kind, and does nothing else
 * (no redirect lookup, which would count a hit, no session refresh, no account guard): a router
 * prefetch or a browser's `Purpose: prefetch`. One rule decides: a prefetch the browser can show
 * on the click (kept) gets what a visit gets; only one it never shows may be quiet.
 *
 * - A router prefetch is an RSC request (`rsc: 1`) with `next-router-prefetch`, as the router
 *   sends both; the prefetch header on a document request is no prefetch of the router's, and
 *   gets what a visit gets. The router's headers reach the proxy only because of
 *   `skipProxyUrlNormalize` (next.config.ts); tests/fixtures/rsc-request-shapes.json holds what
 *   really arrives, with and without it.
 * - `Sec-Purpose: prefetch` is kept: a speculation-rules prefetch is shown on the click even
 *   though every page here is `no-store` (Chromium 141, captured: tests/fixtures/browser-prefetch-
 *   shapes.json), so it goes through the redirect lookup and the refresh like a visit.
 * - `Purpose: prefetch` is never kept: browsers send it only for `<link rel=prefetch>` (older
 *   Chromium, WebKit), whose answer goes through the HTTP cache, which keeps nothing `no-store`:
 *   the click is a visit of its own. Current Chromium sends `Sec-Purpose` for that too. Were a
 *   page ever answered cacheable, this would have to change.
 */
export function isQuietPrefetch(headers: Headers): boolean {
  return (
    (headers.get('rsc') === '1' && headers.has('next-router-prefetch')) ||
    headers.get('purpose')?.trim().toLowerCase() === 'prefetch'
  )
}
