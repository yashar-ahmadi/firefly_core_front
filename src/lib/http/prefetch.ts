/**
 * Whether a request is a prefetch rather than a visit. Pure.
 *
 * - `next-router-prefetch`: the Next.js App Router (`<Link>` prefetches send `1`, `2` or `3`);
 * - `Purpose: prefetch`: older browsers and `<link rel="prefetch">`;
 * - `Sec-Purpose: prefetch` (with parameters, e.g. `prefetch;prerender`): current browsers'
 *   speculative prefetch and prerender.
 */
export function isPrefetchRequest(headers: Headers): boolean {
  if (headers.has('next-router-prefetch')) return true
  if (headers.get('purpose')?.trim().toLowerCase() === 'prefetch') return true
  const secPurpose = headers.get('sec-purpose')
  if (secPurpose === null) return false
  // A structured-header list: `prefetch;prerender` is the token `prefetch` with a parameter.
  return secPurpose
    .split(',')
    .some((item) => item.split(';', 1)[0]?.trim().toLowerCase() === 'prefetch')
}
