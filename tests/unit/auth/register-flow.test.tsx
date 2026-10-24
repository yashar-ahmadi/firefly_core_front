import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { RegisterFlow } from '@/features/auth/components/register-flow'
import { ApiError } from '@/lib/api/errors'
import type { AuthSettings } from '@/lib/api/types/settings'
import { cart, result } from '../cart/support'
import { authProviders, everyMethodAuth } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { SARA } from './fixtures'

// Registration (auth digest F1): start → verify → complete, every step keyed by the token the
// start answered; the methods and channels come from the settings' `auth` block alone.

const mocks = vi.hoisted(() => ({
  registerStart: vi.fn(),
  registerVerify: vi.fn(),
  registerResendOtp: vi.fn(),
  registerComplete: vi.fn(),
  bffFetch: vi.fn(),
  router: { replace: vi.fn(), push: vi.fn() },
}))
vi.mock('@/features/auth/api', () => ({
  authApi: {
    registerStart: mocks.registerStart,
    registerVerify: mocks.registerVerify,
    registerResendOtp: mocks.registerResendOtp,
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
const NEW_USER = { ...SARA, email: 'new@example.com', phone_number: null }

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

function renderFlow({ next = '', auth }: { next?: string; auth?: AuthSettings } = {}) {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime })
  render(<RegisterFlow next={next} initialIdentifier="" termsHtml={null} />, {
    wrapper: authProviders({ auth }).wrapper,
  })
  return user
}

type User = ReturnType<typeof userEvent.setup>

async function fillNames(user: User) {
  await user.type(screen.getByRole('textbox', { name: 'نام' }), 'نیما')
  await user.type(screen.getByRole('textbox', { name: 'نام خانوادگی' }), 'رضایی')
}

/** The verify step for new@example.com, reached the way a visitor does. */
async function toVerifyStep(user: User) {
  await fillNames(user)
  await user.type(screen.getByRole('textbox', { name: 'ایمیل' }), 'new@example.com')
  mocks.registerStart.mockResolvedValueOnce({ ...STARTED, registration_token: TOKEN })
  await user.click(screen.getByRole('button', { name: 'دریافت کد تأیید' }))
  await screen.findByRole('heading', { name: 'تأیید ایمیل' })
}

describe('RegisterFlow', () => {
  it('offers only the methods of registration_methods: no phone tab for email only', () => {
    renderFlow()
    expect(screen.queryByRole('tablist')).toBeNull()
    expect(screen.queryByRole('tab', { name: 'شمارهٔ موبایل' })).toBeNull()
    expect(screen.queryByRole('textbox', { name: 'شمارهٔ موبایل' })).toBeNull()
    expect(screen.getByRole('textbox', { name: 'نام' })).toHaveAttribute(
      'autocomplete',
      'given-name',
    )
    expect(screen.getByRole('textbox', { name: 'نام خانوادگی' })).toHaveAttribute(
      'autocomplete',
      'family-name',
    )
    expect(screen.getByRole('textbox', { name: 'ایمیل' })).toHaveAttribute('autocomplete', 'email')
    // One channel for an email address: nothing to choose.
    expect(screen.queryByRole('radiogroup')).toBeNull()
  })

  it('with both methods: tabs that keep what each had, and the phone channels to choose', async () => {
    const user = renderFlow({ auth: everyMethodAuth() })
    const tabs = screen.getByRole('tablist', { name: 'ثبت‌نام با' })
    expect(
      within(tabs)
        .getAllByRole('tab')
        .map((tab) => tab.textContent),
    ).toEqual(['ایمیل', 'شمارهٔ موبایل'])
    expect(screen.getByRole('tab', { name: 'ایمیل' })).toHaveAttribute('aria-selected', 'true')
    await user.type(screen.getByRole('textbox', { name: 'ایمیل' }), 'new@example.com')

    await user.click(screen.getByRole('tab', { name: 'شمارهٔ موبایل' }))
    expect(screen.getByRole('textbox', { name: 'شمارهٔ موبایل' })).toHaveAttribute(
      'autocomplete',
      'tel',
    )
    const channels = screen.getByRole('radiogroup', { name: 'روش دریافت کد' })
    expect(within(channels).getAllByRole('radio')).toHaveLength(2)
    // `default_otp_methods.phone` is telegram here.
    expect(screen.getByRole('radio', { name: 'تلگرام' })).toBeChecked()
    expect(screen.queryByRole('radio', { name: 'ایمیل' })).toBeNull()

    await user.click(screen.getByRole('tab', { name: 'ایمیل' }))
    expect(screen.getByRole('textbox', { name: 'ایمیل' })).toHaveValue('new@example.com')
  })

  it('start → verify → complete send the stored registration_token, then sign in to next', async () => {
    const user = renderFlow({ next: '/product/x/' })
    await fillNames(user)
    await user.type(screen.getByRole('textbox', { name: 'ایمیل' }), ' New@Example.com ')
    mocks.registerStart.mockResolvedValueOnce({ ...STARTED, registration_token: TOKEN })
    await user.click(screen.getByRole('button', { name: 'دریافت کد تأیید' }))
    expect(mocks.registerStart).toHaveBeenCalledWith({
      first_name: 'نیما',
      last_name: 'رضایی',
      register_method: 'email',
      email: 'New@Example.com',
      otp_method: 'email',
    })

    expect(await screen.findByRole('heading', { name: 'تأیید ایمیل' })).toBeVisible()
    await waitFor(() => expect(screen.getByLabelText('رقم ۱')).toHaveFocus())
    mocks.registerVerify.mockResolvedValueOnce({
      registration_token: TOKEN,
      register_method: 'email',
    })
    await user.keyboard('۱۲۳۴۵۶')
    await waitFor(() =>
      expect(mocks.registerVerify).toHaveBeenCalledWith({
        registration_token: TOKEN,
        otp_code: '123456',
      }),
    )

    const password = await screen.findByLabelText('رمز عبور')
    await waitFor(() => expect(password).toHaveFocus())
    expect(password).toHaveAttribute('autocomplete', 'new-password')
    await user.type(password, 'Firefly@1234')
    await user.type(screen.getByLabelText('تکرار رمز عبور'), 'Firefly@1234')
    mocks.registerComplete.mockResolvedValueOnce({
      user: NEW_USER,
      requires_totp: false,
      remember_me: false,
    })
    await user.click(screen.getByRole('button', { name: 'ایجاد حساب کاربری' }))
    expect(mocks.registerComplete).toHaveBeenCalledWith({
      registration_token: TOKEN,
      password: 'Firefly@1234',
      confirm_password: 'Firefly@1234',
    })
    // completeLogin: the guest cart merged once, then on to `next`.
    await waitFor(() => expect(mocks.router.replace).toHaveBeenCalledWith('/product/x/'))
    expect(mocks.bffFetch).toHaveBeenCalledWith('cart/merge/', { method: 'POST' })
    expect(screen.getByRole('heading', { name: 'حساب شما ساخته شد' })).toBeVisible()
  })

  it('a 429 on resend holds «ارسال مجدد کد» for retry_after seconds', async () => {
    const user = renderFlow()
    await toVerifyStep(user)
    const resend = screen.getByRole('button', { name: 'ارسال مجدد کد' })
    // `resend_after` first.
    expect(resend).toHaveAttribute('aria-disabled', 'true')
    await seconds(120)
    await waitFor(() => expect(resend).not.toHaveAttribute('aria-disabled'))

    const detail = 'برای ارسال مجدد کد، ۴۵ ثانیه دیگر صبر کنید.'
    mocks.registerResendOtp.mockRejectedValueOnce(
      new ApiError({ status: 429, code: 'auth_otp_throttled', detail, retryAfter: 45 }),
    )
    await user.click(resend)
    expect(mocks.registerResendOtp).toHaveBeenCalledWith({
      registration_token: TOKEN,
      otp_method: 'email',
    })
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(resend).toHaveAttribute('aria-disabled', 'true')
    expect(resend).toHaveAccessibleDescription(expect.stringContaining('۰۰:۴۵'))
    await user.click(resend)
    expect(mocks.registerResendOtp).toHaveBeenCalledTimes(1)
    await seconds(44)
    expect(resend).toHaveAttribute('aria-disabled', 'true')
    await seconds(1)
    await waitFor(() => expect(resend).not.toHaveAttribute('aria-disabled'))
    // The code boxes stayed usable all along.
    expect(screen.getByRole('group', { name: 'کد تأیید' })).toBeVisible()
  })

  it('resends a phone code by another channel the number can take', async () => {
    const user = renderFlow({ auth: everyMethodAuth() })
    await user.click(screen.getByRole('tab', { name: 'شمارهٔ موبایل' }))
    await fillNames(user)
    await user.type(screen.getByRole('textbox', { name: 'شمارهٔ موبایل' }), '۰۹۱۲ ۱۲۳ ۴۵۹۹')
    mocks.registerStart.mockResolvedValueOnce({
      ...STARTED,
      otp_method: 'telegram',
      registration_token: TOKEN,
    })
    await user.click(screen.getByRole('button', { name: 'دریافت کد تأیید' }))
    expect(mocks.registerStart).toHaveBeenCalledWith({
      first_name: 'نیما',
      last_name: 'رضایی',
      register_method: 'phone',
      phone_number: '09121234599',
      otp_method: 'telegram',
    })
    await screen.findByRole('heading', { name: 'تأیید شمارهٔ موبایل' })
    expect(screen.getByText('کد ۶ رقمی در تلگرامِ این شماره فرستاده شد.')).toBeVisible()

    await seconds(120)
    await user.click(screen.getByRole('radio', { name: 'پیامک' }))
    mocks.registerResendOtp.mockResolvedValueOnce({
      ...STARTED,
      otp_method: 'sms',
      registration_token: TOKEN,
    })
    await user.click(screen.getByRole('button', { name: 'ارسال مجدد کد' }))
    expect(mocks.registerResendOtp).toHaveBeenCalledWith({
      registration_token: TOKEN,
      otp_method: 'sms',
    })
    expect(await screen.findByText('کد ۶ رقمی با پیامک به این شماره فرستاده شد.')).toBeVisible()
  })
})
