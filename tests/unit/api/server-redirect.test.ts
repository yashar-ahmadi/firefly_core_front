// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { ApiError as ApiErrorType } from '@/lib/api/errors'

const NETWORK_DETAIL = 'ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.'

let fetchSpy: MockInstance<typeof fetch>

async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  const [{ apiFetch }, { ApiError }] = await Promise.all([
    import('@/lib/api/server'),
    import('@/lib/api/errors'),
  ])
  return { apiFetch, ApiError }
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

describe('apiFetch redirects', () => {
  it('never follows a redirect, so the API key is not re-sent to another URL', async () => {
    fetchSpy.mockImplementation(
      async () => new Response(null, { status: 302, headers: { location: 'https://evil.test/' } }),
    )
    const { apiFetch, ApiError } = await load()
    const error = (await apiFetch('homepage').catch((e: unknown) => e)) as ApiErrorType
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit
    expect(init.redirect).toBe('manual')
    expect(fetchSpy).toHaveBeenCalledTimes(1)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(502)
    expect(error.code).toBe('upstream_redirect')
    expect(error.detail).toBe(NETWORK_DETAIL)
  })

  it('treats an opaque redirect (status 0) as upstream_redirect too', async () => {
    const opaque = new Response(null, { status: 200 })
    Object.defineProperty(opaque, 'type', { value: 'opaqueredirect' })
    Object.defineProperty(opaque, 'status', { value: 0 })
    fetchSpy.mockImplementation(async () => opaque)
    const { apiFetch } = await load()
    await expect(apiFetch('homepage')).rejects.toMatchObject({
      status: 502,
      code: 'upstream_redirect',
    })
  })

  it('returns a normal 2xx unchanged', async () => {
    fetchSpy.mockImplementation(
      async () =>
        new Response(JSON.stringify({ msg: 'ok', code: 200, data: { a: 1 } }), { status: 200 }),
    )
    const { apiFetch } = await load()
    await expect(apiFetch('homepage')).resolves.toMatchObject({ data: { a: 1 }, status: 200 })
  })
})
