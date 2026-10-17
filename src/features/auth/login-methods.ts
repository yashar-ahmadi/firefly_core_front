import type { ContactType, OtpMethod } from '@/lib/api/types/account'
import type { AuthSettings } from '@/lib/api/types/settings'

// Which sign-in methods the login page offers, from the settings' `auth` block alone (auth
// digest F0): never an assumed SMS, Telegram or Google, and never a method the block turns off,
// whatever `default_otp_methods` says (`disabledAuth()` keeps its `email` default). Pure.

export interface LoginMethods {
  /** Password login. The API takes it for an email address and a mobile number alike. */
  password: boolean
  /** The code channels for this identifier type, in the API's order (email, sms, telegram). */
  otpChannels: OtpMethod[]
  /** Preselected: `default_otp_methods[type]` when it is on offer, else the first one. */
  defaultOtpChannel: OtpMethod | null
}

/** A code to an email address goes by email; to a mobile number by SMS or Telegram (F0). */
const CHANNELS_FOR: Record<ContactType, readonly OtpMethod[]> = {
  email: ['email'],
  phone: ['sms', 'telegram'],
}

/** A channel's own switch: `available_otp_methods` should agree, but both must be on. */
function switchedOn(auth: AuthSettings, channel: OtpMethod): boolean {
  if (channel === 'sms') return auth.sms_otp_enabled
  if (channel === 'telegram') return auth.telegram_otp_enabled
  return true
}

/**
 * Whether signing in is possible at all. The API always lists email codes first
 * (`available_otp_methods`), so an empty list is `disabledAuth()`: the settings could not be
 * read, and login and registration stay off until they can.
 */
export function signInOpen(auth: AuthSettings): boolean {
  return auth.available_otp_methods.length > 0
}

/** The methods on offer for an identifier of `type`. */
export function loginMethods(auth: AuthSettings, type: ContactType): LoginMethods {
  if (!signInOpen(auth)) return { password: false, otpChannels: [], defaultOtpChannel: null }
  const otpChannels = auth.available_otp_methods.filter(
    (channel) => CHANNELS_FOR[type].includes(channel) && switchedOn(auth, channel),
  )
  const preferred = auth.default_otp_methods[type]
  const defaultOtpChannel =
    preferred !== undefined && otpChannels.includes(preferred)
      ? preferred
      : (otpChannels[0] ?? null)
  return { password: true, otpChannels, defaultOtpChannel }
}

/** The Google client id while Google login is on (it is null whenever it is off); else null. */
export function googleClientId(auth: AuthSettings): string | null {
  return auth.google_login_enabled && auth.google_client_id ? auth.google_client_id : null
}
