// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks'
import { afterEach, describe, expect, it, vi } from 'vitest'

// The contact page's other addresses (controller ruling, Plan 5 Task 4): `/contact-us/` is the
// canonical one (the backend's `support_link`); the guide's `/contact/` and the operator's
// content page `/page/contact-us/` send there for good (308, next.config `redirects`), through
// Next's own matcher. next.config's redirects run before the proxy (Next 16 docs, proxy
// «Execution order»), so these win over any operator redirect rule for the same paths.

// Next's config-testing helper reads this global (the test runs outside Next's server).
;(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage

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

describe('the contact page’s other addresses', () => {
  it.each(['/contact/', '/page/contact-us/'])('%s → /contact-us/ (308)', async (path) => {
    const response = await answer(path)
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://shop.ir/contact-us/')
  })

  it('keeps the query', async () => {
    const response = await answer('/contact/?utm_source=sms')
    expect(response.headers.get('location')).toBe('https://shop.ir/contact-us/?utm_source=sms')
  })

  it('without its trailing slash, gets it first (then the redirect above)', async () => {
    const response = await answer('/contact')
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('https://shop.ir/contact/')
  })

  it.each(['/contact-us/', '/page/about-us/', '/contact-us/extra/', '/page/contact-us-old/'])(
    'leaves %s alone',
    async (path) => {
      const response = await answer(path)
      expect(response.headers.get('location')).toBeNull()
    },
  )
})
