import type { NextConfig } from 'next'
import { buildRemotePatterns } from './src/config/remote-patterns'
import { securityHeaderRules } from './src/config/security-headers'

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
    // The API's origin from FIREFLY_API_URL at build time, else a permissive fallback
    // (src/config/remote-patterns.ts).
    remotePatterns: buildRemotePatterns(process.env.FIREFLY_API_URL),
  },
}

export default nextConfig
