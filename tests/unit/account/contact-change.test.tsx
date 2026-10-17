import { act, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactSection } from '@/features/account/profile/contact-section'
import type { UserProfile } from '@/lib/api/types/account'
import type { AuthSettings } from '@/lib/api/types/settings'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { emailOnlyAuth } from '../support/auth'
import { everyMethodAuth } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { apiError, renderWithMe, saraWith } from './profile-support'

// Changing an email or a phone (auth digest §4.17–4.18, F9): the request with its proof, then
// the code sent to the new address, with the API's timers and waits, as registration does.

const mocks = vi.hoisted(() => ({
  contactRequest: vi.fn(),
  contactVerify: vi.fn(),
  totpStatus: vi.fn(),
  bffFetch: vi.fn(),
  announce: vi.fn(),
}))
vi.mock('@/features/auth/api', () => ({
  authApi: {
    contactRequest: mocks.contactRequest,
    contactVerify: mocks.contactVerify,
    totpStatus: mocks.totpStatus,
  },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('@/components/ui/live-announcer', () => ({ announce: mocks.announce }))

const SENT = { otp_method: 'email', expires_in: 300, resend_after: 120 } as const
const NEW_EMAIL = 'sara.new@example.com'

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.totpStatus.mockResolvedValue({ is_totp_enabled: false })
  mocks.contactRequest.mockResolvedValue(SENT)
})

afterEach(() => vi.useRealTimers())

const seconds = (n: number) => act(() => vi.advanceTimersByTimeAsync(n * 1000))
const codeBoxes = () =>
  within(screen.getByRole('group', { name: 'کد تأیید' })).getAllByRole('textbox')

function renderSection(me: UserProfile = saraWith({}), auth: AuthSettings = emailOnlyAuth()) {
  return renderWithMe((profile) => <ContactSection me={profile} />, { me, auth })
}

/** Opens the email editor (its code loads on the first press): the new email's field. */
async function openEmail(user: ReturnType<typeof renderSection>['user']) {
  await user.click(screen.getByRole('button', { name: 'تغییر ایمیل' }))
  return screen.findByRole('textbox', { name: 'ایمیل تازه' })
}

/** sara asks to move her email to NEW_EMAIL, with her password; on the code step after. */
async function toCodeStep() {
  const view = renderSection()
  await view.user.type(await openEmail(view.user), NEW_EMAIL)
  await view.user.type(screen.getByLabelText('رمز فعلی'), 'Firefly@1234')
  await view.user.click(screen.getByRole('button', { name: 'ارسال کد تأیید' }))
  await screen.findByRole('group', { name: 'کد تأیید' })
  return view
}

describe('changing the email', () => {
  it('sends the request with the password, then the code; ["me"] becomes the answer', async () => {
    const changed = saraWith({ email: NEW_EMAIL })
    mocks.contactVerify.mockResolvedValue(changed)
    const { user, client } = await toCodeStep()
    expect(mocks.contactRequest).toHaveBeenCalledWith({
      contact_type: 'email',
      email: NEW_EMAIL,
      otp_method: 'email',
      password: 'Firefly@1234',
    })
    // The API's own timers: 300 s of validity, 120 s before another code.
    expect(screen.getByText('کد تا ۰۵:۰۰ دیگر معتبر است.')).toBeInTheDocument()
    expect(screen.getByText('ارسال دوباره پس از ۰۲:۰۰')).toBeInTheDocument()
    expect(screen.getByText(NEW_EMAIL)).toBeInTheDocument()

    await user.type(codeBoxes()[0]!, '۱۲۳۴۵۶')
    await waitFor(() =>
      expect(mocks.contactVerify).toHaveBeenCalledWith({
        contact_type: 'email',
        otp_code: '123456',
      }),
    )
    await waitFor(() => expect(client.getQueryData(ME_KEY)).toEqual(changed))
    expect(await screen.findByText('ایمیل تازه ثبت و تأیید شد.')).toBeInTheDocument()
    expect(mocks.announce).toHaveBeenCalledWith('ایمیل تازه ثبت و تأیید شد.')
    expect(screen.queryByRole('group', { name: 'کد تأیید' })).toBeNull()
    const email = within(screen.getByRole('group', { name: 'ایمیل' }))
    expect(email.getByText(NEW_EMAIL)).toBeInTheDocument()
    expect(email.getByRole('button', { name: 'تغییر ایمیل' })).toHaveFocus()
  })

  it('a wrong code is said under the boxes, which are emptied and focused', async () => {
    mocks.contactVerify.mockRejectedValueOnce(
      apiError(400, 'auth_otp_invalid', 'کد تأیید نامعتبر است.'),
    )
    const { user } = await toCodeStep()
    await user.type(codeBoxes()[0]!, '111111')
    expect(await screen.findByText('کد تأیید نامعتبر است.')).toBeInTheDocument()
    for (const box of codeBoxes()) expect(box).toHaveValue('')
    expect(codeBoxes()[0]).toHaveFocus()
    expect(screen.getByRole('group', { name: 'کد تأیید' })).toHaveAccessibleDescription(
      'کد تأیید نامعتبر است.',
    )
  })

  it('five wrong codes (429): the code is void; a new one after retry_after', async () => {
    mocks.contactVerify.mockRejectedValueOnce(
      apiError(429, 'auth_otp_too_many_attempts', 'تلاش‌های ناموفق زیاد بود.', { retryAfter: 60 }),
    )
    const { user } = await toCodeStep()
    await user.type(codeBoxes()[0]!, '222222')
    expect(await screen.findByRole('alert')).toHaveTextContent('تلاش‌های ناموفق زیاد بود.')
    expect(screen.queryByRole('group', { name: 'کد تأیید' })).toBeNull()
    const send = screen.getByRole('button', { name: 'ارسال کد' })
    expect(send).toHaveAttribute('aria-disabled', 'true')
    expect(screen.getByText('ارسال دوباره پس از ۰۱:۰۰')).toBeInTheDocument()
    await user.click(send)
    expect(mocks.contactRequest).toHaveBeenCalledOnce()

    await seconds(61)
    await user.click(send)
    // The same request again, password included (no TOTP is on).
    await waitFor(() => expect(mocks.contactRequest).toHaveBeenCalledTimes(2))
    expect(mocks.contactRequest.mock.calls[1]![0]).toMatchObject({ password: 'Firefly@1234' })
  })

  it('a 429 on the request waits retry_after; the form stays filled', async () => {
    mocks.contactRequest.mockRejectedValueOnce(
      apiError(429, 'auth_otp_throttled', 'لطفاً ۹۰ ثانیه دیگر دوباره تلاش کنید.', {
        retryAfter: 90,
      }),
    )
    const { user } = renderSection()
    await user.type(await openEmail(user), NEW_EMAIL)
    await user.type(screen.getByLabelText('رمز فعلی'), 'Firefly@1234')
    const submit = screen.getByRole('button', { name: 'ارسال کد تأیید' })
    await user.click(submit)

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'لطفاً ۹۰ ثانیه دیگر دوباره تلاش کنید.',
    )
    await waitFor(() => expect(submit).toHaveAttribute('aria-disabled', 'true'))
    expect(submit).toHaveAccessibleDescription('زمان باقی‌مانده تا تلاش دوباره: ۰۱:۳۰')
    expect(screen.getByRole('textbox', { name: 'ایمیل تازه' })).toHaveValue(NEW_EMAIL)
    await seconds(91)
    await user.click(submit)
    await screen.findByRole('group', { name: 'کد تأیید' })
  })

  it('503 auth_otp_send_failed: the detail, and the button sends again at once', async () => {
    const detail = 'ارسال کد تأیید ممکن نشد. لطفاً دوباره تلاش کنید.'
    mocks.contactRequest.mockRejectedValueOnce(apiError(503, 'auth_otp_send_failed', detail))
    const { user } = renderSection()
    await user.type(await openEmail(user), NEW_EMAIL)
    await user.type(screen.getByLabelText('رمز فعلی'), 'Firefly@1234')
    const submit = screen.getByRole('button', { name: 'ارسال کد تأیید' })
    await user.click(submit)
    expect(await screen.findByRole('alert')).toHaveTextContent(detail)
    expect(submit).not.toHaveAttribute('aria-disabled')
    await user.click(submit)
    await screen.findByRole('group', { name: 'کد تأیید' })
    expect(mocks.contactRequest).toHaveBeenCalledTimes(2)
  })

  it.each([
    ['auth_password_invalid', 'رمز عبور فعلی اشتباه است.', 'رمز فعلی'],
    ['auth_email_already_exists', 'این ایمیل قبلا ثبت شده است.', 'ایمیل تازه'],
    ['auth_contact_unchanged', 'این مقدار همان اطلاعات فعلی و تأیید شده شما است.', 'ایمیل تازه'],
  ])('%s goes under «%s»', async (code, detail, label) => {
    mocks.contactRequest.mockRejectedValueOnce(apiError(400, code, detail))
    const { user } = renderSection()
    await user.type(await openEmail(user), NEW_EMAIL)
    await user.type(screen.getByLabelText('رمز فعلی'), 'wrong')
    await user.click(screen.getByRole('button', { name: 'ارسال کد تأیید' }))
    const input = screen.getByLabelText(label)
    await waitFor(() => expect(input).toHaveAccessibleDescription(expect.stringContaining(detail)))
    expect(input).toHaveFocus()
  })
})

describe('adding a phone', () => {
  const noPhone = saraWith({ phone_number: null, is_phone_verified: false })

  it('normalises Persian digits; the channel is the settings’ default; shown back formatted', async () => {
    mocks.contactRequest.mockResolvedValue({ ...SENT, otp_method: 'telegram' })
    const { user } = renderSection(noPhone, everyMethodAuth())
    await user.click(screen.getByRole('button', { name: 'افزودن شماره موبایل' }))
    await screen.findByRole('textbox', { name: 'شماره موبایل' })
    // Adding needs no proof: nothing verified is replaced.
    expect(screen.queryByLabelText('رمز فعلی')).toBeNull()
    await user.type(screen.getByRole('textbox', { name: 'شماره موبایل' }), '۰۹۱۲ ۳۴۵ ۶۷۸۹')
    expect(screen.getByRole('radio', { name: 'تلگرام' })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'ارسال کد تأیید' }))
    await screen.findByRole('group', { name: 'کد تأیید' })
    expect(mocks.contactRequest).toHaveBeenCalledWith({
      contact_type: 'phone',
      phone_number: '09123456789',
      otp_method: 'telegram',
    })
    expect(screen.getByText('۰۹۱۲ ۳۴۵ ۶۷۸۹')).toBeInTheDocument()
  })

  it('refuses a landline or a malformed number before sending', async () => {
    const { user } = renderSection(noPhone, everyMethodAuth())
    await user.click(screen.getByRole('button', { name: 'افزودن شماره موبایل' }))
    await screen.findByRole('textbox', { name: 'شماره موبایل' })
    const input = screen.getByRole('textbox', { name: 'شماره موبایل' })
    await user.type(input, '۰۲۱۸۸۷۷۶۶۵۵')
    await user.click(screen.getByRole('button', { name: 'ارسال کد تأیید' }))
    expect(input).toHaveAccessibleDescription(
      expect.stringContaining('شماره موبایل را درست وارد کنید'),
    )
    expect(input).toHaveFocus()
    expect(mocks.contactRequest).not.toHaveBeenCalled()
  })
})
