import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginFlow } from '@/features/auth/components/login-flow'
import { ApiError } from '@/lib/api/errors'
import { stubBrowserApis } from '../support/dom-stubs'
import { handedByClick, resetHandoff } from '../support/handoff'
import { authProviders, everyMethodAuth } from '../support/auth-providers'
import { cart, result } from '../cart/support'
import { SARA } from './fixtures'

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    login: vi.fn(),
    loginOtpRequest: vi.fn(),
    loginOtpVerify: vi.fn(),
    google: vi.fn(),
    bffFetch: vi.fn(),
    replace,
    router: { replace, push: vi.fn() },
  }
})
vi.mock('@/features/auth/api', () => ({
  authApi: {
    login: mocks.login,
    loginOtpRequest: mocks.loginOtpRequest,
    loginOtpVerify: mocks.loginOtpVerify,
    google: mocks.google,
  },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))

const EMAIL = 'sara.ahmadi@example.com'
const SIGNED_IN = { user: SARA, requires_totp: false, remember_me: false }
const TOTP_CHALLENGE = { user: null, requires_totp: true, remember_me: false }
const SENT = { otp_method: 'email', expires_in: 300, resend_after: 120 }

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  resetHandoff()
  mocks.bffFetch.mockResolvedValue(result(cart()))
})

function renderFlow(identifier = '', options: Parameters<typeof authProviders>[0] = {}) {
  const user = userEvent.setup()
  render(<LoginFlow next="" initialIdentifier={identifier} />, {
    wrapper: authProviders(options).wrapper,
  })
  return user
}

const REGISTRATION_OFF = {
  registration: { key: 'registration', name: 'ثبت نام', enabled: false, reason: null },
} as const

async function toPasswordStep(user: ReturnType<typeof userEvent.setup>, identifier = EMAIL) {
  await user.type(screen.getByLabelText('ایمیل یا شمارهٔ موبایل'), identifier)
  await user.click(screen.getByRole('button', { name: 'ادامه' }))
  return screen.findByLabelText('رمز عبور')
}

describe('LoginFlow', () => {
  it('a password login that needs 2FA moves to the TOTP step and re-sends the same body', async () => {
    const user = renderFlow()
    await user.type(await toPasswordStep(user), 'Firefly@1234')
    await user.click(screen.getByLabelText('مرا به خاطر بسپار'))
    mocks.login.mockResolvedValueOnce(TOTP_CHALLENGE).mockResolvedValueOnce(SIGNED_IN)
    await user.click(screen.getByRole('button', { name: 'ورود' }))

    expect(await screen.findByRole('heading', { name: 'تأیید دومرحله‌ای' })).toBeVisible()
    const body = {
      login_method: 'email',
      login_identifier: EMAIL,
      password: 'Firefly@1234',
      remember_me: true,
    }
    expect(mocks.login).toHaveBeenLastCalledWith(body)
    // The first box has the focus: typing the six digits sends them.
    await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
    await user.keyboard('۱۲۳۴۵۶')
    await waitFor(() => expect(mocks.login).toHaveBeenCalledTimes(2))
    expect(mocks.login).toHaveBeenLastCalledWith({ ...body, totp_code: '123456' })
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/account/'))
  })

  it('an OTP login that needs 2FA re-sends the same otp_code with the totp_code', async () => {
    const user = renderFlow()
    await toPasswordStep(user)
    await user.click(screen.getByRole('button', { name: 'ورود با کد یکبار مصرف' }))
    mocks.loginOtpRequest.mockResolvedValueOnce(SENT)
    await user.click(await screen.findByRole('button', { name: 'ارسال کد' }))
    expect(mocks.loginOtpRequest).toHaveBeenCalledWith({
      login_method: 'email',
      login_identifier: EMAIL,
      otp_method: 'email',
    })

    mocks.loginOtpVerify.mockResolvedValueOnce(TOTP_CHALLENGE).mockResolvedValueOnce(SIGNED_IN)
    await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
    await user.keyboard('654321')
    expect(await screen.findByRole('heading', { name: 'تأیید دومرحله‌ای' })).toBeVisible()
    const body = {
      login_method: 'email',
      login_identifier: EMAIL,
      otp_code: '654321',
      remember_me: false,
    }
    expect(mocks.loginOtpVerify).toHaveBeenLastCalledWith(body)
    await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
    await user.keyboard('123456')
    await waitFor(() =>
      expect(mocks.loginOtpVerify).toHaveBeenLastCalledWith({ ...body, totp_code: '123456' }),
    )
    await waitFor(() => expect(mocks.replace).toHaveBeenCalledWith('/account/'))
  })

  it('shows auth_invalid_credentials under the password field', async () => {
    const user = renderFlow()
    await user.type(await toPasswordStep(user), 'wrong')
    const detail = 'ایمیل/شماره تلفن یا رمز عبور اشتباه است.'
    mocks.login.mockRejectedValueOnce(
      new ApiError({ status: 401, code: 'auth_invalid_credentials', detail }),
    )
    await user.click(screen.getByRole('button', { name: 'ورود' }))
    const password = screen.getByLabelText('رمز عبور')
    await waitFor(() => expect(password).toHaveAttribute('aria-invalid', 'true'))
    expect(password).toHaveAccessibleDescription(detail)
    expect(mocks.replace).not.toHaveBeenCalled()
  })

  it('shows auth_identifier_invalid (attr null) under the identifier field', async () => {
    const user = renderFlow()
    await user.type(await toPasswordStep(user, 'sara@example.c'), 'Firefly@1234')
    const detail = 'فرمت ایمیل نامعتبر است.'
    mocks.login.mockRejectedValueOnce(
      new ApiError({
        status: 400,
        errors: [{ code: 'auth_identifier_invalid', detail, attr: null }],
      }),
    )
    await user.click(screen.getByRole('button', { name: 'ورود' }))
    const field = await screen.findByLabelText('ایمیل یا شمارهٔ موبایل')
    await waitFor(() => expect(field).toHaveAccessibleDescription(expect.stringContaining(detail)))
    expect(field).toHaveValue('sara@example.c')
  })

  it('keeps what was typed when going back and forth between the steps', async () => {
    const user = renderFlow()
    await user.type(await toPasswordStep(user), 'Firefly@1234')
    await user.click(screen.getByRole('button', { name: /تغییر/ }))
    const field = await screen.findByLabelText('ایمیل یا شمارهٔ موبایل')
    expect(field).toHaveValue(EMAIL)
    await waitFor(() => expect(field).toHaveFocus())
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    expect(await screen.findByLabelText('رمز عبور')).toHaveValue('Firefly@1234')
    await user.click(screen.getByRole('button', { name: 'ورود با کد یکبار مصرف' }))
    await user.click(await screen.findByRole('button', { name: 'ورود با رمز عبور' }))
    expect(await screen.findByLabelText('رمز عبور')).toHaveValue('Firefly@1234')
  })

  it('checks the identifier before any request, and accepts a mobile in Persian digits', async () => {
    const user = renderFlow()
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    const field = screen.getByLabelText('ایمیل یا شمارهٔ موبایل')
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining('ایمیل یا شمارهٔ موبایل را وارد کنید.'),
    )
    await user.type(field, 'sara')
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    expect(field).toHaveAccessibleDescription(expect.stringContaining('درست وارد کنید'))
    await user.clear(field)
    // A phone on the dev settings: password only (no SMS, no Telegram, so no code link).
    await user.type(await toPasswordStep(user, '۰۹۱۲۱۲۳۴۵۰۱'), 'Firefly@1234')
    expect(screen.queryByRole('button', { name: 'ورود با کد یکبار مصرف' })).toBeNull()
    mocks.login.mockResolvedValueOnce(SIGNED_IN)
    await user.click(screen.getByRole('button', { name: 'ورود' }))
    await waitFor(() =>
      expect(mocks.login).toHaveBeenCalledWith(
        expect.objectContaining({ login_method: 'phone', login_identifier: '09121234501' }),
      ),
    )
  })

  it('offers registration, with the identifier, when no account has it', async () => {
    const user = renderFlow('nobody@example.com')
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    await user.click(await screen.findByRole('button', { name: 'ورود با کد یکبار مصرف' }))
    mocks.loginOtpRequest.mockRejectedValueOnce(
      new ApiError({
        status: 404,
        code: 'auth_user_not_found',
        detail: 'کاربری با این ایمیل یافت نشد.',
      }),
    )
    await user.click(await screen.findByRole('button', { name: 'ارسال کد' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('کاربری با این ایمیل یافت نشد.')
    // The identifier goes with the link (handed over), never in its URL.
    const register = screen.getByRole('link', { name: /ثبت‌نام/ })
    expect(register).toHaveAttribute('href', '/register/')
    expect(await handedByClick(register, '/register/')).toBe('nobody@example.com')
  })

  it.each([
    ['registration is switched off', 'nobody@example.com', { features: REGISTRATION_OFF }],
    [
      'the settings register no phone numbers',
      '09121234599',
      { auth: { ...everyMethodAuth(), registration_methods: ['email' as const] } },
    ],
  ])('offers no registration when %s', async (_case, identifier, options) => {
    const user = renderFlow(identifier, options)
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    await user.click(await screen.findByRole('button', { name: 'ورود با کد یکبار مصرف' }))
    mocks.loginOtpRequest.mockRejectedValueOnce(
      new ApiError({ status: 404, code: 'auth_user_not_found', detail: 'کاربری یافت نشد.' }),
    )
    await user.click(await screen.findByRole('button', { name: 'ارسال کد' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('کاربری یافت نشد.')
    expect(screen.queryByRole('link', { name: /ثبت‌نام/ })).toBeNull()
  })
})
