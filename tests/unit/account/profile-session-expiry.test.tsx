import { fireEvent, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AvatarUpload } from '@/features/account/profile/avatar-upload'
import { ContactSection } from '@/features/account/profile/contact-section'
import { PasswordSection } from '@/features/account/profile/password-section'
import { ProfileForm } from '@/features/account/profile/profile-form'
import { TwoFactorSection } from '@/features/account/profile/two-factor-section'
import { ApiError } from '@/lib/api/errors'
import { ME_KEY } from '@/lib/session/viewer-queries'
import { stubBrowserApis } from '../support/dom-stubs'
import { renderWithMe, saraWith } from './profile-support'

// A profile write whose session is gone (the BFF's one refresh failed: 401 not_authenticated or
// token_not_valid) ends the session the way every session call does (Plan 3 ruling): the
// visitor's data goes and login replaces the page, with it as `next`. The form says nothing:
// it is not a mistake in what was typed.

const mocks = vi.hoisted(() => {
  const replace = vi.fn()
  return {
    updateMe: vi.fn(),
    passwordChange: vi.fn(),
    contactRequest: vi.fn(),
    totpStatus: vi.fn(),
    totpSetup: vi.fn(),
    totpEnable: vi.fn(),
    bffFetch: vi.fn(),
    replace,
    router: { replace, push: vi.fn() },
  }
})
vi.mock('@/features/auth/api', () => ({
  authApi: {
    updateMe: mocks.updateMe,
    passwordChange: mocks.passwordChange,
    contactRequest: mocks.contactRequest,
    totpStatus: mocks.totpStatus,
    totpSetup: mocks.totpSetup,
    totpEnable: mocks.totpEnable,
  },
}))
vi.mock('@/lib/api/client', () => ({ bffFetch: mocks.bffFetch }))
vi.mock('next/navigation', () => ({ useRouter: () => mocks.router }))

const LOGIN = '/login/?next=/account/profile/'
const gone = (code: string) => new ApiError({ status: 401, code, detail: 'اعتبارنامه منقضی شده' })

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  window.history.replaceState(null, '', '/account/profile/')
  mocks.totpStatus.mockResolvedValue({ is_totp_enabled: false })
})

afterEach(() => {
  vi.useRealTimers()
  window.history.replaceState(null, '', '/')
})

/** Login replaced the page once, the profile is nobody's, and no form showed the 401. */
async function expectLogin(client: ReturnType<typeof renderWithMe>['client']) {
  await waitFor(() => expect(mocks.replace).toHaveBeenCalledExactlyOnceWith(LOGIN))
  expect(client.getQueryData(ME_KEY)).toBeNull()
  expect(mocks.router.push).not.toHaveBeenCalled()
  expect(screen.queryByText('اعتبارنامه منقضی شده')).toBeNull()
}

describe('a profile write after the session ended', () => {
  it('the names (401 not_authenticated): login replaces the page, ["me"] is cleared', async () => {
    mocks.updateMe.mockRejectedValue(gone('not_authenticated'))
    const { user, client } = renderWithMe((me) => <ProfileForm me={me} />)
    await user.type(screen.getByRole('textbox', { name: 'نام' }), ' جان')
    await user.click(screen.getByRole('button', { name: 'ذخیرهٔ نام' }))
    await expectLogin(client)
  })

  it('the password (401 token_not_valid)', async () => {
    mocks.passwordChange.mockRejectedValue(gone('token_not_valid'))
    const { user, client } = renderWithMe((me) => <PasswordSection me={me} />)
    const field = (name: string) => screen.getByLabelText(name, { selector: 'input' })
    await user.type(field('رمز فعلی'), 'Firefly@1234')
    await user.type(field('رمز عبور جدید'), 'Kooh-Damavand-1404')
    await user.type(field('تکرار رمز عبور جدید'), 'Kooh-Damavand-1404')
    await user.click(screen.getByRole('button', { name: 'تغییر رمز عبور' }))
    await expectLogin(client)
  })

  it('a contact change request (401 token_not_valid)', async () => {
    mocks.contactRequest.mockRejectedValue(gone('token_not_valid'))
    const { user, client } = renderWithMe((me) => <ContactSection me={me} />)
    await user.click(screen.getByRole('button', { name: 'تغییر ایمیل' }))
    await user.type(await screen.findByRole('textbox', { name: 'ایمیل تازه' }), 'n@example.com')
    await user.type(screen.getByLabelText('رمز فعلی', { selector: 'input' }), 'Firefly@1234')
    await user.click(screen.getByRole('button', { name: 'ارسال کد تأیید' }))
    await expectLogin(client)
  })

  it('two-step login’s enable (401 not_authenticated)', async () => {
    mocks.totpSetup.mockResolvedValue({
      secret: 'JBSWY3DPEHPK3PXP',
      qr_code: 'data:image/png;base64,iVBORw0KGgo=',
      provisioning_uri: 'otpauth://totp/x',
    })
    mocks.totpEnable.mockRejectedValue(gone('not_authenticated'))
    const { user, client } = renderWithMe(() => <TwoFactorSection />)
    await user.click(await screen.findByRole('button', { name: 'فعال‌سازی ورود دومرحله‌ای' }))
    const group = await screen.findByRole('group', { name: 'کد برنامهٔ احراز هویت' })
    await user.type(within(group).getAllByRole('textbox')[0]!, '123456')
    await expectLogin(client)
  })

  it('the avatar’s upload (401 not_authenticated)', async () => {
    mocks.updateMe.mockRejectedValue(gone('not_authenticated'))
    const objectUrls = { create: URL.createObjectURL, revoke: URL.revokeObjectURL }
    // jsdom has no object URLs (the preview).
    URL.createObjectURL = vi.fn(() => 'blob:http://localhost:3000/preview-1')
    URL.revokeObjectURL = vi.fn()
    try {
      const { user, client, container } = renderWithMe((me) => <AvatarUpload me={me} />)
      const file = new File(['x'], 'me.png', { type: 'image/png' })
      fireEvent.change(container.querySelector('input[type="file"]')!, {
        target: { files: [file] },
      })
      await user.click(await screen.findByRole('button', { name: 'ذخیرهٔ تصویر' }))
      await expectLogin(client)
    } finally {
      Object.assign(URL, { createObjectURL: objectUrls.create, revokeObjectURL: objectUrls.revoke })
    }
  })

  it('the avatar’s removal (401 token_not_valid)', async () => {
    mocks.updateMe.mockRejectedValue(gone('token_not_valid'))
    const { user, client } = renderWithMe((me) => <AvatarUpload me={me} />, {
      me: saraWith({ avatar_picture: 'http://localhost:8000/media/user/avatar/3f2a.webp' }),
    })
    await user.click(screen.getByRole('button', { name: 'حذف تصویر' }))
    await user.click(screen.getByRole('button', { name: 'بله، حذف شود' }))
    await expectLogin(client)
  })
})
