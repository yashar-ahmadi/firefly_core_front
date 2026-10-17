import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ForgotPasswordFlow } from '@/features/auth/components/forgot-password-flow'
import { RegisterFlow } from '@/features/auth/components/register-flow'
import { ApiError } from '@/lib/api/errors'
import { toPersianDigits } from '@/lib/format'
import { cart, result } from '../cart/support'
import { authProviders, everyMethodAuth } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'

// The code step of registration and recovery: a wrong code is typed again from scratch (the
// boxes empty, the first one focused), and a resend goes by the channel chosen since.

const mocks = vi.hoisted(() => ({
  registerStart: vi.fn(),
  registerVerify: vi.fn(),
  passwordResetRequest: vi.fn(),
  passwordResetVerifyOtp: vi.fn(),
  bffFetch: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('@/features/auth/api', () => ({
  authApi: {
    registerStart: mocks.registerStart,
    registerVerify: mocks.registerVerify,
    passwordResetRequest: mocks.passwordResetRequest,
    passwordResetVerifyOtp: mocks.passwordResetVerifyOtp,
  },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))

const SENT = { otp_method: 'email', expires_in: 300, resend_after: 120 } as const
const WRONG = 'کد وارد شده نادرست است.'

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
const setup = () => userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
const boxes = () =>
  Array.from({ length: 6 }, (_, i) => screen.getByLabelText(`رقم ${toPersianDigits(i + 1)}`))

type User = ReturnType<typeof setup>

/** Types a wrong code; the boxes empty, the first takes the focus, the message is read with it. */
async function expectWrongCodeCleared(user: User, verify: ReturnType<typeof vi.fn>) {
  await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
  verify.mockRejectedValueOnce(
    new ApiError({
      status: 400,
      code: 'auth_otp_invalid',
      detail: WRONG,
      errors: [{ code: 'auth_otp_invalid', detail: WRONG, attr: 'otp_code' }],
    }),
  )
  await user.keyboard('123456')
  await waitFor(() => expect(verify).toHaveBeenCalledTimes(1))
  await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
  for (const box of boxes()) expect(box).toHaveValue('')
  expect(screen.getByText(WRONG)).toBeVisible()
  // The next code is typed afresh and sent once, whole.
  verify.mockReturnValueOnce(new Promise(() => {}))
  await user.keyboard('654321')
  await waitFor(() => expect(verify).toHaveBeenCalledTimes(2))
  expect(verify.mock.calls[1]?.[0]).toMatchObject({ otp_code: '654321' })
}

describe('the code step of registration and recovery', () => {
  it('registration: a wrong code empties the boxes and focuses the first', async () => {
    const user = setup()
    render(<RegisterFlow next="" initialIdentifier="" termsHtml={null} />, {
      wrapper: authProviders().wrapper,
    })
    await user.type(screen.getByRole('textbox', { name: 'نام' }), 'نیما')
    await user.type(screen.getByRole('textbox', { name: 'نام خانوادگی' }), 'رضایی')
    await user.type(screen.getByRole('textbox', { name: 'ایمیل' }), 'new@example.com')
    mocks.registerStart.mockResolvedValueOnce({ ...SENT, registration_token: 'token-1' })
    await user.click(screen.getByRole('button', { name: 'دریافت کد تأیید' }))
    await expectWrongCodeCleared(user, mocks.registerVerify)
  })

  it('recovery: a wrong code empties the boxes and focuses the first', async () => {
    const user = setup()
    render(<ForgotPasswordFlow next="" initialIdentifier="sara.ahmadi@example.com" />, {
      wrapper: authProviders().wrapper,
    })
    mocks.passwordResetRequest.mockResolvedValueOnce(SENT)
    await user.click(screen.getByRole('button', { name: 'ارسال کد بازیابی' }))
    await expectWrongCodeCleared(user, mocks.passwordResetVerifyOtp)
  })

  it('recovery: a resend after a channel switch goes by the new channel, and is checked by it', async () => {
    const user = setup()
    render(<ForgotPasswordFlow next="" initialIdentifier="09121234501" />, {
      wrapper: authProviders({ auth: everyMethodAuth() }).wrapper,
    })
    // `default_otp_methods.phone` is Telegram.
    mocks.passwordResetRequest.mockResolvedValueOnce({ ...SENT, otp_method: 'telegram' })
    await user.click(screen.getByRole('button', { name: 'ارسال کد بازیابی' }))
    expect(await screen.findByText('کد ۶ رقمی در تلگرامِ این شماره فرستاده شد.')).toBeVisible()

    await seconds(120)
    await user.click(screen.getByRole('radio', { name: 'پیامک' }))
    mocks.passwordResetRequest.mockResolvedValueOnce({ ...SENT, otp_method: 'sms' })
    await user.click(screen.getByRole('button', { name: 'ارسال مجدد کد' }))
    expect(mocks.passwordResetRequest).toHaveBeenLastCalledWith({
      reset_method: 'sms',
      login_identifier: '09121234501',
    })
    expect(await screen.findByText('کد ۶ رقمی با پیامک به این شماره فرستاده شد.')).toBeVisible()

    await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
    mocks.passwordResetVerifyOtp.mockReturnValueOnce(new Promise(() => {}))
    await user.keyboard('123456')
    await waitFor(() =>
      expect(mocks.passwordResetVerifyOtp).toHaveBeenCalledWith({
        reset_method: 'sms',
        login_identifier: '09121234501',
        otp_code: '123456',
      }),
    )
  })
})
