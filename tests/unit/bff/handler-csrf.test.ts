// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { API, bff, envelope, loadHandler, stubEnv, upstreamCalls, type FetchSpy } from './support'

let fetchSpy: FetchSpy

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => envelope({ ok: true }))
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('CSRF', () => {
  it('refuses a wrong X-Requested-With value', async () => {
    const handleBff = await loadHandler()
    const [req, segments] = bff('cart/clear/', {
      method: 'DELETE',
      headers: { 'x-requested-with': 'XMLHttpRequest' },
    })
    expect((await handleBff(req, segments)).status).toBe(403)
  })

  it('refuses a write whose Origin is another host', async () => {
    const handleBff = await loadHandler()
    for (const origin of ['https://evil.test', 'null', 'https://shop.test.evil.test']) {
      const [req, segments] = bff('cart/item/add/', {
        method: 'POST',
        json: {},
        headers: { origin },
      })
      expect((await handleBff(req, segments)).status, origin).toBe(403)
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('accepts a write whose Origin is our own host', async () => {
    const handleBff = await loadHandler()
    const [req, segments] = bff('cart/item/add/', {
      method: 'POST',
      json: {},
      headers: { origin: 'https://shop.test' },
    })
    expect((await handleBff(req, segments)).status).toBe(200)
  })

  it('accepts an Origin equal to the SITE_URL host when an edge rewrote Host', async () => {
    const handleBff = await loadHandler()
    const [req, segments] = bff('cart/item/add/', {
      method: 'POST',
      json: {},
      headers: { host: 'storefront.internal:3000', origin: 'https://shop.test' },
    })
    expect((await handleBff(req, segments)).status).toBe(200)
    expect(upstreamCalls(fetchSpy)).toHaveLength(1)
  })

  it('refuses a GET without X-Requested-With, so a cross-site navigation reaches nothing', async () => {
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('blog/post/x/', { csrf: false }))
    expect(res.status).toBe(403)
    expect((await res.json()).data.errors[0].code).toBe('csrf_failed')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('forwards a GET with X-Requested-With and without Origin', async () => {
    const handleBff = await loadHandler()
    const res = await handleBff(...bff('blog/post/x/'))
    expect(res.status).toBe(200)
    expect(upstreamCalls(fetchSpy)[0]?.url).toBe(`${API}blog/post/x/`)
  })
})
