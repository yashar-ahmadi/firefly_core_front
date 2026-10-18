import type { NextConfig } from 'next'
import { CREDENTIAL_PREFIXES, credentialQueryValue } from './credential-routes'

/**
 * Baseline security headers on every response, served by `next.config.ts` (`headers()`), so they
 * hold with or without a reverse proxy. Pure: no `server-only`, no environment.
 *
 * - `X-Frame-Options: SAMEORIGIN` and `Content-Security-Policy: frame-ancestors 'self'` stop other
 *   sites from framing the shop (clickjacking). The CSP has this one directive only: a script and
 *   style policy needs per-request nonces and is deferred (docs/DEPLOYMENT.md, «دربارهٔ CSP»).
 * - `X-Content-Type-Options: nosniff`: browsers keep the declared content types.
 * - `Referrer-Policy: strict-origin-when-cross-origin`: other sites see the origin, not the path.
 *   The pages whose URL holds a payment credential (credential-routes.ts: `/order/pay/…`,
 *   `/payment/…`, and a page whose `next` leads back to one) send `no-referrer` instead: a later
 *   rule for the same header wins in Next.
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

const noReferrer = () => [{ key: 'Referrer-Policy', value: 'no-referrer' }]

/**
 * The `headers()` rules (fresh objects on each call): the baseline headers on every path, then
 * `no-referrer` on the credential pages (by path, and by a `next` that leads back to one).
 */
export function securityHeaderRules(): HeaderRule[] {
  return [
    { source: '/:path*', headers: SECURITY_HEADERS.map(({ key, value }) => ({ key, value })) },
    ...CREDENTIAL_PREFIXES.map((prefix) => ({ source: `${prefix}:path*`, headers: noReferrer() })),
    {
      source: '/:path*',
      has: [{ type: 'query' as const, key: 'next', value: credentialQueryValue() }],
      headers: noReferrer(),
    },
  ]
}
