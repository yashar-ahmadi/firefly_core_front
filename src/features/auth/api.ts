import { bffFetch } from '@/lib/api/client'
import { fetchProfile, type ReadOptions } from './profile-api'
import type {
  AuthenticatedResponse,
  ContactRequestBody,
  ContactVerifyBody,
  Empty,
  GoogleAuthResponse,
  GoogleLoginBody,
  LoginBody,
  LoginOtpRequestBody,
  LoginOtpVerifyBody,
  LogoutBody,
  OtpSent,
  PasswordChangeBody,
  PasswordResetConfirmBody,
  PasswordResetRequestBody,
  PasswordResetToken,
  PasswordResetVerifyBody,
  ProfileChanges,
  RegisterCompleteBody,
  RegisterResendBody,
  RegisterStartBody,
  RegisterVerifyBody,
  RegistrationStarted,
  RegistrationVerified,
  TotpCodeBody,
  TotpSetup,
  TotpStatus,
  UserProfile,
} from '@/lib/api/types/account'

// The auth endpoints (auth-settings digest §4), one function each, through the BFF: it adds the
// API key, keeps the tokens in httpOnly cookies (none reaches the browser) and sends the visitor's
// IP, so the throttles count per visitor. Each resolves with the answer's `data` and rejects with
// the `ApiError` as it comes: show `detail`, branch on `code`, wait `retryAfter` on a 429.

async function post<T>(path: string, body?: object): Promise<T> {
  const options = body === undefined ? { method: 'POST' } : { body }
  return (await bffFetch<T>(path, options)).data
}

async function get<T>(path: string, { signal }: ReadOptions = {}): Promise<T> {
  return (await bffFetch<T>(path, { signal })).data
}

/**
 * Names (and an avatar's removal, `null`) as JSON; with an avatar file, everything as multipart
 * (the browser sets the boundary).
 */
async function patchProfile(changes: ProfileChanges): Promise<UserProfile> {
  const { avatar_picture: avatar, ...names } = changes
  if (!(avatar instanceof Blob)) {
    const body = avatar === null ? { ...names, avatar_picture: null } : names
    return (await bffFetch<UserProfile>('account/profile/me/', { method: 'PATCH', body })).data
  }
  const form = new FormData()
  for (const [key, value] of Object.entries(names)) if (value !== undefined) form.set(key, value)
  form.set('avatar_picture', avatar)
  return (await bffFetch<UserProfile>('account/profile/me/', { method: 'PATCH', formData: form }))
    .data
}

export const authApi = {
  // Registration (F1)
  registerStart: (body: RegisterStartBody) =>
    post<RegistrationStarted>('account/auth/register/start/', body),
  registerVerify: (body: RegisterVerifyBody) =>
    post<RegistrationVerified>('account/auth/register/verify/', body),
  registerResendOtp: (body: RegisterResendBody) =>
    post<RegistrationStarted>('account/auth/register/resend-otp/', body),
  /** 201; signed in at once (`remember_me` is always false here). */
  registerComplete: (body: RegisterCompleteBody) =>
    post<AuthenticatedResponse>('account/auth/register/complete/', body),

  // Login (F2–F4): a 200 with `requires_totp` is a second step, not a login.
  login: (body: LoginBody) => post<AuthenticatedResponse>('account/auth/login/', body),
  loginOtpRequest: (body: LoginOtpRequestBody) =>
    post<OtpSent>('account/auth/login/otp/request/', body),
  loginOtpVerify: (body: LoginOtpVerifyBody) =>
    post<AuthenticatedResponse>('account/auth/login/otp/verify/', body),
  google: (body: GoogleLoginBody) => post<GoogleAuthResponse>('account/auth/google/', body),

  // Session (F5, F6). The BFF refreshes the access token by itself before calls; `refresh`
  // only renews it now (the refresh cookie is sent by the BFF, the answer carries nothing).
  refresh: () => post<Empty>('account/auth/token/refresh/'),
  /** This device only; the BFF sends its refresh token and clears the cookies whatever the answer. */
  logout: (body: LogoutBody = {}) => post<Empty>('account/auth/logout/', body),
  /** Every device, and every push registration of the account. */
  logoutAll: () => post<Empty>('account/auth/logout-all/'),

  // Forgot password (F7): no tokens; every session is revoked, so login comes next.
  passwordResetRequest: (body: PasswordResetRequestBody) =>
    post<OtpSent>('account/auth/password-reset/request/', body),
  passwordResetVerifyOtp: (body: PasswordResetVerifyBody) =>
    post<PasswordResetToken>('account/auth/password-reset/verify-otp/', body),
  passwordResetConfirm: (body: PasswordResetConfirmBody) =>
    post<Empty>('account/auth/password-reset/confirm/', body),

  // Profile (F8, F9, F11)
  /** The new token pair it returns is kept by the BFF (7 days); other sessions are revoked. */
  passwordChange: (body: PasswordChangeBody) =>
    post<Empty>('account/profile/password/change/', body),
  me: fetchProfile,
  updateMe: patchProfile,
  contactRequest: (body: ContactRequestBody) =>
    post<OtpSent>('account/profile/contact/request/', body),
  /** The updated profile: replace `['me']` with it. */
  contactVerify: (body: ContactVerifyBody) =>
    post<UserProfile>('account/profile/contact/verify/', body),

  // Two-step login with an authenticator app (F10)
  totpStatus: (options?: ReadOptions) => get<TotpStatus>('account/profile/totp/status/', options),
  /** A new secret on every call: only the latest QR code enables. */
  totpSetup: () => post<TotpSetup>('account/profile/totp/setup/'),
  totpEnable: (body: TotpCodeBody) => post<Empty>('account/profile/totp/enable/', body),
  totpDisable: (body: TotpCodeBody) => post<Empty>('account/profile/totp/disable/', body),
}
