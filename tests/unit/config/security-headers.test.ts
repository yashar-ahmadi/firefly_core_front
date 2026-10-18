// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SECURITY_HEADERS, securityHeaderRules } from '@/config/security-headers'

/** next.config.ts as built for a known API origin (no fallback warning in the test output). */
async function loadNextConfig() {
  vi.stubEnv('FIREFLY_API_URL', 'https://api.shop.ir')
  vi.resetModules()
  return (await import('../../../next.config')).default
}

afterEach(() => {
  vi.unstubAllEnvs()
})

// Baseline response headers (clickjacking, MIME sniffing, referrer). A full CSP needs nonces and
// is deferred (docs/DEPLOYMENT.md), so the CSP carries `frame-ancestors` only.

describe('security headers', () => {
  it('applies the four baseline headers to every path, first', () => {
    expect(securityHeaderRules()[0]).toEqual({
      source: '/:path*',
      headers: [
        { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
        { key: 'Content-Security-Policy', value: "frame-ancestors 'self'" },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    })
  })

  it('then sends no referrer from the pages that hold a credential (the later rule wins)', () => {
    const noReferrer = [{ key: 'Referrer-Policy', value: 'no-referrer' }]
    expect(securityHeaderRules().slice(1)).toEqual([
      { source: '/order/pay/:path*', headers: noReferrer },
      { source: '/payment/:path*', headers: noReferrer },
      {
        source: '/:path*',
        has: [{ type: 'query', key: 'next', value: '(?:/order/pay/|/payment/).*' }],
        headers: noReferrer,
      },
    ])
  })

  it('keeps the CSP to frame-ancestors only (no script or style policy without nonces)', () => {
    const csp = SECURITY_HEADERS.find(({ key }) => key === 'Content-Security-Policy')
    expect(csp?.value.split(';').map((part) => part.trim())).toEqual(["frame-ancestors 'self'"])
  })

  it('hands out fresh objects, so a caller cannot change the shared list', () => {
    const [rule] = securityHeaderRules()
    rule.headers[0].value = 'DENY'
    expect(securityHeaderRules()[0].headers[0].value).toBe('SAMEORIGIN')
  })

  it('is what next.config.ts serves', async () => {
    const nextConfig = await loadNextConfig()
    expect(await nextConfig.headers?.()).toEqual(securityHeaderRules())
  })
})

describe('next.config compression', () => {
  it('keeps Next gzip on: behind nginx Accept-Encoding is stripped, so it sends identity', async () => {
    const nextConfig = await loadNextConfig()
    expect(nextConfig.compress).toBe(true)
  })
})
