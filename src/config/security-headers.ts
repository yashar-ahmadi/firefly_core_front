import type { NextConfig } from 'next'

/**
 * Baseline security headers on every response, served by `next.config.ts` (`headers()`), so they
 * hold with or without a reverse proxy. Pure: no `server-only`, no environment.
 *
 * - `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'` stop other
 *   sites from framing the shop (clickjacking). The CSP has this one directive only: a script and
 *   style policy needs per-request nonces and is deferred (docs/DEPLOYMENT.md, «دربارهٔ CSP»).
 * - `X-Content-Type-Options: nosniff`: browsers keep the declared content types.
 * - `Referrer-Policy: strict-origin-when-cross-origin`: other sites see the origin, not the path.
 *
 * To let another domain frame the shop, an operator must change both framing headers here.
 */
export const SECURITY_HEADERS: ReadonlyArray<{ readonly key: string; readonly value: string }> = [
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
]

type HeaderRule = Awaited<ReturnType<NonNullable<NextConfig['headers']>>>[number]

/** The `headers()` rules: the baseline headers on every path (fresh objects on each call). */
export function securityHeaderRules(): HeaderRule[] {
  return [
    { source: '/:path*', headers: SECURITY_HEADERS.map(({ key, value }) => ({ key, value })) },
  ]
}
