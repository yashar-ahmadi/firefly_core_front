// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import type { ApiError as ApiErrorType } from '@/lib/api/errors'

// apiFetch's failures without an HTTP answer: a refused connection, its own timeout, and the
// caller's abort signal, alone and together with the timeout (whichever fires first wins).

const NETWORK_DETAIL = 'ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.'

let fetchSpy: MockInstance<typeof fetch>

function envelope(data: unknown): Response {
  return new Response(JSON.stringify({ msg: 'ok', code: 200, data }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  })
}

/** A fetch that never answers, and rejects with the signal's reason once it aborts. */
function hangingFetch(_url: string | URL | Request, init?: RequestInit): Promise<Response> {
  return new Promise((_resolve, reject) => {
    const signal = init?.signal
    if (signal?.aborted) reject(signal.reason)
    signal?.addEventListener('abort', () => reject(signal.reason))
  })
}

async function load() {
  vi.resetModules()
  vi.doMock('server-only', () => ({}))
  const [{ apiFetch }, { ApiError }] = await Promise.all([
    import('@/lib/api/server'),
    import('@/lib/api/errors'),
  ])
  return { apiFetch, ApiError }
}

function lastSignal(): AbortSignal {
  const init = fetchSpy.mock.calls.at(-1)?.[1]
  return init?.signal as AbortSignal
}

beforeEach(() => {
  vi.stubEnv('FIREFLY_API_URL', 'https://api.test/')
  vi.stubEnv('SITE_URL', 'https://shop.test/')
  vi.stubEnv('FIREFLY_API_KEY', 'key-123')
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => envelope({ id: 1 }))
})

afterEach(() => {
  fetchSpy.mockRestore()
  vi.useRealTimers()
  vi.unstubAllEnvs()
  vi.resetModules()
  vi.doUnmock('server-only')
})

describe('apiFetch network failures', () => {
  it('maps a rejected fetch to network_error with status 0', async () => {
    fetchSpy.mockRejectedValue(new TypeError('fetch failed'))
    const { apiFetch, ApiError } = await load()
    const error = (await apiFetch('homepage').catch((e: unknown) => e)) as ApiErrorType
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.code).toBe('network_error')
    expect(error.detail).toBe(NETWORK_DETAIL)
    expect(error.cause).toBeInstanceOf(TypeError)
  })

  it('passes an unaborted signal to fetch by default', async () => {
    const { apiFetch } = await load()
    await apiFetch('homepage')
    expect(lastSignal()).toBeInstanceOf(AbortSignal)
    expect(lastSignal().aborted).toBe(false)
  })

  it('aborts after timeoutMs and reports network_error', async () => {
    fetchSpy.mockImplementation(hangingFetch)
    const { apiFetch, ApiError } = await load()
    const error = (await apiFetch('homepage', { timeoutMs: 15 }).catch(
      (e: unknown) => e,
    )) as ApiErrorType
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.code).toBe('network_error')
    expect(error.detail).toBe(NETWORK_DETAIL)
  })

  it('rethrows the caller abort instead of reporting a network error', async () => {
    fetchSpy.mockImplementation(hangingFetch)
    const { apiFetch, ApiError } = await load()
    const controller = new AbortController()
    const pending = apiFetch('homepage', { signal: controller.signal }).catch((e: unknown) => e)
    controller.abort(new DOMException('cancelled', 'AbortError'))
    const error = await pending
    expect(error).not.toBeInstanceOf(ApiError)
    expect((error as Error).name).toBe('AbortError')
  })
})

describe('apiFetch with a caller signal and a timeout together', () => {
  it('hands fetch one signal that the caller’s abort aborts', async () => {
    const { apiFetch } = await load()
    const controller = new AbortController()
    await apiFetch('homepage', { signal: controller.signal, timeoutMs: 60_000 })
    expect(lastSignal()).not.toBe(controller.signal)
    expect(lastSignal().aborted).toBe(false)
    controller.abort()
    expect(lastSignal().aborted).toBe(true)
  })

  it('the timeout first: the transport’s timeout error, the caller’s signal untouched', async () => {
    fetchSpy.mockImplementation(hangingFetch)
    const { apiFetch, ApiError } = await load()
    const controller = new AbortController()
    const error = (await apiFetch('homepage', { signal: controller.signal, timeoutMs: 15 }).catch(
      (e: unknown) => e,
    )) as ApiErrorType
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.code).toBe('network_error')
    expect(error.detail).toBe(NETWORK_DETAIL)
    expect((error.cause as Error).name).toBe('TimeoutError')
    expect(controller.signal.aborted).toBe(false)
  })

  it('the caller first: the very AbortError it aborted with, and no timeout error after', async () => {
    fetchSpy.mockImplementation(hangingFetch)
    const { apiFetch, ApiError } = await load()
    const controller = new AbortController()
    const reason = new DOMException('left the page', 'AbortError')
    const pending = apiFetch('homepage', { signal: controller.signal, timeoutMs: 40 }).catch(
      (e: unknown) => e,
    )
    controller.abort(reason)
    const error = await pending
    expect(error).toBe(reason)
    expect(error).not.toBeInstanceOf(ApiError)
    // The timeout firing later changes nothing: the call has settled with the caller's reason.
    await new Promise((resolve) => setTimeout(resolve, 60))
    expect(lastSignal().reason).toBe(reason)
  })

  it('a caller signal aborted before the call: its own reason, never a network error', async () => {
    fetchSpy.mockImplementation(hangingFetch)
    const { apiFetch, ApiError } = await load()
    const reason = new DOMException('already gone', 'AbortError')
    const error = await apiFetch('homepage', {
      signal: AbortSignal.abort(reason),
      timeoutMs: 60_000,
    }).catch((e: unknown) => e)
    expect(error).toBe(reason)
    expect(error).not.toBeInstanceOf(ApiError)
  })
})
