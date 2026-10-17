import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { RegisterScreen } from '@/features/auth/components/register-screen'
import { handOffIdentifier } from '@/features/auth/identifier-handoff'
import { ApiError } from '@/lib/api/errors'
import type { AuthSettings } from '@/lib/api/types/settings'
import { cart, result } from '../cart/support'
import { emailOnlyAuth } from '../support/auth'
import { authProviders, everyMethodAuth } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { handedByClick, resetHandoff } from '../support/handoff'

// Registration answers that send the visitor elsewhere (an identifier taken: login with it; a
// weak password: its reasons), the checks made before any request, and the focus after each.

const mocks = vi.hoisted(() => ({
  registerStart: vi.fn(),
  registerVerify: vi.fn(),
  registerComplete: vi.fn(),
  bffFetch: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('@/features/auth/api', () => ({
  authApi: {
    registerStart: mocks.registerStart,
    registerVerify: mocks.registerVerify,
    registerComplete: mocks.registerComplete,
  },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))
vi.mock('@/components/ui/toaster', () => ({
  toastRegionReady: () => false,
  notify: { info: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() },
}))

const TOKEN = 'registration-token-1'
const STARTED = { otp_method: 'email', expires_in: 300, resend_after: 120 }

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  resetHandoff()
  mocks.bffFetch.mockResolvedValue(result(cart()))
})

function renderScreen({
  auth = emailOnlyAuth(),
  identifier = '',
  next = '',
}: { auth?: AuthSettings; identifier?: string; next?: string } = {}) {
  const user = userEvent.setup()
  if (identifier) handOffIdentifier('/register/', identifier)
  render(<RegisterScreen next={next} termsHtml={null} />, {
    wrapper: authProviders({ auth }).wrapper,
  })
  return user
}

type User = ReturnType<typeof userEvent.setup>

async function submitStart(user: User, email = 'new@example.com') {
  await user.type(screen.getByRole('textbox', { name: 'نام' }), 'نیما')
  await user.type(screen.getByRole('textbox', { name: 'نام خانوادگی' }), 'رضایی')
  await user.type(screen.getByRole('textbox', { name: 'ایمیل' }), email)
  await user.click(screen.getByRole('button', { name: 'دریافت کد تأیید' }))
}

async function toCompleteStep(user: User) {
  mocks.registerStart.mockResolvedValueOnce({ ...STARTED, registration_token: TOKEN })
  await submitStart(user)
  await screen.findByRole('heading', { name: 'تأیید ایمیل' })
  await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
  mocks.registerVerify.mockResolvedValueOnce({
    registration_token: TOKEN,
    register_method: 'email',
  })
  await user.keyboard('123456')
  const password = await screen.findByLabelText('رمز عبور')
  await user.type(password, 'nima1234')
  await user.type(screen.getByLabelText('تکرار رمز عبور'), 'nima1234')
  return password
}

describe('registration answers and checks', () => {
  it('auth_email_already_exists: under the email field, with «ورود» for that email', async () => {
    const user = renderScreen({ next: '/cart/' })
    const detail = 'کاربری با این ایمیل قبلاً ثبت‌نام کرده است.'
    mocks.registerStart.mockRejectedValueOnce(
      new ApiError({ status: 400, code: 'auth_email_already_exists', detail }),
    )
    await submitStart(user, 'sara.ahmadi@example.com')
    const email = screen.getByRole('textbox', { name: 'ایمیل' })
    await waitFor(() => expect(email).toHaveAccessibleDescription(detail))
    expect(email).toHaveFocus()
    // The email goes to the login page with the link, never in its URL.
    const login = screen.getByRole('link', { name: 'ورود با همین ایمیل' })
    expect(login).toHaveAttribute('href', '/login/?next=%2Fcart%2F')
    expect(await handedByClick(login, '/login/')).toBe('sara.ahmadi@example.com')
    // Another address: the message and its link go.
    await user.type(email, 'x')
    expect(screen.queryByRole('link', { name: 'ورود با همین ایمیل' })).toBeNull()
  })

  it('auth_phone_already_exists on complete: back to the start, «ورود» with that number', async () => {
    const user = renderScreen({ auth: everyMethodAuth(), identifier: '09121234501' })
    // The mobile number handed over by login picks the phone tab.
    expect(screen.getByRole('tab', { name: 'شماره موبایل' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
    expect(screen.getByRole('textbox', { name: 'شماره موبایل' })).toHaveValue('09121234501')
    await user.type(screen.getByRole('textbox', { name: 'نام' }), 'سارا')
    await user.type(screen.getByRole('textbox', { name: 'نام خانوادگی' }), 'احمدی')
    mocks.registerStart.mockResolvedValueOnce({
      ...STARTED,
      otp_method: 'telegram',
      registration_token: TOKEN,
    })
    await user.click(screen.getByRole('button', { name: 'دریافت کد تأیید' }))
    await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
    mocks.registerVerify.mockResolvedValueOnce({
      registration_token: TOKEN,
      register_method: 'phone',
    })
    await user.keyboard('123456')
    await user.type(await screen.findByLabelText('رمز عبور'), 'Firefly@1234')
    await user.type(screen.getByLabelText('تکرار رمز عبور'), 'Firefly@1234')
    const detail = 'کاربری با این شماره تلفن قبلاً ثبت‌نام کرده است.'
    mocks.registerComplete.mockRejectedValueOnce(
      new ApiError({ status: 400, code: 'auth_phone_already_exists', detail }),
    )
    await user.click(screen.getByRole('button', { name: 'ایجاد حساب کاربری' }))
    const phone = await screen.findByRole('textbox', { name: 'شماره موبایل' })
    await waitFor(() => expect(phone).toHaveFocus())
    expect(phone).toHaveAccessibleDescription(expect.stringContaining(detail))
    const login = screen.getByRole('link', { name: 'ورود با همین شماره' })
    expect(login).toHaveAttribute('href', '/login/')
    expect(await handedByClick(login, '/login/')).toBe('09121234501')
  })

  it('auth_password_weak lists each reason under the password field', async () => {
    const user = renderScreen()
    const password = await toCompleteStep(user)
    // The hint is guidance, in words (not the colour alone), read out politely.
    const hint = screen.getByText(/قدرت رمز عبور/)
    expect(hint).toHaveTextContent('قدرت رمز عبور: متوسط')
    expect(hint.closest('[role="status"]')).toBe(hint)
    const reasons = ['این رمز عبور خیلی شبیه نام شماست.', 'این رمز عبور خیلی رایج است.']
    mocks.registerComplete.mockRejectedValueOnce(
      new ApiError({
        status: 400,
        code: 'auth_password_weak',
        detail: reasons.join(' '),
        data: { reasons },
      }),
    )
    await user.click(screen.getByRole('button', { name: 'ایجاد حساب کاربری' }))
    await waitFor(() => expect(password).toHaveAttribute('aria-invalid', 'true'))
    expect(password).toHaveFocus()
    for (const reason of reasons) {
      expect(password).toHaveAccessibleDescription(expect.stringContaining(reason))
      expect(screen.getByText(reason)).toBeVisible()
    }
    // The API's word stands alone: no hint saying otherwise next to it.
    expect(screen.queryByText(/قدرت رمز عبور/)).toBeNull()
    // A new password: the reasons go, the hint comes back, the token stays for the next try.
    await user.type(password, '!X')
    expect(screen.queryByText(reasons[0]!)).toBeNull()
    expect(screen.getByText(/قدرت رمز عبور/)).toHaveTextContent('قدرت رمز عبور: خوب')
  })

  it('checks the passwords before sending: the confirmation must match', async () => {
    const user = renderScreen()
    await toCompleteStep(user)
    const confirm = screen.getByLabelText('تکرار رمز عبور')
    await user.type(confirm, 'x')
    await user.click(screen.getByRole('button', { name: 'ایجاد حساب کاربری' }))
    await waitFor(() => expect(confirm).toHaveFocus())
    expect(confirm).toHaveAccessibleDescription('تکرار رمز عبور با رمز عبور یکسان نیست.')
    expect(mocks.registerComplete).not.toHaveBeenCalled()
  })

  it('focus: the first field in error; the first field after «تغییر», with every value kept', async () => {
    const user = renderScreen()
    await user.click(screen.getByRole('button', { name: 'دریافت کد تأیید' }))
    const first = screen.getByRole('textbox', { name: 'نام' })
    await waitFor(() => expect(first).toHaveFocus())
    expect(first).toHaveAccessibleDescription('نام را وارد کنید.')
    expect(screen.getByRole('textbox', { name: 'نام خانوادگی' })).toHaveAttribute(
      'aria-invalid',
      'true',
    )
    await user.type(first, 'نیما')
    await user.type(screen.getByRole('textbox', { name: 'نام خانوادگی' }), 'رضایی')
    await user.type(screen.getByRole('textbox', { name: 'ایمیل' }), 'new@example')
    await user.click(screen.getByRole('button', { name: 'دریافت کد تأیید' }))
    const email = screen.getByRole('textbox', { name: 'ایمیل' })
    await waitFor(() => expect(email).toHaveFocus())
    expect(email).toHaveAccessibleDescription(expect.stringContaining('ایمیل را درست وارد کنید'))
    expect(mocks.registerStart).not.toHaveBeenCalled()

    await user.type(email, '.com')
    mocks.registerStart.mockResolvedValueOnce({ ...STARTED, registration_token: TOKEN })
    await user.click(screen.getByRole('button', { name: 'دریافت کد تأیید' }))
    await screen.findByRole('heading', { name: 'تأیید ایمیل' })
    await user.click(screen.getByRole('button', { name: /تغییر/ }))
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'نام' })).toHaveFocus())
    expect(screen.getByRole('textbox', { name: 'ایمیل' })).toHaveValue('new@example.com')
    // Nothing changed: on to the code already sent, without a new request.
    await user.click(screen.getByRole('button', { name: 'دریافت کد تأیید' }))
    expect(await screen.findByRole('heading', { name: 'تأیید ایمیل' })).toBeVisible()
    expect(mocks.registerStart).toHaveBeenCalledTimes(1)
  })
})
