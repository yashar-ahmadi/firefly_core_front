// @vitest-environment node
import { matchRemotePattern } from 'next/dist/shared/lib/match-remote-pattern'
import { describe, expect, it, vi } from 'vitest'
import { isOptimizable } from '@/components/ui/smart-image'
import { parseServerEnv } from '@/config/env-schema'
import { buildRemotePatterns } from '@/config/remote-patterns'
import { resolveStoreConfig, toPublicConfig } from '@/config/resolve-store-config'

// next.config's `images.remotePatterns` (R4): exactly the API's origin and its two media path
// prefixes when FIREFLY_API_URL is known at build time; a permissive fallback otherwise, so the
// build never depends on the backend.

const allows = (patterns: ReturnType<typeof buildRemotePatterns>, url: string) =>
  patterns.some((pattern) => matchRemotePattern(pattern, new URL(url)))

const quiet = () => vi.fn<(message: string) => void>()

describe('buildRemotePatterns with FIREFLY_API_URL', () => {
  it('allows the API origin’s /media/ and /static/ only', () => {
    const patterns = buildRemotePatterns('https://api.shop.ir', quiet())
    expect(patterns).toEqual([
      { protocol: 'https', hostname: 'api.shop.ir', port: '', pathname: '/media/**' },
      { protocol: 'https', hostname: 'api.shop.ir', port: '', pathname: '/static/**' },
    ])
    expect(allows(patterns, 'https://api.shop.ir/media/posts/a.jpg')).toBe(true)
    expect(allows(patterns, 'https://api.shop.ir/static/defaults/default.png')).toBe(true)
    expect(allows(patterns, 'https://api.shop.ir/api/v1/x.png')).toBe(false)
    expect(allows(patterns, 'http://api.shop.ir/media/a.jpg')).toBe(false)
    expect(allows(patterns, 'https://cdn.example.com/media/a.jpg')).toBe(false)
  })

  it('keeps an explicit port, and a path prefix does not change the media paths', () => {
    const patterns = buildRemotePatterns(' http://10.0.0.5:8000/backend/ ', quiet())
    expect(
      patterns.map(({ protocol, hostname, port }) => `${protocol}://${hostname}:${port}`),
    ).toEqual(['http://10.0.0.5:8000', 'http://10.0.0.5:8000'])
    expect(allows(patterns, 'http://10.0.0.5:8000/media/a.jpg')).toBe(true)
    expect(allows(patterns, 'http://10.0.0.5:9000/media/a.jpg')).toBe(false)
  })

  it('agrees with the public config’s mediaOrigin: what SmartImage optimizes is allowed', () => {
    const apiUrl = 'https://api.shop.ir/'
    const config = toPublicConfig(
      resolveStoreConfig(
        parseServerEnv({
          FIREFLY_API_URL: apiUrl,
          SITE_URL: 'https://shop.ir',
          FIREFLY_API_KEY: 'k',
        }),
      ),
    )
    const patterns = buildRemotePatterns(apiUrl, quiet())
    for (const src of [
      `${config.mediaOrigin}/media/CACHE/images/posts/a.jpg`,
      `${config.mediaOrigin}/static/defaults/default.png`,
    ]) {
      expect(isOptimizable(src, config.mediaOrigin)).toBe(true)
      expect(allows(patterns, src)).toBe(true)
    }
    // Not optimized, and not allowed either: another host.
    expect(isOptimizable('https://cdn.example.com/media/a.jpg', config.mediaOrigin)).toBe(false)
    expect(allows(patterns, 'https://cdn.example.com/media/a.jpg')).toBe(false)
  })

  it.each(['not a url', 'api.shop.ir', '//api.shop.ir'])(
    'refuses %j, naming the variable',
    (bad) => {
      expect(() => buildRemotePatterns(bad, quiet())).toThrow(
        /^FIREFLY_API_URL is not a valid absolute URL/,
      )
    },
  )

  it.each(['ftp://api.shop.ir', 'file:///srv/media'])('refuses the non-http(s) %j', (bad) => {
    expect(() => buildRemotePatterns(bad, quiet())).toThrow(
      /^FIREFLY_API_URL must use http or https/,
    )
  })
})

describe('buildRemotePatterns without FIREFLY_API_URL (the build needs no backend)', () => {
  it.each([undefined, '', '   '])(
    '%j: any https host and http localhost / 127.0.0.1 on any port',
    (unset) => {
      const warn = quiet()
      const patterns = buildRemotePatterns(unset, warn)
      expect(warn).toHaveBeenCalledOnce()
      expect(warn.mock.calls[0]?.[0]).toContain('FIREFLY_API_URL is not set at build time')
      // No port key: every port matches (local dev servers, R4).
      expect(patterns.every((pattern) => !('port' in pattern))).toBe(true)
      for (const url of [
        'https://cdn.example.com/media/a.jpg',
        'http://localhost:8000/media/a.jpg',
        'http://localhost:9999/static/defaults/default.png',
        'http://127.0.0.1:8000/media/a.jpg',
        'http://localhost/media/a.jpg',
      ]) {
        expect(allows(patterns, url), url).toBe(true)
      }
      for (const url of [
        'http://cdn.example.com/media/a.jpg',
        'http://192.168.1.10:8000/media/a.jpg',
        'http://localhost:8000/api/v1/x.png',
        'https://cdn.example.com/uploads/a.jpg',
      ]) {
        expect(allows(patterns, url), url).toBe(false)
      }
    },
  )
})
