import { act, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PasswordSection } from '@/features/account/profile/password-section'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { SARA } from '../auth/fixtures'
import { stubBrowserApis } from '../support/dom-stubs'
import { apiError, renderWithMe, saraWith } from './profile-support'

// Change or set the password (auth digest §4.15, F8). The BFF keeps the new token pair the API
// answers, so the page only says so in a toast and empties the fields.

const mocks = vi.hoisted(() => ({
  passwordChange: vi.fn(),
  bffFetch: vi.fn(),
  notify: { success: vi.fn(), error: vi.fn(), info: vi.fn(), dismiss: vi.fn() },
}))
vi.mock('@/features/auth/api', () => ({ authApi: { passwordChange: mocks.passwordChange } }))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ replace: vi.fn(), push: vi.fn() }) }))
vi.mock('@/components/ui/toaster', () => ({ toastRegionReady: () => true, notify: mocks.notify }))

const NEW_PASSWORD = 'Kooh-Damavand-1404'

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.passwordChange.mockResolvedValue({})
})

afterEach(() => {
  vi.useRealTimers()
})

/** A password field by its label (the section itself is labelled «رمز عبور» too). */
const field = (name: string) => screen.getByLabelText(name, { selector: 'input' })

describe('PasswordSection', () => {
  it('hides «رمز فعلی» when the account has no password, and sets one («تعیین رمز عبور»)', async () => {
    const { user, client } = renderWithMe((me) => <PasswordSection me={me} />, {
      me: saraWith({ has_usable_password: false }),
    })
    expect(screen.getByRole('heading', { level: 2, name: 'رمز عبور' })).toBeInTheDocument()
    expect(screen.getByText(/رمز عبور ندارد/)).toBeInTheDocument()
    expect(screen.queryByLabelText('رمز فعلی', { selector: 'input' })).toBeNull()

    await user.type(field('رمز عبور'), NEW_PASSWORD)
    await user.type(field('تکرار رمز عبور'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'تعیین رمز عبور' }))

    await waitFor(() =>
      expect(mocks.passwordChange).toHaveBeenCalledWith({
        password: NEW_PASSWORD,
        confirm_password: NEW_PASSWORD,
      }),
    )
    expect(mocks.notify.success).toHaveBeenCalledWith('رمز عبور تعیین شد')
    // From now on the account has a password: the section asks for it, as the API will.
    await waitFor(() =>
      expect(client.getQueryData(ME_KEY)).toMatchObject({ has_usable_password: true }),
    )
    expect(await screen.findByLabelText('رمز فعلی', { selector: 'input' })).toHaveValue('')
    expect(screen.getByRole('button', { name: 'تغییر رمز عبور' })).toBeInTheDocument()
  })

  it('changes the password with the current one; a toast, the fields emptied', async () => {
    const { user } = renderWithMe((me) => <PasswordSection me={me} />)
    expect(screen.getByRole('heading', { level: 2, name: 'رمز عبور' })).toBeInTheDocument()
    expect(field('رمز فعلی')).toHaveAttribute('autocomplete', 'current-password')
    expect(field('رمز عبور جدید')).toHaveAttribute('autocomplete', 'new-password')
    expect(field('تکرار رمز عبور جدید')).toHaveAttribute('autocomplete', 'new-password')

    await user.type(field('رمز فعلی'), 'Firefly@1234')
    await user.type(field('رمز عبور جدید'), NEW_PASSWORD)
    await user.type(field('تکرار رمز عبور جدید'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'تغییر رمز عبور' }))

    await waitFor(() => expect(mocks.notify.success).toHaveBeenCalledWith('رمز عبور تغییر کرد'))
    expect(mocks.passwordChange).toHaveBeenCalledOnce()
    expect(mocks.passwordChange).toHaveBeenCalledWith({
      current_password: 'Firefly@1234',
      password: NEW_PASSWORD,
      confirm_password: NEW_PASSWORD,
    })
    for (const name of ['رمز فعلی', 'رمز عبور جدید', 'تکرار رمز عبور جدید']) {
      expect(field(name)).toHaveValue('')
    }
  })

  it('checks before sending: the current password, then the new one and its repeat', async () => {
    const { user } = renderWithMe((me) => <PasswordSection me={me} />)
    await user.click(screen.getByRole('button', { name: 'تغییر رمز عبور' }))
    expect(field('رمز فعلی')).toHaveAccessibleDescription('رمز فعلی را وارد کنید.')
    expect(field('رمز فعلی')).toHaveFocus()

    await user.type(field('رمز فعلی'), 'Firefly@1234')
    await user.type(field('رمز عبور جدید'), NEW_PASSWORD)
    await user.type(field('تکرار رمز عبور جدید'), 'something else')
    await user.click(screen.getByRole('button', { name: 'تغییر رمز عبور' }))
    expect(field('تکرار رمز عبور جدید')).toHaveAccessibleDescription(
      'تکرار رمز عبور با رمز عبور یکسان نیست.',
    )
    expect(mocks.passwordChange).not.toHaveBeenCalled()
  })

  it.each([
    ['auth_password_invalid', 'رمز عبور فعلی اشتباه است.'],
    ['auth_invalid_credentials', 'رمز عبور فعلی درست نیست.'],
  ])('%s: under «رمز فعلی», which takes the focus', async (code, detail) => {
    mocks.passwordChange.mockRejectedValueOnce(apiError(400, code, detail))
    const { user } = renderWithMe((me) => <PasswordSection me={me} />)
    await user.type(field('رمز فعلی'), 'wrong-password')
    await user.type(field('رمز عبور جدید'), NEW_PASSWORD)
    await user.type(field('تکرار رمز عبور جدید'), NEW_PASSWORD)
    await user.click(screen.getByRole('button', { name: 'تغییر رمز عبور' }))

    await waitFor(() => expect(field('رمز فعلی')).toHaveAttribute('aria-invalid', 'true'))
    expect(field('رمز فعلی')).toHaveAccessibleDescription(detail)
    expect(field('رمز فعلی')).toHaveFocus()
    expect(mocks.notify.success).not.toHaveBeenCalled()
    // Nothing is emptied: the visitor corrects the one that was wrong.
    expect(field('رمز عبور جدید')).toHaveValue(NEW_PASSWORD)
  })

  it('auth_password_weak: each reason under the new password', async () => {
    const reasons = [
      'این رمز عبور بسیار رایج است.',
      'رمز عبور نمی‌تواند فقط از عدد تشکیل شده باشد.',
    ]
    mocks.passwordChange.mockRejectedValueOnce(
      apiError(400, 'auth_password_weak', reasons.join(' '), { reasons }),
    )
    const { user } = renderWithMe((me) => <PasswordSection me={me} />)
    await user.type(field('رمز فعلی'), 'Firefly@1234')
    await user.type(field('رمز عبور جدید'), '12345678')
    await user.type(field('تکرار رمز عبور جدید'), '12345678')
    await user.click(screen.getByRole('button', { name: 'تغییر رمز عبور' }))

    await waitFor(() => expect(field('رمز عبور جدید')).toHaveAttribute('aria-invalid', 'true'))
    for (const reason of reasons) expect(screen.getByText(reason)).toBeInTheDocument()
    expect(field('رمز عبور جدید')).toHaveFocus()
  })

  it('a 429 holds the button for retry_after', async () => {
    mocks.passwordChange.mockRejectedValueOnce(
      apiError(429, 'throttled', 'درخواست بیش از حد. لطفاً 30 ثانیه صبر کنید.', { retryAfter: 30 }),
    )
    const { user } = renderWithMe((me) => <PasswordSection me={me} />)
    await user.type(field('رمز فعلی'), 'Firefly@1234')
    await user.type(field('رمز عبور جدید'), NEW_PASSWORD)
    await user.type(field('تکرار رمز عبور جدید'), NEW_PASSWORD)
    const button = screen.getByRole('button', { name: 'تغییر رمز عبور' })
    await user.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent('لطفاً ۳۰ ثانیه صبر کنید.')
    await waitFor(() => expect(button).toHaveAttribute('aria-disabled', 'true'))
    expect(button).toHaveAccessibleDescription('زمان باقی‌مانده تا تلاش دوباره: ۰۰:۳۰')
    await user.click(button)
    expect(mocks.passwordChange).toHaveBeenCalledOnce()

    await act(() => vi.advanceTimersByTimeAsync(31_000))
    expect(button).not.toHaveAttribute('aria-disabled')
    await user.click(button)
    await waitFor(() => expect(mocks.passwordChange).toHaveBeenCalledTimes(2))
  })

  it('names the account in a username field for password managers', () => {
    const { container } = renderWithMe((me) => <PasswordSection me={me} />)
    const username = container.querySelector('input[autocomplete="username"]')
    expect(username).toHaveValue(SARA.email)
  })
})
