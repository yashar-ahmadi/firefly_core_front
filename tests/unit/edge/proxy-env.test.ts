// @vitest-environment node
import { NextRequest } from 'next/server'
import { afterEach, describe, expect, it, vi } from 'vitest'

// Paths the proxy leaves alone must not need a valid environment: the health probe reports a
// broken one itself (503), and Next internals and route handlers keep working.

async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  return import('@/proxy')
}

afterEach(() => {
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('proxy with an invalid environment', () => {
  it.each(['/_next/static/x.js', '/api/bff/cart/', '/s/phone-fest/', '/healthz/', '/logo.svg'])(
    'passes %s through without reading it',
    async (path) => {
      // A production environment with nothing set: getServerEnv() would throw.
      vi.stubEnv('NODE_ENV', 'production')
      vi.stubEnv('FIREFLY_API_URL', '')
      vi.stubEnv('FIREFLY_API_KEY', '')
      const { proxy } = await load()
      const res = await proxy(new NextRequest(`https://shop.test${path}`))
      expect(res.headers.get('x-middleware-next')).toBe('1')
    },
  )

  it('still fails loudly on a page, which needs the API', async () => {
    vi.stubEnv('NODE_ENV', 'production')
    vi.stubEnv('FIREFLY_API_URL', '')
    const { proxy } = await load()
    await expect(proxy(new NextRequest('https://shop.test/product/x/'))).rejects.toThrow(
      /FIREFLY_API_URL/,
    )
  })
})
