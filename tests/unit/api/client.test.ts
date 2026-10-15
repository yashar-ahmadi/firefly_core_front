import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest'
import { bffFetch } from '@/lib/api/client'
import { ApiError } from '@/lib/api/errors'

const NETWORK_DETAIL = 'ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.'

let fetchSpy: MockInstance<typeof fetch>

function envelope(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ msg: 'ok', code: status, data }), {
    status,
    headers: { 'content-type': 'application/json' },
  })
}

function lastCall(): { url: string; init: RequestInit; headers: Headers } {
  const [url, init] = fetchSpy.mock.calls.at(-1) as [string, RequestInit]
  return { url, init, headers: new Headers(init.headers) }
}

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(async () => envelope({ id: 1 }))
})

afterEach(() => {
  fetchSpy.mockRestore()
})

// This file never mocks 'server-only': importing the module at the top already proves
// that bffFetch is safe to bundle into a client component.
describe('bffFetch', () => {
  it('targets /api/bff/<path>/ and sends X-Requested-With', async () => {
    await bffFetch('cart', { query: { page: 2, tag: ['a', 'b'], skip: null } })
    const { url, init, headers } = lastCall()
    expect(url).toBe('/api/bff/cart/?page=2&tag=a&tag=b')
    expect(init.method).toBe('GET')
    expect(headers.get('X-Requested-With')).toBe('ff')
    expect(headers.get('Accept')).toBe('application/json')
    expect(headers.has('Content-Type')).toBe(false)
    expect(init.body).toBeUndefined()
  })

  it('never sends the API key or an Authorization header', async () => {
    await bffFetch('cart')
    const { headers } = lastCall()
    expect(headers.has('X-API-Key')).toBe(false)
    expect(headers.has('Authorization')).toBe(false)
  })

  it('encodes Persian path segments once', async () => {
    await bffFetch('product/detail/گوشی')
    expect(lastCall().url).toBe('/api/bff/product/detail/%DA%AF%D9%88%D8%B4%DB%8C/')
  })

  it('sends a JSON body with a content type and defaults to POST', async () => {
    await bffFetch('cart/item/add', { body: { product: 3 } })
    const { init, headers } = lastCall()
    expect(init.method).toBe('POST')
    expect(headers.get('Content-Type')).toBe('application/json')
    expect(headers.get('X-Requested-With')).toBe('ff')
    expect(init.body).toBe(JSON.stringify({ product: 3 }))
  })

  it('sends FormData without a content type so the browser adds the boundary', async () => {
    const form = new FormData()
    form.append('avatar', new Blob(['x']), 'a.png')
    await bffFetch('account/profile/me', { method: 'PATCH', formData: form })
    const { init, headers } = lastCall()
    expect(init.body).toBe(form)
    expect(headers.has('Content-Type')).toBe(false)
  })

  it('forwards Idempotency-Key and the abort signal', async () => {
    const controller = new AbortController()
    await bffFetch('order/create', {
      method: 'POST',
      body: {},
      idempotencyKey: 'idem-9',
      signal: controller.signal,
    })
    const { init, headers } = lastCall()
    expect(headers.get('Idempotency-Key')).toBe('idem-9')
    expect(init.signal).toBe(controller.signal)
  })

  it('returns data, msg and status', async () => {
    fetchSpy.mockImplementation(async () => envelope({ count: 3 }, 201))
    expect(await bffFetch('cart/item/add', { method: 'POST', body: {} })).toEqual({
      data: { count: 3 },
      msg: 'ok',
      status: 201,
    })
  })

  it('returns null data for a 204', async () => {
    fetchSpy.mockImplementation(async () => new Response(null, { status: 204 }))
    expect((await bffFetch('wishlist/x', { method: 'DELETE' })).data).toBeNull()
  })

  it('throws an ApiError with field errors for a 400', async () => {
    fetchSpy.mockImplementation(async () =>
      envelope(
        {
          type: 'validation_error',
          errors: [{ code: 'required', detail: 'الزامی', attr: 'receiver.mobile' }],
        },
        400,
      ),
    )
    const error = (await bffFetch('order/create', { method: 'POST', body: {} }).catch(
      (e: unknown) => e,
    )) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(400)
    expect(error.fieldErrors()).toEqual({ 'receiver.mobile': 'الزامی' })
  })

  it('throws non_json_response when a proxy answers with HTML', async () => {
    fetchSpy.mockImplementation(async () => new Response('<html>413</html>', { status: 413 }))
    await expect(
      bffFetch('account/profile/me', { method: 'PATCH', body: {} }),
    ).rejects.toMatchObject({ status: 413, code: 'non_json_response', detail: NETWORK_DETAIL })
  })

  it('maps a rejected fetch to network_error with status 0', async () => {
    fetchSpy.mockRejectedValue(new TypeError('Failed to fetch'))
    const error = (await bffFetch('cart').catch((e: unknown) => e)) as ApiError
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(0)
    expect(error.code).toBe('network_error')
    expect(error.detail).toBe(NETWORK_DETAIL)
  })

  it('rethrows an abort caused by the caller', async () => {
    const controller = new AbortController()
    fetchSpy.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason))
        }),
    )
    const pending = bffFetch('cart', { signal: controller.signal }).catch((e: unknown) => e)
    controller.abort(new DOMException('cancelled', 'AbortError'))
    const error = await pending
    expect(error).not.toBeInstanceOf(ApiError)
    expect((error as Error).name).toBe('AbortError')
  })
})
