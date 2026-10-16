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
  // Next gzips only when the request accepts it. The nginx example strips Accept-Encoding towards
  // the app, so behind it Next sends identity and nginx compresses once (brotli or gzip); without a
  // compressing proxy in front, Next's gzip still applies.
  compress: true,
  reactStrictMode: true,
  // X-Frame-Options, CSP frame-ancestors, nosniff and Referrer-Policy on every response.
  headers: async () => securityHeaderRules(),
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: buildRemotePatterns(),
  },
}

export default nextConfig
