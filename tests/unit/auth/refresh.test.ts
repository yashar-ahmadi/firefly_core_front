// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'

let fetchSpy: MockInstance<typeof fetch>

function envelope(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ msg: 'm', code: status, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function failure(status: number, code: string, attr: string | null = null): Response {
  return envelope({ type: 'client_error', errors: [{ code, detail: 'd', attr }] }, status)
}

async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  return (await import('@/lib/auth/refresh')).refreshAccess
}

beforeEach(() => {
  vi.stubEnv('FIREFLY_API_URL', 'https://api.test')
  vi.stubEnv('FIREFLY_API_KEY', 'key-123')
  fetchSpy = vi.spyOn(globalThis, 'fetch')
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('refreshAccess', () => {
  it('posts the refresh token with the API key and visitor IP and returns the new access', async () => {
    fetchSpy.mockResolvedValue(envelope({ access: 'new.access.jwt' }))
    const refreshAccess = await load()
    await expect(refreshAccess('old.refresh.jwt', '203.0.113.9')).resolves.toEqual({
      access: 'new.access.jwt',
    })
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit]
    const headers = new Headers(init.headers)
    expect(url).toBe('https://api.test/api/v1/account/auth/token/refresh/')
    expect(init.method).toBe('POST')
    expect(init.redirect).toBe('manual')
    expect(init.body).toBe(JSON.stringify({ refresh: 'old.refresh.jwt' }))
    expect(headers.get('X-API-Key')).toBe('key-123')
    expect(headers.get('X-Forwarded-For')).toBe('203.0.113.9')
    expect(headers.has('Authorization')).toBe(false)
  })

  it('omits X-Forwarded-For without a visitor IP', async () => {
    fetchSpy.mockResolvedValue(envelope({ access: 'a.b.c' }))
    const refreshAccess = await load()
    await refreshAccess('r.r.r', null)
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
    expect(new Headers(init.headers).has('X-Forwarded-For')).toBe(false)
  })

  it.each([
    ['auth_token_invalid', 401, null],
    ['token_not_valid', 401, null],
    ['required', 400, 'refresh'],
  ])('maps %s (%i) to invalid', async (code, status, attr) => {
    fetchSpy.mockResolvedValue(failure(status, code, attr))
    const refreshAccess = await load()
    await expect(refreshAccess('r.r.r', null)).resolves.toEqual({ error: 'invalid' })
  })

  it.each(['user_inactive', 'user_not_found'])('maps 401 %s to inactive', async (code) => {
    fetchSpy.mockResolvedValue(failure(401, code))
    const refreshAccess = await load()
    await expect(refreshAccess('r.r.r', null)).resolves.toEqual({ error: 'inactive' })
  })

  it.each([
    ['a rejected fetch', () => Promise.reject(new TypeError('fetch failed'))],
    ['a 500 envelope', async () => failure(500, 'error')],
    ['an HTML 502', async () => new Response('<html></html>', { status: 502 })],
    ['a 429 throttle', async () => failure(429, 'throttled')],
    ['a 401 api_key_invalid (config bug)', async () => failure(401, 'api_key_invalid')],
    ['a 200 without access', async () => envelope({})],
    ['a redirect', async () => new Response(null, { status: 302, headers: { location: '/x' } })],
  ])('maps %s to network, so the session is kept', async (_label, impl) => {
    fetchSpy.mockImplementation(impl as () => Promise<Response>)
    const refreshAccess = await load()
    await expect(refreshAccess('r.r.r', null)).resolves.toEqual({ error: 'network' })
  })
})
