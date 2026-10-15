import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { apiPath, parseResponse } from '@/lib/api/envelope'

const NETWORK_DETAIL = 'ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.'

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  })
}

async function failureOf(res: Response): Promise<ApiError> {
  try {
    await parseResponse(res)
  } catch (error) {
    expect(error).toBeInstanceOf(ApiError)
    return error as ApiError
  }
  throw new Error('expected parseResponse to throw')
}

describe('parseResponse', () => {
  it('returns data, msg and status for a 200 envelope', async () => {
    const parsed = await parseResponse<{ id: number }>(
      json({ msg: 'ok', code: 200, data: { id: 5 } }),
    )
    expect(parsed).toEqual({ data: { id: 5 }, msg: 'ok', status: 200 })
  })

  it('keeps an empty-object payload and the msg of a 201', async () => {
    const parsed = await parseResponse(json({ msg: 'ثبت شد', code: 201, data: {} }, 201))
    expect(parsed).toEqual({ data: {}, msg: 'ثبت شد', status: 201 })
  })

  it('returns null data for a 204 with an empty body', async () => {
    const parsed = await parseResponse(new Response(null, { status: 204 }))
    expect(parsed).toEqual({ data: null, msg: '', status: 204 })
  })

  it('parses a JSON body even when the content-type header is missing', async () => {
    const res = new Response(JSON.stringify({ msg: 'm', code: 200, data: [1] }), { status: 200 })
    expect((await parseResponse<number[]>(res)).data).toEqual([1])
  })

  it('throws non_json_response for an HTML 502 and keeps the status', async () => {
    const res = new Response('<html><body>Bad gateway</body></html>', {
      status: 502,
      headers: { 'content-type': 'text/html' },
    })
    const error = await failureOf(res)
    expect(error.status).toBe(502)
    expect(error.code).toBe('non_json_response')
    expect(error.detail).toBe(NETWORK_DETAIL)
  })

  it('throws non_json_response for an HTML body behind a 200', async () => {
    const error = await failureOf(new Response('<!doctype html><title>x</title>', { status: 200 }))
    expect(error.status).toBe(200)
    expect(error.code).toBe('non_json_response')
  })

  it('throws non_json_response for an empty 2xx body other than 204', async () => {
    const error = await failureOf(new Response('', { status: 200 }))
    expect(error.code).toBe('non_json_response')
  })

  it('throws non_json_response for JSON that is not an object', async () => {
    expect((await failureOf(json([1, 2, 3]))).code).toBe('non_json_response')
    expect((await failureOf(json('ok'))).code).toBe('non_json_response')
    expect((await failureOf(json(null))).code).toBe('non_json_response')
  })

  it('exposes field errors of a 400 validation error, including dotted attrs', async () => {
    const error = await failureOf(
      json(
        {
          msg: 'Bad request',
          code: 400,
          data: {
            type: 'validation_error',
            errors: [
              { code: 'required', detail: 'شماره موبایل الزامی است', attr: 'receiver.mobile' },
              { code: 'invalid', detail: 'نامعتبر', attr: null },
            ],
          },
        },
        400,
      ),
    )
    expect(error.status).toBe(400)
    expect(error.code).toBe('required')
    expect(error.detail).toBe('شماره موبایل الزامی است')
    expect(error.fieldErrors()).toEqual({
      'receiver.mobile': 'شماره موبایل الزامی است',
      non_field_errors: 'نامعتبر',
    })
  })

  it('reads retry_after from the body of a 429', async () => {
    const error = await failureOf(
      json(
        {
          msg: 'Too many',
          code: 429,
          data: {
            type: 'client_error',
            errors: [{ code: 'throttled', detail: 'درخواست زیاد', attr: null }],
            retry_after: 60,
          },
        },
        429,
        { 'retry-after': '30' },
      ),
    )
    expect(error.retryAfter).toBe(60)
  })

  it('falls back to the Retry-After header when the body has none', async () => {
    const error = await failureOf(
      json({ msg: 'Too many', code: 429, data: { errors: [] } }, 429, { 'retry-after': '30' }),
    )
    expect(error.retryAfter).toBe(30)
  })

  it('maps a 503 feature_disabled to feature and isFeatureDisabled()', async () => {
    const error = await failureOf(
      json(
        {
          msg: 'Unavailable',
          code: 503,
          data: {
            type: 'server_error',
            errors: [{ code: 'feature_disabled', detail: 'وبلاگ غیرفعال است', attr: null }],
            feature: 'blog',
            feature_name: 'وبلاگ',
          },
        },
        503,
      ),
    )
    expect(error.status).toBe(503)
    expect(error.feature).toBe('blog')
    expect(error.isFeatureDisabled()).toBe(true)
    expect(error.data.feature_name).toBe('وبلاگ')
  })

  it('flags a 401 as an auth error', async () => {
    const error = await failureOf(
      json(
        {
          msg: 'Unauthorized',
          code: 401,
          data: { errors: [{ code: 'token_not_valid', detail: 'توکن نامعتبر', attr: null }] },
        },
        401,
      ),
    )
    expect(error.isAuth()).toBe(true)
    expect(error.code).toBe('token_not_valid')
  })

  it('keeps extra data keys such as known_statuses', async () => {
    const error = await failureOf(
      json(
        {
          msg: 'Conflict',
          code: 409,
          data: {
            type: 'client_error',
            errors: [{ code: 'order_status_invalid', detail: 'وضعیت نامعتبر', attr: 'status' }],
            known_statuses: ['pending', 'paid'],
          },
        },
        409,
      ),
    )
    expect(error.data.known_statuses).toEqual(['pending', 'paid'])
    expect(error.data.type).toBe('client_error')
  })

  it('falls back to msg and http_<status> when a JSON error has no errors array', async () => {
    const error = await failureOf(json({ msg: 'یافت نشد', code: 404, data: {} }, 404))
    expect(error.code).toBe('http_404')
    expect(error.detail).toBe('یافت نشد')
  })

  it('throws network_error when the body stream fails mid-read', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.error(new TypeError('terminated'))
      },
    })
    const error = await failureOf(new Response(stream, { status: 200 }))
    expect(error.status).toBe(0)
    expect(error.code).toBe('network_error')
  })
})

describe('apiPath', () => {
  it('encodes Persian segments, repeats array params and drops null/undefined', () => {
    expect(apiPath('product/detail/گوشی', { a: [1, 2], b: null, c: undefined })).toBe(
      'product/detail/%DA%AF%D9%88%D8%B4%DB%8C/?a=1&a=2',
    )
  })

  it('ensures exactly one trailing slash and drops leading and repeated slashes', () => {
    expect(apiPath('cart')).toBe('cart/')
    expect(apiPath('cart/')).toBe('cart/')
    expect(apiPath('cart///')).toBe('cart/')
    expect(apiPath('/cart/items//add')).toBe('cart/items/add/')
  })

  it('does not double-encode segments that are already encoded', () => {
    expect(apiPath('product/detail/%DA%AF%D9%88%D8%B4%DB%8C/')).toBe(
      'product/detail/%DA%AF%D9%88%D8%B4%DB%8C/',
    )
  })

  it('keeps an encoded slash inside one segment', () => {
    expect(apiPath('menu/a%2Fb/')).toBe('menu/a%2Fb/')
  })

  it('keeps a raw segment that is not valid percent-encoding, and encodes it', () => {
    expect(apiPath('page/100%ZZ')).toBe('page/100%25ZZ/')
  })

  it('encodes reserved characters in raw segments', () => {
    expect(apiPath('page/a b#c')).toBe('page/a%20b%23c/')
  })

  it('rejects dot segments so a path can never climb out of /api/v1/', () => {
    expect(() => apiPath('product/../../admin')).toThrow(RangeError)
    expect(() => apiPath('product/./x')).toThrow(RangeError)
    expect(() => apiPath('product/%2E%2E/x')).toThrow(RangeError)
  })

  it('serialises query values: booleans, numbers, strings, repeated arrays', () => {
    expect(
      apiPath('product/list', {
        page: 2,
        in_stock: true,
        hidden: false,
        brand: ['a', 'b c'],
        q: 'گوشی',
        skip: [],
      }),
    ).toBe(
      'product/list/?page=2&in_stock=true&hidden=false&brand=a&brand=b%20c&q=%DA%AF%D9%88%D8%B4%DB%8C',
    )
  })

  it('keeps an empty string value and encodes reserved characters in values', () => {
    expect(apiPath('search', { q: '', r: 'a&b=c+d' })).toBe('search/?q=&r=a%26b%3Dc%2Bd')
  })

  it('adds no question mark when every query value is dropped', () => {
    expect(apiPath('cart', { a: null, b: undefined, c: [] })).toBe('cart/')
    expect(apiPath('cart', {})).toBe('cart/')
  })
})
