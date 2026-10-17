import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginFlow } from '@/features/auth/components/login-flow'
import { ApiError } from '@/lib/api/errors'
import type { AuthSettings } from '@/lib/api/types/settings'
import { emailOnlyAuth } from '../support/auth'
import { stubBrowserApis } from '../support/dom-stubs'
import { authProviders, everyMethodAuth } from '../support/auth-providers'

// The one-time code step (Review Focus #2): a send that fails shows the API's detail, waits
// `retry_after` before the next send, and leaves the form usable. Timers come from the API.

const mocks = vi.hoisted(() => ({
  loginOtpRequest: vi.fn(),
  loginOtpVerify: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('@/features/auth/api', () => ({
  authApi: { loginOtpRequest: mocks.loginOtpRequest, loginOtpVerify: mocks.loginOtpVerify },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))

const SENT = { otp_method: 'email', expires_in: 300, resend_after: 120 } as const

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

/** The code step for `identifier`, reached the way a visitor does. */
async function openCodeStep(
  identifier = 'sara.ahmadi@example.com',
  auth: AuthSettings = emailOnlyAuth(),
) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<LoginFlow next="" initialIdentifier={identifier} />, {
    wrapper: authProviders({ auth }).wrapper,
  })
  await user.click(screen.getByRole('button', { name: 'ادامه' }))
  await user.click(await screen.findByRole('button', { name: 'ورود با کد یکبار مصرف' }))
  await screen.findByRole('heading', { name: 'ورود با کد یکبار مصرف' })
  return user
}

const seconds = (n: number) => act(() => vi.advanceTimersByTime(n * 1000))

describe('the one-time code step', () => {
  it('a 429 on the send shows its detail and waits retry_after seconds; the form stays usable', async () => {
    const user = await openCodeStep()
    const detail = 'برای ارسال مجدد کد، ۳۰ ثانیه دیگر صبر کنید.'
    mocks.loginOtpRequest.mockRejectedValueOnce(
      new ApiError({ status: 429, code: 'auth_otp_throttled', detail, retryAfter: 30 }),
    )
    const send = screen.getByRole('button', { name: 'ارسال کد' })
    await user.click(send)
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(send).toHaveAttribute('aria-disabled', 'true')
    expect(send).toHaveAccessibleDescription(expect.stringContaining('۰۰:۳۰'))
    // A press while it waits sends nothing.
    await user.click(send)
    expect(mocks.loginOtpRequest).toHaveBeenCalledTimes(1)
    await seconds(29)
    expect(send).toHaveAttribute('aria-disabled', 'true')
    await seconds(1)
    await waitFor(() => expect(send).not.toHaveAttribute('aria-disabled'))
    // Still usable: the password is one press away.
    expect(screen.getByRole('button', { name: 'ورود با رمز عبور' })).toBeEnabled()
  })

  it('a 503 auth_otp_send_failed shows its detail and lets the visitor try again at once', async () => {
    const user = await openCodeStep()
    const detail = 'خطا در ارسال کد تأیید. لطفاً مجدد تلاش کنید.'
    mocks.loginOtpRequest
      .mockRejectedValueOnce(new ApiError({ status: 503, code: 'auth_otp_send_failed', detail }))
      .mockResolvedValueOnce(SENT)
    await user.click(screen.getByRole('button', { name: 'ارسال کد' }))
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    const send = screen.getByRole('button', { name: 'ارسال کد' })
    expect(send).not.toHaveAttribute('aria-disabled')
    await user.click(send)
    expect(await screen.findByRole('group', { name: 'کد ورود' })).toBeVisible()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('resend waits resend_after, restarts on the same value, and a failed resend asks anew', async () => {
    const user = await openCodeStep()
    mocks.loginOtpRequest.mockResolvedValue(SENT)
    await user.click(screen.getByRole('button', { name: 'ارسال کد' }))
    const resend = await screen.findByRole('button', { name: 'ارسال مجدد کد' })
    expect(resend).toHaveAttribute('aria-disabled', 'true')
    // «مرا به خاطر بسپار» comes before the boxes, which send the code once full.
    const remember = screen.getByRole('checkbox', { name: 'مرا به خاطر بسپار' })
    const boxes = screen.getByRole('group', { name: 'کد ورود' })
    expect(remember.compareDocumentPosition(boxes) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(screen.getByText(/کد تا ۰۵:۰۰ دیگر معتبر است/)).toBeVisible()
    // The ticking times are not in a live region: only the moment the wait ends is read out.
    const wait = screen.getByText(/ارسال دوباره پس از/)
    expect(wait.closest('[aria-live], [role="status"], [role="alert"]')).toBeNull()
    await seconds(60)
    expect(screen.queryByText('اکنون می‌توانید کد را دوباره بخواهید.')).toBeNull()
    await seconds(60)
    await waitFor(() => expect(resend).not.toHaveAttribute('aria-disabled'))
    const said = screen.getByText('اکنون می‌توانید کد را دوباره بخواهید.')
    expect(said.closest('[role="status"]')).not.toBeNull()

    await user.click(resend)
    await waitFor(() => expect(mocks.loginOtpRequest).toHaveBeenCalledTimes(2))
    // The same 120 s again: the wait starts over.
    const again = await screen.findByRole('button', { name: 'ارسال مجدد کد' })
    await waitFor(() => expect(again).toHaveAttribute('aria-disabled', 'true'))
    expect(again).toHaveAccessibleDescription(expect.stringContaining('۰۲:۰۰'))

    await seconds(120)
    const detail = 'خطا در ارسال کد تأیید. لطفاً مجدد تلاش کنید.'
    mocks.loginOtpRequest.mockRejectedValueOnce(
      new ApiError({ status: 503, code: 'auth_otp_send_failed', detail }),
    )
    await user.click(again)
    // The previous code is void now: ask for a new one, at once.
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(screen.queryByRole('group', { name: 'کد ورود' })).toBeNull()
    const sendAgain = screen.getByRole('button', { name: 'ارسال کد' })
    expect(sendAgain).not.toHaveAttribute('aria-disabled')
    await waitFor(() => expect(sendAgain).toHaveFocus())
  })

  it('keeps counting while the visitor is on another step, and shows what is left on return', async () => {
    const user = await openCodeStep()
    mocks.loginOtpRequest.mockResolvedValueOnce(SENT)
    await user.click(screen.getByRole('button', { name: 'ارسال کد' }))
    await screen.findByRole('group', { name: 'کد ورود' })
    await seconds(60)
    await user.click(screen.getByRole('button', { name: 'ورود با رمز عبور' }))
    await screen.findByLabelText('رمز عبور')
    await seconds(15)
    await user.click(screen.getByRole('button', { name: 'ورود با کد یکبار مصرف' }))
    expect(await screen.findByText(/کد تا ۰۳:۴۵ دیگر معتبر است/)).toBeVisible()
    expect(screen.getByText(/ارسال دوباره پس از ۰۰:۴۵/)).toBeVisible()
    expect(mocks.loginOtpRequest).toHaveBeenCalledTimes(1)
  })

  it('a 429 on a resend waits its retry_after and keeps the code field', async () => {
    const user = await openCodeStep()
    mocks.loginOtpRequest.mockResolvedValueOnce(SENT)
    await user.click(screen.getByRole('button', { name: 'ارسال کد' }))
    // The answer is in (the boxes show) before the clock moves on.
    await screen.findByRole('group', { name: 'کد ورود' })
    await seconds(120)
    const detail = 'تعداد درخواست‌های امروز به سقف رسیده است.'
    mocks.loginOtpRequest.mockRejectedValueOnce(
      new ApiError({ status: 429, code: 'auth_otp_daily_limit', detail, retryAfter: 3600 }),
    )
    const resend = await screen.findByRole('button', { name: 'ارسال مجدد کد' })
    await waitFor(() => expect(resend).not.toHaveAttribute('aria-disabled'))
    await user.click(resend)
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(resend).toHaveAttribute('aria-disabled', 'true')
    expect(resend).toHaveAccessibleDescription(expect.stringContaining('۶۰:۰۰'))
    expect(screen.getByRole('group', { name: 'کد ورود' })).toBeVisible()
  })

  it('offers a phone the channels the settings have, preselecting the default', async () => {
    const user = await openCodeStep('09121234501', everyMethodAuth())
    const channels = screen.getByRole('radiogroup', { name: 'روش دریافت کد' })
    expect(
      within(channels)
        .getAllByRole('radio')
        .map((radio) => radio.textContent),
    ).toHaveLength(2)
    expect(within(channels).getByRole('radio', { name: 'تلگرام' })).toBeChecked()
    await user.click(within(channels).getByRole('radio', { name: 'پیامک' }))
    mocks.loginOtpRequest.mockResolvedValueOnce({ ...SENT, otp_method: 'sms' })
    await user.click(screen.getByRole('button', { name: 'ارسال کد' }))
    expect(mocks.loginOtpRequest).toHaveBeenCalledWith({
      login_method: 'phone',
      login_identifier: '09121234501',
      otp_method: 'sms',
    })
  })

  it('a wrong code is cleared, so retyping sends it once; too many tries waits retry_after', async () => {
    const user = await openCodeStep()
    mocks.loginOtpRequest.mockResolvedValueOnce(SENT)
    await user.click(screen.getByRole('button', { name: 'ارسال کد' }))
    await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
    mocks.loginOtpVerify.mockRejectedValueOnce(
      new ApiError({ status: 400, code: 'auth_otp_invalid', detail: 'کد تأیید نامعتبر است.' }),
    )
    await user.keyboard('111111')
    const group = screen.getByRole('group', { name: 'کد ورود' })
    await waitFor(() => expect(group).toHaveAccessibleDescription('کد تأیید نامعتبر است.'))
    // Empty again, from the first box: six new digits are one more try, not six.
    expect(screen.getByLabelText('رقم ۶')).toHaveValue('')
    await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())

    mocks.loginOtpVerify.mockRejectedValueOnce(
      new ApiError({
        status: 429,
        code: 'auth_otp_too_many_attempts',
        detail: 'تلاش‌های ناموفق زیاد بود.',
        retryAfter: 45,
      }),
    )
    await user.keyboard('222222')
    expect(await screen.findByRole('alert')).toHaveTextContent('تلاش‌های ناموفق زیاد بود.')
    expect(mocks.loginOtpVerify).toHaveBeenCalledTimes(2)
    expect(mocks.loginOtpVerify).toHaveBeenLastCalledWith(
      expect.objectContaining({ otp_code: '222222' }),
    )
    const send = screen.getByRole('button', { name: 'ارسال کد' })
    expect(send).toHaveAttribute('aria-disabled', 'true')
    expect(send).toHaveAccessibleDescription(expect.stringContaining('۰۰:۴۵'))
    // The code form is gone; the focus goes to the step's main control, not to the page.
    await waitFor(() => expect(send).toHaveFocus())
  })
})
