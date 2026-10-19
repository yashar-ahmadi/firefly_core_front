import type { NextConfig } from 'next'

// The `next/image` allow-list of next.config.ts (`images.remotePatterns`). Pure: next.config
// passes the build's FIREFLY_API_URL and its logger (tests/unit/config/remote-patterns.test.ts).
// Relative imports only: next.config.ts loads this file before the `@/` alias exists.

export type RemotePattern = NonNullable<NonNullable<NextConfig['images']>['remotePatterns']>[number]
type HttpProtocol = 'http' | 'https'

/** The only path prefixes the Firefly API serves images from. */
export const MEDIA_PATHNAMES = ['/media/**', '/static/**'] as const

/**
 * Builds the `next/image` allow-list.
 *
 * - `apiUrl` set (FIREFLY_API_URL at build time): exactly that protocol + host (+ port),
 *   restricted to the media path prefixes. The same origin is the public config's `mediaOrigin`,
 *   which SmartImage optimizes (R1). Not an absolute http(s) URL: throws, naming the variable.
 * - Otherwise (the build must not depend on the backend): any https host plus localhost /
 *   127.0.0.1 on any port (R4), still restricted to the media path prefixes, and `warn` is
 *   called once.
 */
export function buildRemotePatterns(
  apiUrl: string | undefined,
  warn: (message: string) => void = console.warn,
): RemotePattern[] {
  const value = apiUrl?.trim()

  if (value) {
    let url: URL
    try {
      url = new URL(value)
    } catch {
      throw new Error(`FIREFLY_API_URL is not a valid absolute URL: "${value}"`)
    }
    const protocol = url.protocol.replace(/:$/, '')
    if (protocol !== 'http' && protocol !== 'https') {
      throw new Error(`FIREFLY_API_URL must use http or https: "${value}"`)
    }
    return MEDIA_PATHNAMES.map((pathname) => ({
      protocol: protocol as HttpProtocol,
      hostname: url.hostname,
      port: url.port,
      pathname,
    }))
  }

  warn(
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
