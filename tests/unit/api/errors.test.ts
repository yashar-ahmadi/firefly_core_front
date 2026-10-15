import { describe, expect, it } from 'vitest'
import { ApiError } from '@/lib/api/errors'
import { FEATURE_KEYS, isFeatureKey } from '@/lib/api/types/common'

const NETWORK_DETAIL = 'ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.'

describe('ApiError', () => {
  it('is an Error whose message is the user-facing detail', () => {
    const error = new ApiError({ status: 400, code: 'invalid', detail: 'نامعتبر' })
    expect(error).toBeInstanceOf(Error)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.name).toBe('ApiError')
    expect(error.message).toBe('نامعتبر')
    expect(error.detail).toBe('نامعتبر')
  })

  it('has safe defaults', () => {
    const error = new ApiError({ status: 500 })
    expect(error.code).toBe('http_500')
    expect(error.errors).toEqual([])
    expect(error.retryAfter).toBeNull()
    expect(error.feature).toBeNull()
    expect(error.data).toEqual({})
    expect(error.detail.length).toBeGreaterThan(0)
    expect(error.isAuth()).toBe(false)
    expect(error.isFeatureDisabled()).toBe(false)
  })

  it('isAuth is true only for 401', () => {
    expect(new ApiError({ status: 401 }).isAuth()).toBe(true)
    expect(new ApiError({ status: 403 }).isAuth()).toBe(false)
  })

  it('isFeatureDisabled is true for the feature_disabled code or a known feature', () => {
    expect(new ApiError({ status: 503, code: 'feature_disabled' }).isFeatureDisabled()).toBe(true)
    expect(new ApiError({ status: 503, feature: 'wallet' }).isFeatureDisabled()).toBe(true)
    expect(new ApiError({ status: 503, code: 'auth_otp_send_failed' }).isFeatureDisabled()).toBe(
      false,
    )
  })

  describe('fieldErrors', () => {
    it('keys messages by attr and keeps dotted names as they are', () => {
      const error = new ApiError({
        status: 400,
        errors: [
          { code: 'required', detail: 'الزامی است', attr: 'receiver.mobile' },
          { code: 'blank', detail: 'خالی است', attr: 'name' },
        ],
      })
      expect(error.fieldErrors()).toEqual({
        'receiver.mobile': 'الزامی است',
        name: 'خالی است',
      })
    })

    it('puts null attrs under non_field_errors', () => {
      const error = new ApiError({
        status: 400,
        errors: [{ code: 'coupon_expired', detail: 'کد منقضی شده', attr: null }],
      })
      expect(error.fieldErrors()).toEqual({ non_field_errors: 'کد منقضی شده' })
    })

    it('keeps the first message when several errors share an attr', () => {
      const error = new ApiError({
        status: 400,
        errors: [
          { code: 'min_length', detail: 'اول', attr: 'password' },
          { code: 'invalid', detail: 'دوم', attr: 'password' },
          { code: 'x', detail: 'سوم', attr: null },
          { code: 'y', detail: 'چهارم', attr: null },
        ],
      })
      expect(error.fieldErrors()).toEqual({ password: 'اول', non_field_errors: 'سوم' })
    })

    it('is empty without errors', () => {
      expect(new ApiError({ status: 502 }).fieldErrors()).toEqual({})
    })
  })

  describe('fromBody', () => {
    it('derives code and detail from the first error and keeps the whole data object', () => {
      const error = ApiError.fromBody(409, {
        msg: 'تداخل',
        code: 409,
        data: {
          type: 'client_error',
          errors: [
            { code: 'order_not_open', detail: 'سفارش باز نیست', attr: null },
            { code: 'other', detail: 'دیگر', attr: null },
          ],
          known_statuses: ['paid'],
          open_attempt: { id: 7 },
        },
      })
      expect(error.status).toBe(409)
      expect(error.code).toBe('order_not_open')
      expect(error.detail).toBe('سفارش باز نیست')
      expect(error.errors).toHaveLength(2)
      expect(error.data.known_statuses).toEqual(['paid'])
      expect(error.data.open_attempt).toEqual({ id: 7 })
    })

    it('falls back to msg and http_<status> when there are no errors', () => {
      const error = ApiError.fromBody(404, { msg: 'یافت نشد', code: 404, data: {} })
      expect(error.code).toBe('http_404')
      expect(error.detail).toBe('یافت نشد')
    })

    it('falls back to a generic Persian sentence when there is no text at all', () => {
      const error = ApiError.fromBody(500, {})
      expect(error.code).toBe('http_500')
      expect(error.detail).not.toBe('')
      expect(error.data).toEqual({})
    })

    it('ignores malformed error entries and coerces a missing attr to null', () => {
      const error = ApiError.fromBody(400, {
        msg: 'm',
        data: { errors: [null, 'x', { detail: 'no code' }, { code: 'ok', detail: 'خوب' }] },
      })
      expect(error.errors).toEqual([{ code: 'ok', detail: 'خوب', attr: null }])
    })

    it('reads retry_after from the body, then from the Retry-After header', () => {
      const body = { msg: 'm', data: { errors: [{ code: 'throttled', detail: 'd', attr: null }] } }
      const fromBody = ApiError.fromBody(
        429,
        { ...body, data: { ...body.data, retry_after: 60 } },
        '5',
      )
      expect(fromBody.retryAfter).toBe(60)
      expect(ApiError.fromBody(429, body, '45').retryAfter).toBe(45)
      expect(ApiError.fromBody(429, body, 'Wed, 21 Oct 2026 07:28:00 GMT').retryAfter).toBeNull()
      expect(ApiError.fromBody(429, body, null).retryAfter).toBeNull()
    })

    it('only accepts known feature keys', () => {
      const withFeature = (feature: unknown) =>
        ApiError.fromBody(503, {
          msg: 'm',
          data: { errors: [{ code: 'feature_disabled', detail: 'd', attr: null }], feature },
        })
      expect(withFeature('blog').feature).toBe('blog')
      expect(withFeature('not_a_feature').feature).toBeNull()
      expect(withFeature(42).feature).toBeNull()
      expect(withFeature('not_a_feature').isFeatureDisabled()).toBe(true)
    })
  })

  describe('factories', () => {
    it('network() is status 0 with the connection sentence and keeps the cause', () => {
      const cause = new TypeError('fetch failed')
      const error = ApiError.network(cause)
      expect(error.status).toBe(0)
      expect(error.code).toBe('network_error')
      expect(error.detail).toBe(NETWORK_DETAIL)
      expect(error.cause).toBe(cause)
    })

    it('nonJson() keeps the HTTP status', () => {
      const error = ApiError.nonJson(502)
      expect(error.status).toBe(502)
      expect(error.code).toBe('non_json_response')
      expect(error.detail).toBe(NETWORK_DETAIL)
    })
  })
})

describe('FeatureKey helpers', () => {
  it('lists the ten runtime-switchable features', () => {
    expect([...FEATURE_KEYS].sort()).toEqual(
      [
        'blog',
        'blog_comments',
        'coupons',
        'guest_checkout',
        'online_payment',
        'pay_on_delivery',
        'product_comments',
        'registration',
        'stock_notifications',
        'wallet',
      ].sort(),
    )
  })

  it('isFeatureKey narrows unknown values', () => {
    expect(isFeatureKey('wallet')).toBe(true)
    expect(isFeatureKey('Wallet')).toBe(false)
    expect(isFeatureKey(undefined)).toBe(false)
  })
})
