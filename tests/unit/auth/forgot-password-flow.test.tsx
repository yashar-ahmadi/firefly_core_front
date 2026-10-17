import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ForgotPasswordFlow } from '@/features/auth/components/forgot-password-flow'
import { ApiError } from '@/lib/api/errors'
import type { AuthSettings } from '@/lib/api/types/settings'
import { emailOnlyAuth } from '../support/auth'
import { authProviders, everyMethodAuth } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'

// Password recovery (auth digest F7): the identifier, the channel when there is a choice, the
// code, then the new password; no tokens come back, so the visitor signs in again.

const mocks = vi.hoisted(() => ({
  passwordResetRequest: vi.fn(),
  passwordResetVerifyOtp: vi.fn(),
  passwordResetConfirm: vi.fn(),
  notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
  router: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('@/features/auth/api', () => ({
  authApi: {
    passwordResetRequest: mocks.passwordResetRequest,
    passwordResetVerifyOtp: mocks.passwordResetVerifyOtp,
    passwordResetConfirm: mocks.passwordResetConfirm,
  },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({ toastRegionReady: () => false, notify: mocks.notify }))

const EMAIL = 'sara.ahmadi@example.com'
const SENT = { otp_method: 'email', expires_in: 300, resend_after: 120 } as const
const RESET = { reset_token: 'reset-token-1', expires_in: 600 }

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

const seconds = (n: number) => act(() => vi.advanceTimersByTime(n * 1000))

function renderFlow({
  identifier = '',
  next = '',
  auth = emailOnlyAuth(),
}: { identifier?: string; next?: string; auth?: AuthSettings } = {}) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<ForgotPasswordFlow next={next} initialIdentifier={identifier} />, {
    wrapper: authProviders({ auth }).wrapper,
  })
  return user
}

type User = ReturnType<typeof userEvent.setup>

/** The new-password step for sara, reached the way a visitor does. */
async function toPasswordStep(user: User) {
  mocks.passwordResetRequest.mockResolvedValueOnce(SENT)
  await user.click(screen.getByRole('button', { name: 'ارسال کد بازیابی' }))
  await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
  mocks.passwordResetVerifyOtp.mockResolvedValueOnce(RESET)
  await user.keyboard('123456')
  const password = await screen.findByLabelText('رمز عبور جدید')
  await waitFor(() => expect(password).toHaveFocus())
  await user.type(password, 'Firefly@5678')
  await user.type(screen.getByLabelText('تکرار رمز عبور جدید'), 'Firefly@5678')
  return password
}

describe('ForgotPasswordFlow', () => {
  it('identifier → code → new password, then «دوباره وارد شوید» on /login/, prefilled', async () => {
    const user = renderFlow({ identifier: EMAIL, next: '/cart/' })
    const field = screen.getByRole('textbox', { name: 'ایمیل یا شماره موبایل' })
    expect(field).toHaveValue(EMAIL)
    expect(field).toHaveAttribute('autocomplete', 'username')
    // One channel for an email address: no choice to make, the code goes at once.
    expect(screen.queryByRole('radiogroup')).toBeNull()
    await toPasswordStep(user)
    expect(mocks.passwordResetRequest).toHaveBeenCalledWith({
      reset_method: 'email',
      login_identifier: EMAIL,
    })
    expect(mocks.passwordResetVerifyOtp).toHaveBeenCalledWith({
      reset_method: 'email',
      login_identifier: EMAIL,
      otp_code: '123456',
    })
    expect(screen.getByLabelText('رمز عبور جدید')).toHaveAttribute('autocomplete', 'new-password')

    mocks.passwordResetConfirm.mockResolvedValueOnce({})
    await user.click(screen.getByRole('button', { name: 'تغییر رمز عبور' }))
    expect(mocks.passwordResetConfirm).toHaveBeenCalledWith({
      reset_token: 'reset-token-1',
      password: 'Firefly@5678',
      confirm_password: 'Firefly@5678',
    })
    await waitFor(() =>
      expect(mocks.router.replace).toHaveBeenCalledWith(
        '/login/?identifier=sara.ahmadi%40example.com&next=%2Fcart%2F',
      ),
    )
    expect(mocks.notify.success).toHaveBeenCalledWith('رمز عبور تغییر کرد؛ دوباره وارد شوید')
  })

  it('an unknown identifier: the API says so (it does on purpose), with registration offered', async () => {
    const user = renderFlow({ identifier: 'nobody@example.com' })
    const detail = 'کاربری با این ایمیل یافت نشد.'
    mocks.passwordResetRequest.mockRejectedValueOnce(
      new ApiError({ status: 404, code: 'auth_user_not_found', detail }),
    )
    const send = screen.getByRole('button', { name: 'ارسال کد بازیابی' })
    await user.click(send)
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(send).toHaveFocus()
    expect(screen.getByRole('link', { name: /ثبت‌نام/ })).toHaveAttribute(
      'href',
      '/register/?identifier=nobody%40example.com',
    )
    expect(screen.queryByRole('group', { name: 'کد بازیابی' })).toBeNull()
  })

  it('offers the channel when the number can take more than one, and verifies by it', async () => {
    const user = renderFlow({ auth: everyMethodAuth() })
    const field = screen.getByRole('textbox', { name: 'ایمیل یا شماره موبایل' })
    await user.type(field, 'sara@example.com')
    expect(screen.queryByRole('radiogroup')).toBeNull()
    await user.clear(field)
    await user.type(field, '۰۹۱۲۱۲۳۴۵۰۱')
    expect(screen.getByRole('radio', { name: 'تلگرام' })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: 'پیامک' }))
    mocks.passwordResetRequest.mockResolvedValueOnce({ ...SENT, otp_method: 'sms' })
    await user.click(screen.getByRole('button', { name: 'ارسال کد بازیابی' }))
    expect(mocks.passwordResetRequest).toHaveBeenCalledWith({
      reset_method: 'sms',
      login_identifier: '09121234501',
    })
    await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
    // Choosing Telegram now changes the next send, not the code already sent by SMS.
    await user.click(screen.getByRole('radio', { name: 'تلگرام' }))
    await user.click(screen.getByLabelText('رقم ۱'))
    mocks.passwordResetVerifyOtp.mockResolvedValueOnce(RESET)
    await user.keyboard('123456')
    await waitFor(() =>
      expect(mocks.passwordResetVerifyOtp).toHaveBeenCalledWith({
        reset_method: 'sms',
        login_identifier: '09121234501',
        otp_code: '123456',
      }),
    )
  })

  it('a weak or unchanged password is shown under the field, and the same token is tried again', async () => {
    const user = renderFlow({ identifier: EMAIL })
    const password = await toPasswordStep(user)
    const detail = 'رمز عبور جدید نباید با رمز عبور فعلی یکسان باشد.'
    mocks.passwordResetConfirm
      .mockRejectedValueOnce(new ApiError({ status: 400, code: 'auth_password_unchanged', detail }))
      .mockResolvedValueOnce({})
    await user.click(screen.getByRole('button', { name: 'تغییر رمز عبور' }))
    await waitFor(() => expect(password).toHaveFocus())
    expect(password).toHaveAccessibleDescription(expect.stringContaining(detail))
    await user.type(password, '9')
    await user.type(screen.getByLabelText('تکرار رمز عبور جدید'), '9')
    await user.click(screen.getByRole('button', { name: 'تغییر رمز عبور' }))
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalled())
    expect(mocks.passwordResetConfirm).toHaveBeenLastCalledWith(
      expect.objectContaining({ reset_token: 'reset-token-1', password: 'Firefly@56789' }),
    )
  })

  it('an expired reset token starts over at the identifier, which takes the focus', async () => {
    const user = renderFlow({ identifier: EMAIL })
    await toPasswordStep(user)
    const detail = 'زمان بازیابی رمز عبور به پایان رسیده است. دوباره تلاش کنید.'
    mocks.passwordResetConfirm.mockRejectedValueOnce(
      new ApiError({ status: 400, code: 'auth_token_expired', detail }),
    )
    await user.click(screen.getByRole('button', { name: 'تغییر رمز عبور' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    const field = screen.getByRole('textbox', { name: 'ایمیل یا شماره موبایل' })
    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveValue(EMAIL)
    // A new code is asked for (the old one was used up).
    mocks.passwordResetRequest.mockResolvedValueOnce(SENT)
    await seconds(120)
    await user.click(screen.getByRole('button', { name: 'ارسال کد بازیابی' }))
    expect(mocks.passwordResetRequest).toHaveBeenCalledTimes(2)
  })

  it('a 429 on the request holds «ارسال کد بازیابی» for retry_after seconds', async () => {
    const user = renderFlow({ identifier: EMAIL })
    const detail = 'تعداد درخواست‌های امروز به سقف رسیده است.'
    mocks.passwordResetRequest.mockRejectedValueOnce(
      new ApiError({ status: 429, code: 'auth_otp_daily_limit', detail, retryAfter: 30 }),
    )
    const send = screen.getByRole('button', { name: 'ارسال کد بازیابی' })
    await user.click(send)
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(send).toHaveAttribute('aria-disabled', 'true')
    expect(send).toHaveAccessibleDescription(expect.stringContaining('۰۰:۳۰'))
    await user.click(send)
    expect(mocks.passwordResetRequest).toHaveBeenCalledTimes(1)
    await seconds(30)
    await waitFor(() => expect(send).not.toHaveAttribute('aria-disabled'))
  })

  it('checks the identifier before any request', async () => {
    const user = renderFlow()
    await user.click(screen.getByRole('button', { name: 'ارسال کد بازیابی' }))
    const field = screen.getByRole('textbox', { name: 'ایمیل یا شماره موبایل' })
    await waitFor(() => expect(field).toHaveFocus())
    expect(field).toHaveAccessibleDescription(
      expect.stringContaining('ایمیل یا شماره موبایل را وارد کنید.'),
    )
    // A mobile number on the dev settings: no SMS and no Telegram to send a code by.
    await user.type(field, '09121234501')
    await user.click(screen.getByRole('button', { name: 'ارسال کد بازیابی' }))
    expect(field).toHaveAccessibleDescription(expect.stringContaining('با شماره موبایل'))
    expect(mocks.passwordResetRequest).not.toHaveBeenCalled()
  })
})
