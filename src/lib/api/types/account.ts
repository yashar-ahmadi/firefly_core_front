/**
 * Wire types of the account API (auth-settings digest §3 and §4) as the browser receives them,
 * through the BFF. The BFF moves every token into httpOnly cookies and deletes `data.tokens`
 * (and the refresh endpoint's `data.access`) before answering, so no type here carries a token.
 * Pure types: safe in any bundle.
 */
import type { ContactType, OtpMethod } from '@/lib/api/types/settings'

export type { ContactType, OtpMethod }

/** `GET account/profile/me/`; also inside every signed-in answer. */
export interface UserProfile {
  uuid: string
  /** Not the email or phone, and never changes: do not show it as the login identifier. */
  username: string
  first_name: string
  last_name: string
  full_name: string
  /** null: no email yet («افزودن ایمیل»). */
  email: string | null
  /** E.164 (`+98912…`), display with `formatIranMobile`; null: no phone yet. */
  phone_number: string | null
  is_email_verified: boolean
  is_phone_verified: boolean
  /** Absolute URL of the (server-renamed) file. */
  avatar_picture: string | null
  /** ISO 8601 with the Tehran offset. */
  created: string
  is_totp_enabled: boolean
  /** false: an account made through Google, without a password («تعیین رمز عبور»). */
  has_usable_password: boolean
}

/**
 * Every "signed in" answer: login, OTP login, Google and registration complete. A 200 with
 * `requires_totp: true` is no login yet: `user` is null, and the same request goes again with
 * `totp_code`. The token pair is already in the cookies when this arrives.
 */
export interface AuthenticatedResponse {
  /** null only while `requires_totp`. */
  user: UserProfile | null
  requires_totp: boolean
  /** Echoed; always false while `requires_totp`, and for registration complete and Google. */
  remember_me: boolean
}

/** `POST account/auth/google/`: 201 for a new account, 200 for an existing one. */
export interface GoogleAuthResponse extends AuthenticatedResponse {
  /** null while `requires_totp`. */
  is_new_user: boolean | null
}

/** Any OTP send. Seconds: drive the countdowns from these, never from constants. */
export interface OtpSent {
  otp_method: OtpMethod
  /** How long the code is valid (300 on the dev server). */
  expires_in: number
  /** Until a new code may be asked for this destination (120 on the dev server). */
  resend_after: number
}

/** `register/start/` and `register/resend-otp/`. The token is valid for 30 minutes. */
export interface RegistrationStarted extends OtpSent {
  registration_token: string
}

/** `register/verify/`: the same token, now verified. */
export interface RegistrationVerified {
  registration_token: string
  register_method: ContactType
}

/** `password-reset/verify-otp/`: single use, valid for `expires_in` seconds (600). */
export interface PasswordResetToken {
  reset_token: string
  expires_in: number
}

/** `GET account/profile/totp/status/`. */
export interface TotpStatus {
  is_totp_enabled: boolean
}

/** `POST account/profile/totp/setup/`: a new secret each call; only the latest one enables. */
export interface TotpSetup {
  secret: string
  /** A `data:image/png;base64,…` URL, usable as an `<img src>` as it is. */
  qr_code: string
  /** `otpauth://totp/…`, for a deep link on phones. */
  provisioning_uri: string
}

/**
 * `data: {}`: logout, logout everywhere, TOTP enable and disable, password reset confirm, the
 * refresh endpoint and password change (once the BFF has taken their tokens).
 */
export type Empty = Record<string, never>

// Request bodies (auth-settings digest §4). OTP and TOTP codes are 6 digits; the API also
// accepts Persian and Arabic digits, but normalise them first for client-side validation.

/** `register/start/`: the identifier of the chosen method. */
export type RegisterStartBody = {
  first_name: string
  last_name: string
  /** Must suit the method (email: email; phone: sms or telegram); default from `auth`. */
  otp_method?: OtpMethod
} & (
  { register_method: 'email'; email: string } | { register_method: 'phone'; phone_number: string }
)

export interface RegisterVerifyBody {
  registration_token: string
  otp_code: string
}

/** Omit `otp_method` to reuse the channel. The API does not check it: offer suitable ones only. */
export interface RegisterResendBody {
  registration_token: string
  otp_method?: OtpMethod
}

export interface RegisterCompleteBody {
  registration_token: string
  password: string
  confirm_password: string
}

/** After `requires_totp`, the same body again with `totp_code`. */
export interface LoginBody {
  login_method: ContactType
  login_identifier: string
  password: string
  /** Refresh token for 30 days instead of 7. */
  remember_me: boolean
  totp_code?: string
}

export interface LoginOtpRequestBody {
  login_method: ContactType
  login_identifier: string
  otp_method?: OtpMethod
}

/** After `requires_totp`, the same body (the same `otp_code`) again with `totp_code`. */
export interface LoginOtpVerifyBody {
  login_method: ContactType
  login_identifier: string
  otp_code: string
  remember_me?: boolean
  totp_code?: string
}

/** The GIS credential (`id_token`, preferred) or an OAuth2 `access_token`. */
export type GoogleLoginBody = { totp_code?: string } & (
  { id_token: string; access_token?: never } | { access_token: string; id_token?: never }
)

/** The BFF adds this device's refresh token from its cookie. */
export interface LogoutBody {
  /** This device's push token, unregistered along. */
  registration_id?: string
}

/** `email` for an email address; `sms` or `telegram` for a phone number. */
export interface PasswordResetRequestBody {
  reset_method: OtpMethod
  login_identifier: string
}

export interface PasswordResetVerifyBody extends PasswordResetRequestBody {
  otp_code: string
}

export interface PasswordResetConfirmBody {
  reset_token: string
  password: string
  confirm_password: string
}

export interface PasswordChangeBody {
  /** Required unless `has_usable_password` is false. */
  current_password?: string
  password: string
  confirm_password: string
}

/** `PATCH account/profile/me/`: only what changes. An avatar goes as multipart. */
export interface ProfileChanges {
  first_name?: string
  last_name?: string
  /** JPEG, PNG or WEBP, at most 5 MB; null removes the picture (the field is nullable). */
  avatar_picture?: Blob | null
}

/**
 * `profile/contact/request/`, with the new value. `password` is required when the current
 * identifier of that type is verified and the account has a password; `totp_code` too when
 * two-step login is on.
 */
export type ContactRequestBody = {
  otp_method?: OtpMethod
  password?: string
  totp_code?: string
} & ({ contact_type: 'email'; email: string } | { contact_type: 'phone'; phone_number: string })

export interface ContactVerifyBody {
  contact_type: ContactType
  otp_code: string
}

/** TOTP enable and disable. */
export interface TotpCodeBody {
  totp_code: string
}
