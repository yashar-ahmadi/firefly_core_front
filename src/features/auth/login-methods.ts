import type { ContactType, OtpMethod } from '@/lib/api/types/account'
import type { AuthSettings } from '@/lib/api/types/settings'

// Which sign-in methods the auth pages offer, from the settings' `auth` block alone (auth
// digest F0): never an assumed SMS, Telegram or Google, and never a method the block turns off,
// whatever `default_otp_methods` says (`disabledAuth()` keeps its `email` default). Pure.

/** The one-time code channels for an identifier type (login, registration, recovery alike). */
export interface CodeChannels {
  /** The code channels for this identifier type, in the API's order (email, sms, telegram). */
  otpChannels: OtpMethod[]
  /** Preselected: `default_otp_methods[type]` when it is on offer, else the first one. */
  defaultOtpChannel: OtpMethod | null
}

export interface LoginMethods extends CodeChannels {
  /** Password login. The API takes it for an email address and a mobile number alike. */
  password: boolean
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

/** The channels a code to an identifier of `type` can go by; none under `disabledAuth()`. */
export function codeChannels(auth: AuthSettings, type: ContactType): CodeChannels {
  if (!signInOpen(auth)) return { otpChannels: [], defaultOtpChannel: null }
  const otpChannels = auth.available_otp_methods.filter(
    (channel) => CHANNELS_FOR[type].includes(channel) && switchedOn(auth, channel),
  )
  const preferred = auth.default_otp_methods[type]
  const defaultOtpChannel =
    preferred !== undefined && otpChannels.includes(preferred)
      ? preferred
      : (otpChannels[0] ?? null)
  return { otpChannels, defaultOtpChannel }
}

/** The methods on offer for an identifier of `type`. */
export function loginMethods(auth: AuthSettings, type: ContactType): LoginMethods {
  return { password: signInOpen(auth), ...codeChannels(auth, type) }
}

/**
 * The channel in use: the visitor's choice while it is on offer, else the default. Null when
 * the identifier type has no channel at all.
 */
export function chosenChannel(channels: CodeChannels, chosen: OtpMethod | null): OtpMethod | null {
  return chosen && channels.otpChannels.includes(chosen) ? chosen : channels.defaultOtpChannel
}

/** The Google client id while Google login is on (it is null whenever it is off); else null. */
export function googleClientId(auth: AuthSettings): string | null {
  return auth.google_login_enabled && auth.google_client_id ? auth.google_client_id : null
}
