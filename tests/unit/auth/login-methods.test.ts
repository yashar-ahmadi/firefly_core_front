import { describe, expect, it, vi } from 'vitest'
import { googleClientId, loginMethods, signInOpen } from '@/features/auth/login-methods'
import { disabledAuth } from '@/features/settings/api'
import type { AuthSettings } from '@/lib/api/types/settings'
import { emailOnlyAuth } from '../support/auth'
import { everyMethodAuth } from '../support/auth-providers'

// `disabledAuth` lives with the server-side settings loaders.
vi.mock('server-only', () => ({}))

// The sign-in methods on offer come only from the settings' `auth` block (auth-settings
// digest F0): never an assumed SMS, Telegram or Google, never a method the block turns off.

describe('loginMethods', () => {
  it('offers email codes for an email address and no code for a phone on the dev settings', () => {
    expect(loginMethods(emailOnlyAuth(), 'email')).toEqual({
      password: true,
      otpChannels: ['email'],
      defaultOtpChannel: 'email',
    })
    // `default_otp_methods.phone` is absent: no SMS, no Telegram.
    expect(loginMethods(emailOnlyAuth(), 'phone')).toEqual({
      password: true,
      otpChannels: [],
      defaultOtpChannel: null,
    })
  })

  it('offers a phone only SMS and Telegram, in the API order, preselecting the default', () => {
    expect(loginMethods(everyMethodAuth(), 'phone')).toEqual({
      password: true,
      otpChannels: ['sms', 'telegram'],
      defaultOtpChannel: 'telegram',
    })
    expect(loginMethods(everyMethodAuth(), 'email').otpChannels).toEqual(['email'])
  })

  it('never offers a channel the block turns off, whatever the default says', () => {
    const smsOff: AuthSettings = {
      ...everyMethodAuth(),
      sms_otp_enabled: false,
      available_otp_methods: ['email', 'telegram'],
      default_otp_methods: { email: 'email', phone: 'sms' },
    }
    expect(loginMethods(smsOff, 'phone')).toEqual({
      password: true,
      otpChannels: ['telegram'],
      defaultOtpChannel: 'telegram',
    })
    // A list that names a channel whose switch is off: the switch wins.
    const telegramFlagOff = { ...everyMethodAuth(), telegram_otp_enabled: false }
    expect(loginMethods(telegramFlagOff, 'phone').otpChannels).toEqual(['sms'])
  })

  it('offers nothing at all without settings (disabledAuth), its email default included', () => {
    const none = disabledAuth()
    expect(none.default_otp_methods.email).toBe('email')
    for (const type of ['email', 'phone'] as const) {
      expect(loginMethods(none, type)).toEqual({
        password: false,
        otpChannels: [],
        defaultOtpChannel: null,
      })
    }
    expect(signInOpen(none)).toBe(false)
    expect(signInOpen(emailOnlyAuth())).toBe(true)
  })
})

describe('googleClientId', () => {
  it('is the client id only while Google login is on and has one', () => {
    expect(googleClientId(everyMethodAuth())).toBe('client-id.apps.googleusercontent.com')
    expect(googleClientId(emailOnlyAuth())).toBeNull()
    expect(googleClientId({ ...everyMethodAuth(), google_login_enabled: false })).toBeNull()
    expect(googleClientId({ ...everyMethodAuth(), google_client_id: null })).toBeNull()
    expect(googleClientId(disabledAuth())).toBeNull()
  })
})
