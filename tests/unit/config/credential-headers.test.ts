// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'

// What next.config.ts answers on the payment pages (order digest §0 #3, §1.3), through Next's own
// matcher for `headers()` and its trailing-slash redirect: the SMS link has no trailing slash and
// must reach the page with its token, and a page holding a credential sends no referrer.

// Next's config-testing helper reads this global (the test runs outside Next's server).
;(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage

const TOKEN = 'k3J9f0qLx2mN8pR1sT4uV7wY0zA3bC6dE9gH2jK5mN8'

async function answer(path: string) {
  vi.stubEnv('FIREFLY_API_URL', 'https://api.shop.ir')
  vi.resetModules()
  const nextConfig = (await import('../../../next.config')).default
  const { unstable_getResponseFromNextConfig } = await import('next/experimental/testing/server')
  return unstable_getResponseFromNextConfig({ url: `https://shop.ir${path}`, nextConfig })
}

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('the payment link from the SMS', () => {
  it('without its trailing slash, is sent on (308) to the page, the token kept', async () => {
    const response = await answer(`/order/pay/${TOKEN}`)
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(`https://shop.ir/order/pay/${TOKEN}/`)
    // (The live server answers this redirect before any header rule: the page it leads to
    // carries the policy; tests/e2e/checkout/pay-link.spec.ts checks both.)
  })
})

describe('Referrer-Policy', () => {
  it.each([
    `/order/pay/${TOKEN}/`,
    '/payment/callback/?payment=3f1c7a52-9a0e-4c4b-b5e0-0d2f3b1c9a77&result=success',
    '/payment/card-transfer/3f1c7a52-9a0e-4c4b-b5e0-0d2f3b1c9a77/',
    `/login/?next=/order/pay/${TOKEN}/`,
  ])('is no-referrer on %s', async (path) => {
    expect((await answer(path)).headers.get('referrer-policy')).toBe('no-referrer')
  })

  it.each(['/', '/checkout/', '/order/track/', '/login/?next=/account/'])(
    'stays strict-origin-when-cross-origin on %s',
    async (path) => {
      expect((await answer(path)).headers.get('referrer-policy')).toBe(
        'strict-origin-when-cross-origin',
      )
    },
  )
})

describe('the dev request log', () => {
  it('never prints a URL that holds a payment credential', async () => {
    vi.stubEnv('FIREFLY_API_URL', 'https://api.shop.ir')
    vi.resetModules()
    const nextConfig = (await import('../../../next.config')).default
    const logging = nextConfig.logging
    const ignore =
      logging && typeof logging.incomingRequests === 'object'
        ? (logging.incomingRequests.ignore ?? [])
        : []
    const ignored = (url: string) => ignore.some((pattern) => pattern.test(url))
    expect(ignored(`/order/pay/${TOKEN}/`)).toBe(true)
    expect(ignored(`/api/bff/order/pay/${TOKEN}/cancel/`)).toBe(true)
    expect(ignored(`/api/bff/payment/link/${TOKEN}/intent/`)).toBe(true)
    expect(ignored('/payment/callback/?payment=3f1c7a52')).toBe(true)
    expect(ignored('/product/x/')).toBe(false)
  })
})
