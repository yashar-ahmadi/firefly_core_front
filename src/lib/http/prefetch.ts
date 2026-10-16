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
