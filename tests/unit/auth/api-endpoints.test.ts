import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '@/features/auth/api'

const bff = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: bff.fetch }))

beforeEach(() => {
  bff.fetch.mockReset()
})

/** auth-settings.md §4.1–4.19 (and the §12 index), written out by hand: every one is reached. */
const SECTION_4_ENDPOINTS = [
  'POST account/auth/register/start/',
  'POST account/auth/register/verify/',
  'POST account/auth/register/resend-otp/',
  'POST account/auth/register/complete/',
  'POST account/auth/login/',
  'POST account/auth/login/otp/request/',
  'POST account/auth/login/otp/verify/',
  'POST account/auth/google/',
  'POST account/auth/token/refresh/',
  'POST account/auth/logout/',
  'POST account/auth/logout-all/',
  'POST account/auth/password-reset/request/',
  'POST account/auth/password-reset/verify-otp/',
  'POST account/auth/password-reset/confirm/',
  'POST account/profile/password/change/',
  'GET account/profile/me/',
  'PATCH account/profile/me/',
  'POST account/profile/contact/request/',
  'POST account/profile/contact/verify/',
  'GET account/profile/totp/status/',
  'POST account/profile/totp/setup/',
  'POST account/profile/totp/enable/',
  'POST account/profile/totp/disable/',
] as const

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

describe('authApi endpoints', () => {
  it.each(CALLS)('%s goes through the BFF to its endpoint', async (_name, call, path, init) => {
    bff.fetch.mockResolvedValue({ data: {}, msg: '', status: 200 })
    await call()
    expect(bff.fetch).toHaveBeenCalledTimes(1)
    const [sentPath, sentInit] = bff.fetch.mock.calls[0]!
    expect(sentPath).toBe(path)
    // Exactly these options (`toEqual` passes over a read's `signal: undefined`).
    expect(sentInit).toEqual(init)
  })

  it('reaches every endpoint of the auth reference (§4.1–4.19), and nothing else', async () => {
    bff.fetch.mockResolvedValue({ data: {}, msg: '', status: 200 })
    for (const [, call] of CALLS) await call()
    type Sent = [path: string, init: { method?: string; body?: unknown; formData?: unknown }]
    const reached = (bff.fetch.mock.calls as Sent[]).map(
      ([path, init]) =>
        `${init.method ?? (init.body === undefined && !init.formData ? 'GET' : 'POST')} ${path}`,
    )
    expect([...new Set(reached)].sort()).toEqual([...SECTION_4_ENDPOINTS].sort())
  })
})
