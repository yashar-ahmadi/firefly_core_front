import { describe, expect, it } from 'vitest'
import { commentFailure, THROTTLED } from '@/features/comments/comment-payload'
import { ApiError } from '@/lib/api/errors'

// Every answer of a content page's comment submit (content digest §4.2, its error table) and
// where the page's form puts it: under a field, above the buttons, the lists read again, the
// form closed (403), the page gone (404), a wait (429).

const pageFailure = (error: unknown) => commentFailure(error, 'page')

const refusal = (status: number, code: string, attr: string | null, detail: string) =>
  ApiError.fromBody(status, {
    data: { type: attr ? 'validation_error' : 'client_error', errors: [{ code, attr, detail }] },
  })

describe('a page’s comment errors (§4.2)', () => {
  it.each([
    ['required', 'review'],
    ['blank', 'review'],
    ['max_length', 'review'],
    ['null', 'review'],
    ['max_length', 'name'],
    ['invalid', 'name'],
    ['null', 'name'],
    ['invalid', 'email'],
    ['blank', 'email'],
  ])('400 %s on %s: under that field', (code, attr) => {
    const failure = pageFailure(refusal(400, code, attr, `${code} ${attr}`))
    expect(failure.errors).toEqual({ [attr]: `${code} ${attr}` })
    // A name or e-mail refused: the API took the visitor for a guest (asks for the name).
    expect(failure.askName).toBe(attr !== 'review')
    expect(failure.closed).toBeNull()
  })

  it.each([
    ['invalid_choice', 'comment_type'],
    ['null', 'comment_type'],
  ])('400 %s on %s: above the buttons, with its message', (code, attr) => {
    expect(pageFailure(refusal(400, code, attr, 'نامعتبر.')).errors).toEqual({ form: 'نامعتبر.' })
  })

  it.each(['does_not_exist', 'incorrect_type', 'invalid'])(
    '400 %s on parent: the answered comment is gone, the lists are read again',
    (code) => {
      const failure = pageFailure(refusal(400, code, 'parent', 'نظر والد متعلق به این صفحه نیست.'))
      expect(failure.parentGone).toBe(true)
      expect(failure.errors.form).toMatch(/دیگر در دسترس نیست/)
    },
  )

  it.each([
    [400, 'parse_error', 'بدنهٔ درخواست خالی است.'],
    [405, 'method_not_allowed', 'روش مجاز نیست.'],
    [413, 'request_too_large', 'حجم درخواست بیش از حد است.'],
    [415, 'unsupported_media_type', 'نوع محتوا پشتیبانی نمی\u{200C}شود.'],
  ])('%i %s (no attr): its message above the buttons', (status, code, detail) => {
    expect(pageFailure(refusal(status, code, null, detail)).errors).toEqual({ form: detail })
  })

  it('403 page_comments_disabled: the form is closed with the API’s sentence, no field error', () => {
    const detail = 'ثبت نظر برای این صفحه غیرفعال است.'
    const failure = pageFailure(refusal(403, 'page_comments_disabled', null, detail))
    expect(failure.closed).toBe(detail)
    expect(failure.errors).toEqual({})
    expect(failure.subjectGone).toBe(false)
  })

  it('403 page_comments_disabled without a sentence: the page’s own words', () => {
    const failure = pageFailure(refusal(403, 'page_comments_disabled', null, ''))
    expect(failure.closed).toBe('ثبت دیدگاه و پرسش برای این صفحه بسته است.')
  })

  it('another 403 (a refused origin) is no closing: its message above the buttons', () => {
    const failure = pageFailure(refusal(403, 'csrf_failed', null, 'درخواست نامعتبر.'))
    expect(failure.closed).toBeNull()
    expect(failure.errors).toEqual({ form: 'درخواست نامعتبر.' })
  })

  it('404 not_found: the page itself is gone (unpublished or deleted meanwhile)', () => {
    const failure = pageFailure(refusal(404, 'not_found', null, 'یافت نشد.'))
    expect(failure.subjectGone).toBe(true)
    expect(failure.errors).toEqual({ form: 'این صفحه دیگر در دسترس نیست.' })
  })

  it('429 throttled: a calm sentence and the API’s wait', () => {
    const failure = pageFailure(
      ApiError.fromBody(429, {
        data: { errors: [{ code: 'throttled', attr: null, detail: 'زیاد' }], retry_after: 600 },
      }),
    )
    expect(failure.errors).toEqual({ form: THROTTLED })
    expect(failure.waitSeconds).toBe(600)
  })
})
