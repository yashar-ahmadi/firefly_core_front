import { describe, expect, it } from 'vitest'
import {
  EMPTY_POST_COMMENT,
  postCommentBody,
  postCommentFailure,
} from '@/features/blog/post-comment-payload'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'

// The blog's comment form (blog digest §1.7): what it sends (every empty optional left out, the
// honeypot only when filled) and where each answer of the API's error matrix goes.

const values = (overrides: Partial<typeof EMPTY_POST_COMMENT> = {}) => ({
  ...EMPTY_POST_COMMENT,
  review: '  ممنون از مقاله  ',
  ...overrides,
})

const refusal = (status: number, errors: { code: string; attr: string | null; detail: string }[]) =>
  ApiError.fromBody(status, { data: { type: 'validation_error', errors } })

describe('postCommentBody', () => {
  it('a guest’s comment: the text trimmed, the name, nothing empty (no email, no type, no honeypot)', () => {
    expect(postCommentBody(values({ name: ' علی ' }), { mode: 'comment', guest: true })).toEqual({
      review: 'ممنون از مقاله',
      name: 'علی',
    })
  })

  it('a guest’s e-mail when given; a signed-in visitor sends neither (the account’s are used)', () => {
    const typed = values({ name: 'علی', email: ' a@b.ir ' })
    expect(postCommentBody(typed, { mode: 'comment', guest: true })).toEqual({
      review: 'ممنون از مقاله',
      name: 'علی',
      email: 'a@b.ir',
    })
    expect(postCommentBody(typed, { mode: 'comment', guest: false })).toEqual({
      review: 'ممنون از مقاله',
    })
  })

  it('a question says so; a reply names its parent and no type (it inherits the parent’s)', () => {
    expect(postCommentBody(values(), { mode: 'question', guest: false })).toEqual({
      review: 'ممنون از مقاله',
      comment_type: 'question',
    })
    expect(postCommentBody(values(), { mode: 'reply', guest: false, parentId: 10002 })).toEqual({
      review: 'ممنون از مقاله',
      parent: 10002,
    })
  })

  it('sends the honeypot only when a bot filled it', () => {
    expect(postCommentBody(values({ website: 'x.ir' }), { mode: 'comment', guest: false })).toEqual(
      { review: 'ممنون از مقاله', website: 'x.ir' },
    )
  })
})

describe('postCommentFailure: the error matrix', () => {
  it.each([
    ['required', 'review', 'این مقدار لازم است.'],
    ['blank', 'review', 'این مقدار نباید خالی باشد.'],
    ['max_length', 'review', 'طول این مقدار نباید بیشتر از 4096 نویسه باشد.'],
    ['invalid', 'name', 'وارد کردن نام برای کاربران مهمان الزامی است.'],
    ['max_length', 'name', 'طول این مقدار نباید بیشتر از 255 نویسه باشد.'],
    ['invalid', 'email', 'پست الکترونیکی صحیح وارد کنید.'],
  ])('400 %s on %s goes under that field', (code, attr, detail) => {
    const failure = postCommentFailure(refusal(400, [{ code, attr, detail }]))
    expect(failure.errors).toEqual({ [attr]: detail })
    expect(failure.askName).toBe(attr === 'name' || attr === 'email')
  })

  it('several at once: each under its field', () => {
    const failure = postCommentFailure(
      refusal(400, [
        { code: 'blank', attr: 'review', detail: 'خالی است.' },
        { code: 'invalid', attr: 'email', detail: 'ایمیل نادرست.' },
      ]),
    )
    expect(failure.errors).toEqual({ review: 'خالی است.', email: 'ایمیل نادرست.' })
  })

  it('400 invalid_choice on comment_type: above the buttons, with its message', () => {
    const failure = postCommentFailure(
      refusal(400, [{ code: 'invalid_choice', attr: 'comment_type', detail: 'نامعتبر.' }]),
    )
    expect(failure.errors).toEqual({ form: 'نامعتبر.' })
  })

  it.each(['does_not_exist', 'incorrect_type', 'invalid'])(
    '400 %s on parent: the answered comment is gone, the lists are read again',
    (code) => {
      const failure = postCommentFailure(refusal(400, [{ code, attr: 'parent', detail: 'x' }]))
      expect(failure.parentGone).toBe(true)
      expect(failure.errors.form).toMatch(/دیگر در دسترس نیست/)
    },
  )

  it('404 not_found: the post itself is gone', () => {
    const failure = postCommentFailure(
      ApiError.fromBody(404, {
        data: { errors: [{ code: 'not_found', attr: null, detail: 'یافت نشد.' }] },
      }),
    )
    expect(failure.errors).toEqual({ form: 'این مطلب دیگر در دسترس نیست.' })
    expect(failure.postGone).toBe(true)
  })

  it('429 throttled: a calm sentence and the API’s wait (data.retry_after)', () => {
    const failure = postCommentFailure(
      ApiError.fromBody(429, {
        data: { errors: [{ code: 'throttled', attr: null, detail: 'زیاد' }], retry_after: 1800 },
      }),
    )
    expect(failure.waitSeconds).toBe(1800)
    expect(failure.errors.form).toBe('لطفاً کمی بعد دوباره تلاش کنید.')
  })

  it.each(['blog', 'blog_comments'] as const)(
    '503 feature_disabled for %s: that switch',
    (feature) => {
      const failure = postCommentFailure(
        ApiError.fromBody(503, {
          data: {
            errors: [{ code: 'feature_disabled', attr: null, detail: 'بسته است.' }],
            feature,
          },
        }),
      )
      expect(failure.feature).toEqual({ key: feature, reason: 'بسته است.' })
      expect(failure.errors).toEqual({})
    },
  )

  it.each([
    [405, 'method_not_allowed', 'روش مجاز نیست.'],
    [413, 'request_too_large', 'حجم درخواست بیش از حد است.'],
    [401, 'api_key_invalid', 'کلید نامعتبر.'],
  ])('%i %s: its message above the buttons', (status, code, detail) => {
    const failure = postCommentFailure(
      ApiError.fromBody(status, { data: { errors: [{ code, attr: null, detail }] } }),
    )
    expect(failure.errors).toEqual({ form: detail })
  })

  it('no connection, or anything that is not the API: the generic sentence', () => {
    expect(postCommentFailure(new TypeError('x')).errors).toEqual({ form: GENERIC_ERROR_DETAIL })
  })
})
