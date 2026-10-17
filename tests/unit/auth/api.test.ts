import { beforeEach, describe, expect, it, vi } from 'vitest'
import { authApi } from '@/features/auth/api'
import { ApiError } from '@/lib/api/errors'
import { SARA } from './fixtures'

const bff = vi.hoisted(() => ({ fetch: vi.fn() }))
vi.mock('@/lib/api/client', () => ({ bffFetch: bff.fetch }))

const OTP_SENT = { otp_method: 'email', expires_in: 300, resend_after: 120 } as const
const SIGNED_IN = { user: SARA, requires_totp: false, remember_me: true }

beforeEach(() => {
  bff.fetch.mockReset()
})

describe('authApi', () => {
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

  it('removes the avatar with a JSON null (no multipart without a file)', async () => {
    bff.fetch.mockResolvedValue({ data: SARA, msg: '', status: 200 })
    await authApi.updateMe({ avatar_picture: null })
    const [path, init] = bff.fetch.mock.calls[0]!
    expect(path).toBe('account/profile/me/')
    expect(init).toEqual({ method: 'PATCH', body: { avatar_picture: null } })
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
