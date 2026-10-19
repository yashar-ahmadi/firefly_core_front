import { describe, expect, it } from 'vitest'
import { contactFailure, SEND_FAILED, waitMinutes } from '@/features/contact/contact-errors'
import { ApiError, GENERIC_ERROR_DETAIL } from '@/lib/api/errors'

// Where each answer of the contact form's error table goes (content digest §9.2, §12): the three
// contact codes come with `attr: null` and are placed by code (the subject's under the subject,
// the channel's under e-mail and phone); every other field error goes by its `attr`, several at
// once; a stale subject list is read again; a 429 waits `retry_after`; anything the visitor
// cannot fix is one alert.

function apiError(status: number, errors: { code: string; detail: string; attr: string | null }[]) {
  return ApiError.fromBody(status, {
    msg: 'درخواست ارسالی معتبر نیست.',
    code: status,
    data: { type: errors[0]?.attr ? 'validation_error' : 'client_error', errors },
  })
}

const SUBJECT_REQUIRED = {
  code: 'contact_subject_required',
  detail: 'موضوع پیام را انتخاب کنید.',
  attr: null,
}
const SUBJECT_UNAVAILABLE = {
  code: 'contact_subject_unavailable',
  detail: 'این موضوع دیگر در فهرست نیست؛ صفحه را تازه کنید و موضوع دیگری انتخاب کنید.',
  attr: null,
}
const CHANNEL = {
  code: 'contact_channel_required',
  detail: 'ایمیل یا شمارهٔ موبایل خود را بنویسید تا پاسخ به دستتان برسد.',
  attr: null,
}
const MOBILE = {
  code: 'invalid_iranian_mobile',
  detail: 'شمارهٔ موبایل ایران را وارد کنید؛ تلفن ثابت و شمارهٔ خارجی پذیرفته نمی\u{200C}شود.',
  attr: 'phone',
}

const withSelect = { withSubject: true }
const withoutSelect = { withSubject: false }

describe('the contact codes (attr: null), placed by code', () => {
  it('contact_channel_required goes under e-mail and phone', () => {
    expect(contactFailure(apiError(400, [CHANNEL]), withSelect)).toEqual({
      errors: { channel: CHANNEL.detail },
      staleSubjects: false,
      waitSeconds: null,
    })
  })

  it('contact_subject_required under the subject: stale only when the form had no select', () => {
    expect(contactFailure(apiError(400, [SUBJECT_REQUIRED]), withSelect)).toEqual({
      errors: { subject: SUBJECT_REQUIRED.detail },
      staleSubjects: false,
      waitSeconds: null,
    })
    expect(contactFailure(apiError(400, [SUBJECT_REQUIRED]), withoutSelect).staleSubjects).toBe(
      true,
    )
  })

  it('contact_subject_unavailable under the subject, and the list is stale', () => {
    expect(contactFailure(apiError(400, [SUBJECT_UNAVAILABLE]), withSelect)).toEqual({
      errors: { subject: SUBJECT_UNAVAILABLE.detail },
      staleSubjects: true,
      waitSeconds: null,
    })
  })
})

describe('field errors, by attr', () => {
  it('invalid_iranian_mobile under the phone', () => {
    expect(contactFailure(apiError(400, [MOBILE]), withSelect).errors).toEqual({
      phone: MOBILE.detail,
    })
  })

  it('several at once: required name and message, an invalid e-mail and subject', () => {
    const failure = contactFailure(
      apiError(400, [
        { code: 'required', detail: 'این مقدار لازم است.', attr: 'name' },
        { code: 'min_length', detail: 'متن پیام دست\u{200C}کم ۱۰ نویسه باشد.', attr: 'message' },
        { code: 'invalid', detail: 'پست الکترونیکی صحیح وارد کنید.', attr: 'email' },
        { code: 'invalid', detail: 'یک مقدار عددی معتبر لازم است.', attr: 'subject' },
      ]),
      withSelect,
    )
    expect(failure.errors).toEqual({
      name: 'این مقدار لازم است.',
      message: 'متن پیام دست\u{200C}کم ۱۰ نویسه باشد.',
      email: 'پست الکترونیکی صحیح وارد کنید.',
      subject: 'یک مقدار عددی معتبر لازم است.',
    })
  })
})

describe('what the visitor cannot fix: one alert', () => {
  it.each([
    [
      'parse_error',
      apiError(400, [{ code: 'parse_error', detail: 'بدنهٔ درخواست خالی است.', attr: null }]),
    ],
    [
      'the honeypot’s NUL',
      apiError(400, [{ code: 'null_characters_not_allowed', detail: 'x', attr: 'website' }]),
    ],
    ['413', apiError(413, [{ code: 'request_too_large', detail: 'x', attr: null }])],
    ['415', apiError(415, [{ code: 'unsupported_media_type', detail: 'x', attr: null }])],
    ['405', apiError(405, [{ code: 'method_not_allowed', detail: 'x', attr: null }])],
  ])('%s: the generic sentence', (_label, error) => {
    expect(contactFailure(error, withSelect)).toEqual({
      errors: { form: GENERIC_ERROR_DETAIL },
      staleSubjects: false,
      waitSeconds: null,
    })
  })

  it.each([
    ['no connection', ApiError.network()],
    ['a 502 from the BFF', new ApiError({ status: 502, code: 'network_error' })],
    ['not the API', new TypeError('x')],
  ])('%s: «ارسال نشد…»', (_label, error) => {
    expect(contactFailure(error, withSelect).errors).toEqual({ form: SEND_FAILED })
  })
})

describe('the throttle (10 kept messages an hour)', () => {
  it('waits `retry_after`, in minutes (it can be close to an hour)', () => {
    const error = ApiError.fromBody(429, {
      msg: 'x',
      code: 429,
      data: {
        type: 'client_error',
        errors: [{ code: 'throttled', detail: 'x', attr: null }],
        retry_after: 3506,
      },
    })
    const failure = contactFailure(error, withSelect)
    expect(failure.waitSeconds).toBe(3506)
    expect(failure.errors.form).toBe(
      'سقف پیام\u{200C}های این ساعت پر شده است؛ ۵۹ دقیقهٔ دیگر دوباره بفرستید.',
    )
  })

  it('counts a part of a minute as a minute, and never says 0', () => {
    expect(waitMinutes(3506)).toBe(59)
    expect(waitMinutes(61)).toBe(2)
    expect(waitMinutes(5)).toBe(1)
  })
})
