import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginFlow } from '@/features/auth/components/login-flow'
import { ApiError } from '@/lib/api/errors'
import { cart, result } from '../cart/support'
import { authProviders } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { SARA } from './fixtures'

// A 429 waits its `retry_after` before the step's main action is sent again: «ورود» after a
// throttle, «تأیید و ورود» after a TOTP lock. The time left is shown; the form stays usable.

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  loginOtpRequest: vi.fn(),
  loginOtpVerify: vi.fn(),
  bffFetch: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('@/features/auth/api', () => ({
  authApi: {
    login: mocks.login,
    loginOtpRequest: mocks.loginOtpRequest,
    loginOtpVerify: mocks.loginOtpVerify,
  },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))

const SIGNED_IN = { user: SARA, requires_totp: false, remember_me: false }

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.bffFetch.mockResolvedValue(result(cart()))
})

afterEach(() => {
  vi.useRealTimers()
})

const seconds = (n: number) => act(() => vi.advanceTimersByTime(n * 1000))

/** The code step with a code sent, its first box focused. */
async function openCodeStep() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<LoginFlow next="" initialIdentifier="sara.ahmadi@example.com" />, {
    wrapper: authProviders().wrapper,
  })
  await user.click(screen.getByRole('button', { name: 'ادامه' }))
  await user.click(await screen.findByRole('button', { name: 'ورود با کد یکبار مصرف' }))
  mocks.loginOtpRequest.mockResolvedValueOnce({
    otp_method: 'email',
    expires_in: 300,
    resend_after: 120,
  })
  await user.click(await screen.findByRole('button', { name: 'ارسال کد' }))
  return user
}

async function toPasswordStep() {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<LoginFlow next="" initialIdentifier="sara.ahmadi@example.com" />, {
    wrapper: authProviders().wrapper,
  })
  await user.click(screen.getByRole('button', { name: 'ادامه' }))
  await user.type(await screen.findByLabelText('رمز عبور'), 'Firefly@1234')
  return user
}

describe('waits after a 429', () => {
  it('a throttled password login waits retry_after before «ورود» sends again', async () => {
    const user = await toPasswordStep()
    const detail = 'درخواست محدود شد. انتظار می رود در 20 ثانیه در دسترس باشد.'
    mocks.login
      .mockRejectedValueOnce(
        new ApiError({ status: 429, code: 'throttled', detail, retryAfter: 20 }),
      )
      .mockResolvedValueOnce(SIGNED_IN)
    const submit = screen.getByRole('button', { name: 'ورود' })
    await user.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent('در ۲۰ ثانیه')
    expect(submit).toHaveAttribute('aria-disabled', 'true')
    expect(submit).toHaveAccessibleDescription(expect.stringContaining('۰۰:۲۰'))
    await user.click(submit)
    await user.keyboard('{Enter}')
    expect(mocks.login).toHaveBeenCalledTimes(1)
    // Still usable meanwhile: the password can be changed.
    await user.type(screen.getByLabelText('رمز عبور'), '!')
    await seconds(20)
    await waitFor(() => expect(submit).not.toHaveAttribute('aria-disabled'))
    await user.click(submit)
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith('/account/'))
    expect(mocks.login).toHaveBeenLastCalledWith(
      expect.objectContaining({ password: 'Firefly@1234!' }),
    )
  })

  it('a TOTP lock clears the code and sends nothing until retry_after has passed', async () => {
    const user = await toPasswordStep()
    const detail =
      'به دلیل تلاش‌های ناموفق، ورود دو مرحله‌ای موقتاً قفل شده است. ۲۴۰ ثانیه دیگر دوباره تلاش کنید.'
    mocks.login
      .mockResolvedValueOnce({ user: null, requires_totp: true, remember_me: false })
      .mockRejectedValueOnce(
        new ApiError({ status: 429, code: 'auth_totp_locked', detail, retryAfter: 240 }),
      )
      .mockResolvedValueOnce(SIGNED_IN)
    await user.click(screen.getByRole('button', { name: 'ورود' }))
    await screen.findByRole('heading', { name: 'تأیید دومرحله‌ای' })
    await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
    await user.keyboard('111111')

    const group = await screen.findByRole('group', { name: 'کد برنامهٔ احراز هویت' })
    await waitFor(() => expect(group).toHaveAccessibleDescription(expect.stringContaining(detail)))
    expect(screen.getByLabelText('رقم ۶')).toHaveValue('')
    const submit = screen.getByRole('button', { name: 'تأیید و ورود' })
    expect(submit).toHaveAttribute('aria-disabled', 'true')
    expect(submit).toHaveAccessibleDescription(expect.stringContaining('۰۴:۰۰'))
    // Six digits while locked: nothing is sent.
    await user.click(screen.getByLabelText('رقم ۱'))
    await user.keyboard('222222')
    expect(mocks.login).toHaveBeenCalledTimes(2)

    await seconds(240)
    await waitFor(() => expect(submit).not.toHaveAttribute('aria-disabled'))
    expect(screen.getByText('اکنون می‌توانید دوباره تلاش کنید.')).toBeInTheDocument()
    await user.click(submit)
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith('/account/'))
    expect(mocks.login).toHaveBeenLastCalledWith(expect.objectContaining({ totp_code: '222222' }))
  })

  it('a 429 on a verify waits retry_after before «تأیید و ورود», and keeps the code', async () => {
    const user = await openCodeStep()
    await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
    const detail = 'درخواست محدود شد. انتظار می رود در 15 ثانیه در دسترس باشد.'
    mocks.loginOtpVerify
      .mockRejectedValueOnce(
        new ApiError({ status: 429, code: 'throttled', detail, retryAfter: 15 }),
      )
      .mockResolvedValueOnce({ user: null, requires_totp: true, remember_me: false })
    await user.keyboard('123456')
    expect(await screen.findByRole('alert')).toHaveTextContent('در ۱۵ ثانیه')
    const submit = screen.getByRole('button', { name: 'تأیید و ورود' })
    expect(submit).toHaveAttribute('aria-disabled', 'true')
    expect(submit).toHaveAccessibleDescription(expect.stringContaining('۰۰:۱۵'))
    await user.click(submit)
    expect(mocks.loginOtpVerify).toHaveBeenCalledTimes(1)
    await seconds(15)
    await waitFor(() => expect(submit).not.toHaveAttribute('aria-disabled'))
    await user.click(submit)
    expect(await screen.findByRole('heading', { name: 'تأیید دومرحله‌ای' })).toBeVisible()
    expect(mocks.loginOtpVerify).toHaveBeenLastCalledWith(
      expect.objectContaining({ otp_code: '123456' }),
    )
  })
})
