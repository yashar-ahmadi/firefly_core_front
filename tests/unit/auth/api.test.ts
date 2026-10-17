import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '@/features/auth/api'
import { ApiError } from '@/lib/api/errors'
import type { UserProfile } from '@/lib/api/types/account'

const bff = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: bff.fetch }))

/** `GET account/profile/me/` for sara, as the live API answers it. */
const SARA: UserProfile = {
  uuid: 'a39a75e3-9c58-43f7-8a2c-3dce983629f8',
  username: 'sara.ahmadi',
  first_name: 'سارا',
  last_name: 'احمدی',
  full_name: 'سارا احمدی',
  email: 'sara.ahmadi@example.com',
  phone_number: '+989121234501',
  is_email_verified: true,
  is_phone_verified: true,
  avatar_picture: null,
  created: '2025-09-18T15:00:00+03:30',
  is_totp_enabled: false,
  has_usable_password: true,
}

const OTP_SENT = { otp_method: 'email', expires_in: 300, resend_after: 120 } as const
const SIGNED_IN = { user: SARA, requires_totp: false, remember_me: true }

beforeEach(() => {
  bff.fetch.mockReset()
})

/** Every endpoint of auth-settings.md §4: the call, and what it must send through the BFF. */
const CALLS: [name: string, call: () => Promise<unknown>, path: string, init: object][] = [
  [
    'registerStart',
    () =>
      authApi.registerStart({
        first_name: 'سارا',
        last_name: 'احمدی',
        register_method: 'email',
        email: 'sara@example.com',
      }),
    'account/auth/register/start/',
    {
      body: {
        first_name: 'سارا',
        last_name: 'احمدی',
        register_method: 'email',
        email: 'sara@example.com',
      },
    },
  ],
  [
    'registerVerify',
    () => authApi.registerVerify({ registration_token: 't', otp_code: '123456' }),
    'account/auth/register/verify/',
    { body: { registration_token: 't', otp_code: '123456' } },
  ],
  [
    'registerResendOtp',
    () => authApi.registerResendOtp({ registration_token: 't', otp_method: 'sms' }),
    'account/auth/register/resend-otp/',
    { body: { registration_token: 't', otp_method: 'sms' } },
  ],
  [
    'registerComplete',
    () =>
      authApi.registerComplete({
        registration_token: 't',
        password: 'Firefly@1234',
        confirm_password: 'Firefly@1234',
      }),
    'account/auth/register/complete/',
    {
      body: { registration_token: 't', password: 'Firefly@1234', confirm_password: 'Firefly@1234' },
    },
  ],
  [
    'login',
    () =>
      authApi.login({
        login_method: 'email',
        login_identifier: 'sara.ahmadi@example.com',
        password: 'Firefly@1234',
        remember_me: true,
        totp_code: '654321',
      }),
    'account/auth/login/',
    {
      body: {
        login_method: 'email',
        login_identifier: 'sara.ahmadi@example.com',
        password: 'Firefly@1234',
        remember_me: true,
        totp_code: '654321',
      },
    },
  ],
  [
    'loginOtpRequest',
    () =>
      authApi.loginOtpRequest({
        login_method: 'phone',
        login_identifier: '09121234501',
        otp_method: 'sms',
      }),
    'account/auth/login/otp/request/',
    { body: { login_method: 'phone', login_identifier: '09121234501', otp_method: 'sms' } },
  ],
  [
    'loginOtpVerify',
    () =>
      authApi.loginOtpVerify({
        login_method: 'email',
        login_identifier: 'a@b.co',
        otp_code: '123456',
        remember_me: false,
      }),
    'account/auth/login/otp/verify/',
    {
      body: {
        login_method: 'email',
        login_identifier: 'a@b.co',
        otp_code: '123456',
        remember_me: false,
      },
    },
  ],
  [
    'google',
    () => authApi.google({ id_token: 'gis-credential' }),
    'account/auth/google/',
    { body: { id_token: 'gis-credential' } },
  ],
  // The BFF sends the refresh cookie itself: the browser never holds a token.
  ['refresh', () => authApi.refresh(), 'account/auth/token/refresh/', { method: 'POST' }],
  ['logout', () => authApi.logout(), 'account/auth/logout/', { body: {} }],
  [
    'logout (with the push token)',
    () => authApi.logout({ registration_id: 'fcm-token' }),
    'account/auth/logout/',
    { body: { registration_id: 'fcm-token' } },
  ],
  ['logoutAll', () => authApi.logoutAll(), 'account/auth/logout-all/', { method: 'POST' }],
  [
    'passwordResetRequest',
    () => authApi.passwordResetRequest({ reset_method: 'email', login_identifier: 'a@b.co' }),
    'account/auth/password-reset/request/',
    { body: { reset_method: 'email', login_identifier: 'a@b.co' } },
  ],
  [
    'passwordResetVerifyOtp',
    () =>
      authApi.passwordResetVerifyOtp({
        reset_method: 'email',
        login_identifier: 'a@b.co',
        otp_code: '123456',
      }),
    'account/auth/password-reset/verify-otp/',
    { body: { reset_method: 'email', login_identifier: 'a@b.co', otp_code: '123456' } },
  ],
  [
    'passwordResetConfirm',
    () => authApi.passwordResetConfirm({ reset_token: 'r', password: 'p', confirm_password: 'p' }),
    'account/auth/password-reset/confirm/',
    { body: { reset_token: 'r', password: 'p', confirm_password: 'p' } },
  ],
  [
    'passwordChange',
    () => authApi.passwordChange({ password: 'n', confirm_password: 'n' }),
    'account/profile/password/change/',
    { body: { password: 'n', confirm_password: 'n' } },
  ],
  ['me', () => authApi.me(), 'account/profile/me/', {}],
  [
    'updateMe (names)',
    () => authApi.updateMe({ first_name: 'سارا' }),
    'account/profile/me/',
    { method: 'PATCH', body: { first_name: 'سارا' } },
  ],
  [
    'contactRequest',
    () =>
      authApi.contactRequest({
        contact_type: 'phone',
        phone_number: '09121234501',
        password: 'p',
        totp_code: '123456',
      }),
    'account/profile/contact/request/',
    {
      body: {
        contact_type: 'phone',
        phone_number: '09121234501',
        password: 'p',
        totp_code: '123456',
      },
    },
  ],
  [
    'contactVerify',
    () => authApi.contactVerify({ contact_type: 'email', otp_code: '123456' }),
    'account/profile/contact/verify/',
    { body: { contact_type: 'email', otp_code: '123456' } },
  ],
  ['totpStatus', () => authApi.totpStatus(), 'account/profile/totp/status/', {}],
  ['totpSetup', () => authApi.totpSetup(), 'account/profile/totp/setup/', { method: 'POST' }],
  [
    'totpEnable',
    () => authApi.totpEnable({ totp_code: '123456' }),
    'account/profile/totp/enable/',
    { body: { totp_code: '123456' } },
  ],
  [
    'totpDisable',
    () => authApi.totpDisable({ totp_code: '123456' }),
    'account/profile/totp/disable/',
    { body: { totp_code: '123456' } },
  ],
]

describe('authApi', () => {
  it.each(CALLS)('%s goes through the BFF to its endpoint', async (_name, call, path, init) => {
    bff.fetch.mockResolvedValue({ data: {}, msg: '', status: 200 })
    await call()
    expect(bff.fetch).toHaveBeenCalledTimes(1)
    const [sentPath, sentInit] = bff.fetch.mock.calls[0]!
    expect(sentPath).toBe(path)
    // Exactly these options (`toEqual` passes over a read's `signal: undefined`).
    expect(sentInit).toEqual(init)
  })

  it('covers every endpoint of the auth reference once', () => {
    const names = new Set(CALLS.map(([name]) => name.split(' ')[0]))
    expect([...names].sort()).toEqual(Object.keys(authApi).sort())
  })

  it('resolves with the data, not the envelope', async () => {
    bff.fetch.mockResolvedValue({ data: SIGNED_IN, msg: 'ورود با موفقیت انجام شد.', status: 200 })
    await expect(
      authApi.login({
        login_method: 'email',
        login_identifier: 'sara.ahmadi@example.com',
        password: 'Firefly@1234',
        remember_me: true,
      }),
    ).resolves.toEqual(SIGNED_IN)

    bff.fetch.mockResolvedValue({ data: OTP_SENT, msg: 'کد ورود ارسال شد.', status: 200 })
    await expect(
      authApi.loginOtpRequest({ login_method: 'email', login_identifier: 'a@b.co' }),
    ).resolves.toEqual(OTP_SENT)

    bff.fetch.mockResolvedValue({ data: SARA, msg: '', status: 200 })
    await expect(authApi.me()).resolves.toEqual(SARA)
  })

  it('passes a read its abort signal', async () => {
    bff.fetch.mockResolvedValue({ data: SARA, msg: '', status: 200 })
    const controller = new AbortController()
    await authApi.me({ signal: controller.signal })
    await authApi.totpStatus({ signal: controller.signal })
    for (const [, init] of bff.fetch.mock.calls) expect(init.signal).toBe(controller.signal)
  })

  it('uploads an avatar as multipart, with the names that change along', async () => {
    bff.fetch.mockResolvedValue({ data: SARA, msg: '', status: 200 })
    const avatar = new File(['png'], 'me.png', { type: 'image/png' })
    await authApi.updateMe({ first_name: 'سارا', avatar_picture: avatar })
    const [path, init] = bff.fetch.mock.calls[0]!
    expect(path).toBe('account/profile/me/')
    expect(init.method).toBe('PATCH')
    expect(init.body).toBeUndefined()
    const form = init.formData as FormData
    expect(form.get('first_name')).toBe('سارا')
    expect(form.get('avatar_picture')).toBeInstanceOf(File)
    expect([...form.keys()].sort()).toEqual(['avatar_picture', 'first_name'])
  })

  it('throws the ApiError as it comes (code, detail and retry_after kept)', async () => {
    const error = ApiError.fromBody(429, {
      msg: 'm',
      data: {
        retry_after: 87,
        errors: [{ code: 'auth_otp_throttled', detail: 'لطفاً ۸۷ ثانیه صبر کنید.', attr: null }],
      },
    })
    bff.fetch.mockRejectedValue(error)
    await expect(
      authApi.loginOtpRequest({ login_method: 'email', login_identifier: 'a@b.co' }),
    ).rejects.toBe(error)
    expect(error.retryAfter).toBe(87)
  })
})
