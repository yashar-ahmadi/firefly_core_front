import type { NextConfig } from 'next'
import { securityHeaderRules } from './src/config/security-headers'

type RemotePattern = NonNullable<NonNullable<NextConfig['images']>['remotePatterns']>[number]
type HttpProtocol = 'http' | 'https'

/** The only path prefixes the Firefly API serves images from. */
const MEDIA_PATHNAMES = ['/media/**', '/static/**'] as const

/**
 * Builds the `next/image` allow-list.
 *
 * - `FIREFLY_API_URL` set at build time: exactly that protocol + host (+ port),
 *   restricted to the media path prefixes.
 * - Otherwise (the build must not depend on the backend): any https host plus
 *   localhost / 127.0.0.1 on any port, still restricted to the media path
 *   prefixes, and a single warning is logged.
 */
function buildRemotePatterns(): RemotePattern[] {
  const apiUrl = process.env.FIREFLY_API_URL?.trim()

  if (apiUrl) {
    let url: URL
    try {
      url = new URL(apiUrl)
    } catch {
      throw new Error(`FIREFLY_API_URL is not a valid absolute URL: "${apiUrl}"`)
    }
    const protocol = url.protocol.replace(/:$/, '')
    if (protocol !== 'http' && protocol !== 'https') {
      throw new Error(`FIREFLY_API_URL must use http or https: "${apiUrl}"`)
    }
    return MEDIA_PATHNAMES.map((pathname) => ({
      protocol: protocol as HttpProtocol,
      hostname: url.hostname,
      port: url.port,
      pathname,
    }))
  }

  console.warn(
    '[next.config] FIREFLY_API_URL is not set at build time; ' +
      'falling back to permissive next/image remotePatterns (https://** and localhost).',
  )
  const hosts: Array<{ protocol: HttpProtocol; hostname: string }> = [
    { protocol: 'https', hostname: '**' },
    { protocol: 'http', hostname: 'localhost' },
    { protocol: 'http', hostname: '127.0.0.1' },
  ]
  // `port` is omitted on purpose so that any port matches (local dev servers).
  return hosts.flatMap((host) => MEDIA_PATHNAMES.map((pathname) => ({ ...host, pathname })))
}

const nextConfig: NextConfig = {
  trailingSlash: true,
  output: 'standalone',
  poweredByHeader: false,
  // The proxy (src/proxy.ts) sees the request as sent: by default Next removes its client
  // navigation headers (`rsc`, `next-router-prefetch`, `next-router-segment-prefetch`,
  // `next-router-state-tree`) and the `_rsc` query before the proxy runs, so a router prefetch
  // and a client navigation look the same there, and a prefetch would get the session refresh
  // and the account guard meant for the visit (it did: tests/fixtures/rsc-request-shapes.json).
  // The proxy then leaves Next's `_rsc` out of every URL it builds; its redirects still reach the
  // browser with a relative `Location` (Next's router makes a same-origin one relative).
  skipProxyUrlNormalize: true,
  // Next gzips only when the request accepts it. The nginx example strips Accept-Encoding towards
  // the app, so behind it Next sends identity and nginx compresses once (brotli or gzip); without a
  // compressing proxy in front, Next's gzip still applies.
  compress: true,
  reactStrictMode: true,
  // X-Frame-Options, CSP frame-ancestors, nosniff and Referrer-Policy on every response
  // (no-referrer on the pages whose URL holds a payment credential).
  headers: async () => securityHeaderRules(),
  // `next dev` logs each request's URL; never one holding a payment link's token or a payment's
  // uuid (src/config/credential-routes.ts), the BFF's paths to them included. Production logs no
  // requests.
  logging: { incomingRequests: { ignore: [/\/order\/pay\//i, /\/payment\//i] } },
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: buildRemotePatterns(),
  },
}

export default nextConfig
