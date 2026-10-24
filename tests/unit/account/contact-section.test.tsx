import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ContactSection } from '@/features/account/profile/contact-section'
import { TOTP_STATUS_KEY } from '@/features/account/profile/use-totp-status'
import type { UserProfile } from '@/lib/api/types/account'
import { everyMethodAuth } from '../support/auth-providers'
import { stubBrowserApis } from '../support/dom-stubs'
import { renderWithMe, saraWith } from './profile-support'

// The email and phone rows of the profile (auth digest F9): «افزودن» for a missing one,
// «تغییر» with the verified badge for one there, and the proof a change needs (§4.17) asked for
// only when it is needed.

const mocks = vi.hoisted(() => ({
  contactRequest: vi.fn(),
  contactVerify: vi.fn(),
  totpStatus: vi.fn(),
  bffFetch: vi.fn(),
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

beforeEach(() => {
  vi.clearAllMocks()
  stubBrowserApis()
  vi.useFakeTimers({ shouldAdvanceTime: true })
  mocks.totpStatus.mockResolvedValue({ is_totp_enabled: false })
})

afterEach(() => {
  vi.useRealTimers()
})

const row = (name: 'ایمیل' | 'شمارهٔ موبایل') => within(screen.getByRole('group', { name }))

function renderSection(me?: UserProfile, auth = everyMethodAuth()) {
  return renderWithMe((profile) => <ContactSection me={profile} />, { me, auth })
}

describe('ContactSection', () => {
  it('shows «افزودن ایمیل» when there is no email, and «تغییر» with the verified badge otherwise', () => {
    renderSection(saraWith({ email: null, is_email_verified: false }))
    expect(screen.getByRole('heading', { level: 2, name: 'ایمیل و شمارهٔ موبایل' })).toBeVisible()
    expect(row('ایمیل').getByText('ثبت نشده')).toBeInTheDocument()
    expect(row('ایمیل').getByRole('button', { name: 'افزودن ایمیل' })).toBeInTheDocument()
    expect(row('ایمیل').queryByText('تأیید شده')).toBeNull()
    // The phone, there and verified: shown in Persian digits.
    expect(row('شمارهٔ موبایل').getByText('۰۹۱۲ ۱۲۳ ۴۵۰۱')).toBeInTheDocument()
    expect(row('شمارهٔ موبایل').getByText('تأیید شده')).toBeInTheDocument()
    expect(
      row('شمارهٔ موبایل').getByRole('button', { name: 'تغییر شمارهٔ موبایل' }),
    ).toHaveTextContent(/^تغییر/)
  })

  it('«تغییر» and the badge for sara’s verified email; «افزودن شمارهٔ موبایل» without a phone', () => {
    renderSection(saraWith({ phone_number: null, is_phone_verified: false }))
    expect(row('ایمیل').getByText('sara.ahmadi@example.com')).toBeInTheDocument()
    expect(row('ایمیل').getByText('تأیید شده')).toBeInTheDocument()
    expect(row('ایمیل').getByRole('button', { name: 'تغییر ایمیل' })).toBeInTheDocument()
    expect(row('شمارهٔ موبایل').getByRole('button', { name: 'افزودن شمارهٔ موبایل' })).toBeVisible()
  })

  it('marks an identifier there but not verified', () => {
    renderSection(saraWith({ is_email_verified: false }))
    expect(row('ایمیل').getByText('تأیید نشده')).toBeInTheDocument()
    expect(row('ایمیل').queryByText('تأیید شده')).toBeNull()
  })

  it('an unverified phone starts filled in as it is typed (09…, not E.164)', async () => {
    const { user } = renderSection(saraWith({ is_phone_verified: false }))
    await user.click(row('شمارهٔ موبایل').getByRole('button', { name: 'تغییر شمارهٔ موبایل' }))
    expect(await screen.findByRole('textbox', { name: 'شمارهٔ موبایل تازه' })).toHaveValue(
      '09121234501',
    )
  })

  it('offers no phone change when no code can reach a phone (SMS and Telegram off)', () => {
    renderSection(undefined, {
      ...everyMethodAuth(),
      sms_otp_enabled: false,
      telegram_otp_enabled: false,
    })
    expect(row('شمارهٔ موبایل').queryByRole('button')).toBeNull()
    expect(
      row('شمارهٔ موبایل').getByText('تغییر شمارهٔ موبایل در این فروشگاه ممکن نیست.'),
    ).toBeInTheDocument()
    expect(row('ایمیل').getByRole('button', { name: 'تغییر ایمیل' })).toBeInTheDocument()
  })
})

describe('the proof a change asks for (§4.17)', () => {
  /** Opens the email editor of `me` (the TOTP status read as `me` says) and lists its proof. */
  async function proofFields(me: UserProfile) {
    mocks.totpStatus.mockResolvedValue({ is_totp_enabled: me.is_totp_enabled })
    const { user, client } = renderSection(me)
    // The rule reads the TOTP status endpoint: let it answer first.
    await waitFor(() => expect(client.getQueryData(TOTP_STATUS_KEY)).toBeDefined())
    await user.click(row('ایمیل').getByRole('button', { name: /ایمیل$/ }))
    await screen.findByRole('textbox', { name: /^ایمیل/ })
    return {
      password: screen.queryByLabelText('رمز فعلی') !== null,
      totp: screen.queryByRole('group', { name: 'کد برنامهٔ احراز هویت' }) !== null,
    }
  }

  it('replacing a verified email of an account with a password: the current password', async () => {
    expect(await proofFields(saraWith({}))).toEqual({ password: true, totp: false })
  })

  it('with two-step login on, the authenticator code too', async () => {
    expect(await proofFields(saraWith({ is_totp_enabled: true }))).toEqual({
      password: true,
      totp: true,
    })
  })

  it('adding an email: nothing (no verified one to protect)', async () => {
    expect(await proofFields(saraWith({ email: null, is_email_verified: false }))).toEqual({
      password: false,
      totp: false,
    })
  })

  it('an email there but not verified: nothing', async () => {
    expect(await proofFields(saraWith({ is_email_verified: false }))).toEqual({
      password: false,
      totp: false,
    })
  })

  it('an account made with Google (no password): nothing, even with two-step login on', async () => {
    expect(
      await proofFields(saraWith({ has_usable_password: false, is_totp_enabled: true })),
    ).toEqual({ password: false, totp: false })
  })

  it('the current password field fills from a password manager', async () => {
    const { user } = renderSection()
    await user.click(row('ایمیل').getByRole('button', { name: 'تغییر ایمیل' }))
    expect(await screen.findByLabelText('رمز فعلی')).toHaveAttribute(
      'autocomplete',
      'current-password',
    )
    expect(screen.getByRole('textbox', { name: 'ایمیل تازه' })).toHaveFocus()
    await user.click(screen.getByRole('button', { name: 'انصراف' }))
    expect(screen.queryByLabelText('رمز فعلی')).toBeNull()
    expect(row('ایمیل').getByRole('button', { name: 'تغییر ایمیل' })).toHaveFocus()
  })
})
