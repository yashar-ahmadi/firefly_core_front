import type { NextConfig } from 'next'

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
  // The reverse proxy in front (deploy/nginx.conf.example) compresses with gzip and brotli; Next's
  // own gzip would hand it already-encoded bodies and nginx would pass them on untouched. Without
  // a compressing proxy in front the site still works, just uncompressed.
  compress: false,
  reactStrictMode: true,
  images: {
    formats: ['image/avif', 'image/webp'],
    remotePatterns: buildRemotePatterns(),
  },
}

export default nextConfig
