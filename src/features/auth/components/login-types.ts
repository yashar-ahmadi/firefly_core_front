import type { LoginBody, LoginOtpVerifyBody, OtpMethod, OtpSent } from '@/lib/api/types/account'

// The login state machine's types (see login-state.ts).

export type LoginStep = 'identifier' | 'password' | 'otp' | 'totp' | 'done'
/** A field a message can be shown under; each belongs to one step. */
export type LoginField = 'identifier' | 'password' | 'otp' | 'totp'
type FirstStep = 'identifier' | 'password' | 'otp'

/** The request a TOTP challenge answered: sent again as it was, plus `totp_code`. */
export type PendingLogin =
  | { kind: 'password'; body: LoginBody }
  | { kind: 'otp'; body: LoginOtpVerifyBody }
  | { kind: 'google'; body: { id_token: string } }

/** A message for the whole step; `code` picks its call to action (register, for one). */
export interface LoginNotice {
  detail: string
  code: string
}

/** What a failed request means for the form (see `loginFailure`). */
export interface LoginFailure {
  /** Shown under this field, on its step; without one, a notice on the current step. */
  field?: LoginField
  detail: string
  code: string
  /** A 429's `retry_after`: the wait before the step's main action, or before the next send. */
  retryAfter?: number | null
  /** The wait is for a new code (a send was refused, or the code is spent), not the step. */
  sendSide?: boolean
  /** The code sent is void (or there is none): a new one must be asked for. */
  forgetCode?: boolean
  /** On the TOTP step: the first request cannot succeed any more; go back to its step. */
  restart?: boolean
}

/**
 * A wait that ends at `until` (epoch ms; 0: no wait). An absolute time, so a timer shown again
 * later (back on the step, another phase) shows what is left; `seq` tells each new wait apart.
 */
export interface Wait {
  until: number
  seq: number
}

/** A wait that blocks one step's main action (a 429 on it). */
export interface StepWait extends Wait {
  step: LoginStep
}

export interface LoginState {
  step: LoginStep
  /** As typed (the API gets `normalizeIdentifier` of it). */
  identifier: string
  password: string
  rememberMe: boolean
  /** The visitor's choice of channel; null: the settings' default. */
  otpChannel: OtpMethod | null
  otpCode: string
  totpCode: string
  /** The last code sent, while it can still be used. */
  otpSent: OtpSent | null
  /** Codes sent so far: a new code gets a fresh field. */
  sends: number
  /** When the last code sent expires (`expires_in`). */
  codeExpiry: Wait
  /** Before the next code may be asked for: `resend_after`, or a 429's `retry_after`. */
  sendWait: Wait
  /** Before the step's main action may be sent again (a 429: throttled, `auth_totp_locked`). */
  submitWait: StepWait
  pending: PendingLogin | null
  /** Where the TOTP step goes back to. */
  totpFrom: FirstStep
  /** A request is on its way (and, once done, the page is changing). */
  busy: boolean
  /** That request asks for a code (its button shows the spinner, not the step's main one). */
  sending: boolean
  fieldErrors: Partial<Record<LoginField, string>>
  notice: LoginNotice | null
  /** Counts failures (checks included): each moves the focus to the field in error. */
  attempt: number
}

export type LoginAction =
  | { type: 'edit'; field: 'identifier' | 'password' | 'otpCode' | 'totpCode'; value: string }
  | { type: 'remember'; value: boolean }
  | { type: 'channel'; value: OtpMethod }
  | { type: 'go'; step: FirstStep }
  /** A check before any request (an empty or malformed identifier). */
  | { type: 'invalid'; field: LoginField; detail: string }
  | { type: 'submit'; sending?: boolean }
  | { type: 'otpSent'; sent: OtpSent; now: number }
  | { type: 'needsTotp'; request: PendingLogin }
  | { type: 'back' }
  | { type: 'signedIn' }
  | { type: 'failed'; failure: LoginFailure; now: number }
