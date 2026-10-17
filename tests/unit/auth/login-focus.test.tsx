import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { LoginFlow } from '@/features/auth/components/login-flow'
import { ApiError } from '@/lib/api/errors'
import { authProviders } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'

// Where the focus goes after each kind of failure: to the field in error; to the step's first
// field when the failure changes the step; and never to the page itself (the button that was
// pressed keeps it, or the step's main control takes it when its form is gone).

const mocks = vi.hoisted(() => ({
  login: vi.fn(),
  loginOtpRequest: vi.fn(),
  loginOtpVerify: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('@/features/auth/api', () => ({
  authApi: {
    login: mocks.login,
    loginOtpRequest: mocks.loginOtpRequest,
    loginOtpVerify: mocks.loginOtpVerify,
  },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))

const TOTP_CHALLENGE = { user: null, requires_totp: true, remember_me: false }
const SENT = { otp_method: 'email', expires_in: 300, resend_after: 120 }

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
})

function renderFlow(identifier = 'sara.ahmadi@example.com') {
  const user = userEvent.setup()
  render(<LoginFlow next="" initialIdentifier={identifier} />, {
    wrapper: authProviders().wrapper,
  })
  return user
}

async function passwordStep(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'ادامه' }))
  const password = await screen.findByLabelText('رمز عبور')
  await user.type(password, 'Firefly@1234')
  return password
}

const fail = (status: number, code: string, detail = 'خطا.') =>
  new ApiError({ status, code, detail })

describe('focus after a failure', () => {
  it('a check before any request: the identifier field', async () => {
    const user = renderFlow('')
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    await waitFor(() => expect(screen.getByLabelText('ایمیل یا شماره موبایل')).toHaveFocus())
  })

  it('a wrong password: the password field', async () => {
    const user = renderFlow()
    const password = await passwordStep(user)
    mocks.login.mockRejectedValueOnce(fail(401, 'auth_invalid_credentials'))
    await user.click(screen.getByRole('button', { name: 'ورود' }))
    await waitFor(() => expect(password).toHaveFocus())
  })

  it('an identifier the API refuses: back on step 1, its field', async () => {
    const user = renderFlow('sara@example.c')
    await passwordStep(user)
    mocks.login.mockRejectedValueOnce(fail(400, 'auth_identifier_invalid'))
    await user.click(screen.getByRole('button', { name: 'ورود' }))
    await waitFor(() => expect(screen.getByLabelText('ایمیل یا شماره موبایل')).toHaveFocus())
  })

  it('a notice for the step (a disabled account): the pressed button keeps it', async () => {
    const user = renderFlow()
    await passwordStep(user)
    mocks.login.mockRejectedValueOnce(fail(403, 'auth_account_disabled', 'حساب غیرفعال است.'))
    const submit = screen.getByRole('button', { name: 'ورود' })
    await user.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent('حساب غیرفعال است.')
    expect(submit).toHaveFocus()
  })

  it('a failed first send: «ارسال کد» keeps it', async () => {
    const user = renderFlow()
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    await user.click(await screen.findByRole('button', { name: 'ورود با کد یکبار مصرف' }))
    mocks.loginOtpRequest.mockRejectedValueOnce(fail(503, 'auth_otp_send_failed'))
    const send = await screen.findByRole('button', { name: 'ارسال کد' })
    await user.click(send)
    await screen.findByRole('alert')
    expect(send).toHaveFocus()
  })

  it('a wrong one-time code: the first box', async () => {
    const user = renderFlow()
    await user.click(screen.getByRole('button', { name: 'ادامه' }))
    await user.click(await screen.findByRole('button', { name: 'ورود با کد یکبار مصرف' }))
    mocks.loginOtpRequest.mockResolvedValueOnce(SENT)
    await user.click(await screen.findByRole('button', { name: 'ارسال کد' }))
    await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
    mocks.loginOtpVerify.mockRejectedValueOnce(fail(400, 'auth_otp_invalid'))
    await user.keyboard('111111')
    await waitFor(() =>
      expect(screen.getByRole('group', { name: 'کد ورود' })).toHaveAccessibleDescription('خطا.'),
    )
    expect(screen.getByLabelText('رقم ۱')).toHaveFocus()
  })

  it('a wrong TOTP code: the first box; a dead first step: back to its field', async () => {
    const user = renderFlow()
    await passwordStep(user)
    mocks.login
      .mockResolvedValueOnce(TOTP_CHALLENGE)
      .mockRejectedValueOnce(fail(400, 'auth_totp_invalid'))
      .mockRejectedValueOnce(fail(403, 'auth_account_disabled', 'حساب غیرفعال است.'))
    await user.click(screen.getByRole('button', { name: 'ورود' }))
    await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
    await user.keyboard('111111')
    await waitFor(() =>
      expect(
        screen.getByRole('group', { name: 'کد برنامهٔ احراز هویت' }),
      ).toHaveAccessibleDescription(expect.stringContaining('خطا.')),
    )
    expect(screen.getByLabelText('رقم ۱')).toHaveFocus()
    await user.keyboard('222222')
    expect(await screen.findByRole('alert')).toHaveTextContent('حساب غیرفعال است.')
    await waitFor(() => expect(screen.getByLabelText('رمز عبور')).toHaveFocus())
  })
})
