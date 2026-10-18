// @vitest-environment node
import { AsyncLocalStorage } from 'node:async_hooks'
import { NextRequest } from 'next/server'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { stubEnv, type FetchSpy } from '../bff/support'

// The bank's return leg on the storefront host (order digest §0 #1, §4.1): GET and POST reach
// Django with the form body untouched, at the path with its trailing slash, with no session, no
// API key and no locale handling; Django's 302 to the result page is passed through untouched.
// A slash-less URL is sent on by Next with a 308, which keeps a POST's method and body.

;(globalThis as { AsyncLocalStorage?: unknown }).AsyncLocalStorage ??= AsyncLocalStorage

type Route = typeof import('@/app/api/v1/payment/gateway/callback/[gateway]/[token]/route')
const UUID = '3f1c7a52-9a0e-4c4b-b5e0-0d2f3b1c9a77'
const RESULT = `https://shop.test/payment/callback/?result=success&payment=${UUID}`

let fetchSpy: FetchSpy

beforeEach(() => {
  stubEnv()
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  vi.unstubAllEnvs()
  vi.restoreAllMocks()
  vi.resetModules()
  vi.doUnmock('server-only')
})

async function callback(method: 'GET' | 'POST', body?: string, query = '') {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  const route =
    (await import('@/app/api/v1/payment/gateway/callback/[gateway]/[token]/route')) as Route
  const req = new NextRequest(
    `https://shop.test/api/v1/payment/gateway/callback/MELLAT/cb-token-43/${query}`,
    {
      method,
      body,
      headers: {
        cookie: `ff_at=a; ff_rt=r`,
        'accept-language': 'en-US',
        ...(body ? { 'content-type': 'application/x-www-form-urlencoded' } : {}),
      },
    },
  )
  return route[method](req, {
    params: Promise.resolve({ gateway: 'MELLAT', token: 'cb-token-43' }),
  })
}

const sent = () => {
  const [input, init = {}] = fetchSpy.mock.calls.at(-1) ?? []
  return { url: String(input), init, headers: new Headers(init.headers) }
}

describe('the bank callback proxy', () => {
  it('a POST with a=b reaches Django with the body, and its 302 comes back untouched', async () => {
    fetchSpy.mockResolvedValue(
      new Response(null, {
        status: 302,
        headers: { location: RESULT, 'set-cookie': 'sessionid=django; Path=/' },
      }),
    )
    const res = await callback('POST', 'a=b')
    const { url, init, headers } = sent()
    expect(url).toBe('https://api.test/api/v1/payment/gateway/callback/MELLAT/cb-token-43/')
    expect(init.method).toBe('POST')
    expect(new TextDecoder().decode(init.body as Uint8Array)).toBe('a=b')
    expect(headers.get('content-type')).toBe('application/x-www-form-urlencoded')
    expect(init.redirect).toBe('manual')
    // No session, no key, no locale: the view is outside the API-key gate.
    for (const name of ['authorization', 'cookie', 'x-api-key', 'accept-language'])
      expect(headers.has(name), name).toBe(false)
    expect(res.status).toBe(302)
    expect(res.headers.get('location')).toBe(RESULT)
    expect(res.headers.get('set-cookie')).toBeNull()
  })

  it('a GET keeps its query and sends no body', async () => {
    fetchSpy.mockResolvedValue(new Response(null, { status: 302, headers: { location: RESULT } }))
    const res = await callback('GET', undefined, '?RefId=7&ResCode=0')
    expect(sent().url).toBe(
      'https://api.test/api/v1/payment/gateway/callback/MELLAT/cb-token-43/?RefId=7&ResCode=0',
    )
    expect(sent().init.body).toBeUndefined()
    expect(res.headers.get('location')).toBe(RESULT)
  })

  it('a backend that does not answer: 503, logged without anything that names the token', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const cause = Object.assign(new Error('connect ECONNREFUSED'), { code: 'ECONNREFUSED' })
    const failure = new TypeError(
      'fetch failed: https://api.test/api/v1/payment/gateway/callback/MELLAT/cb-token-43/',
      { cause },
    )
    fetchSpy.mockRejectedValue(failure)
    const res = await callback('GET', undefined, '?RefId=7&ResCode=0')
    expect(res.status).toBe(503)
    expect(log).toHaveBeenCalledTimes(1)
    const logged = log.mock.calls[0]!
    // Strings only (an error object prints its message, its cause and their URLs).
    expect(logged.every((part) => typeof part === 'string')).toBe(true)
    expect(logged.join(' ')).toMatch(/^\[payment-callback\] backend unreachable/)
    expect(logged.join(' ')).toContain('TypeError')
    expect(logged.join(' ')).toContain('ECONNREFUSED')
    expect(logged.join(' ')).not.toContain('cb-token-43')
    expect(logged.join(' ')).not.toContain('RefId')
  })

  it('a URL without its trailing slash is sent on with a 308 (the POST and its body kept)', async () => {
    vi.stubEnv('FIREFLY_API_URL', 'https://api.shop.ir')
    vi.resetModules()
    const nextConfig = (await import('../../../next.config')).default
    const { unstable_getResponseFromNextConfig } = await import('next/experimental/testing/server')
    const response = await unstable_getResponseFromNextConfig({
      url: 'https://shop.ir/api/v1/payment/gateway/callback/MELLAT/cb-token-43',
      nextConfig,
    })
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe(
      'https://shop.ir/api/v1/payment/gateway/callback/MELLAT/cb-token-43/',
    )
  })
})
