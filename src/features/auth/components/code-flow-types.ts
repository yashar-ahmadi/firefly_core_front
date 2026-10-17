import type { OtpSent } from '@/lib/api/types/account'
import type { AuthFailure } from './auth-failure'
import type { LoginNotice } from './login-types'
import type { StepWait, Wait } from './waits'

// The types of the state machine registration, password recovery and the profile's contact
// change share (code-flow-state.ts).

/**
 * `entry` (registration: the names and the identifier; recovery: the identifier; a contact
 * change: the new identifier and its proof) → `code` (the one-time code sent to it) →
 * `password` (not in a contact change) → `done` (the flow is over: the page or the form goes).
 */
export type CodeFlowStep = 'entry' | 'code' | 'password' | 'done'

/**
 * A field a message can be shown under; each belongs to one step. `currentPassword` and `totp`
 * are a contact change's proof (auth digest §4.17), on its first step.
 */
export type CodeFlowField =
  | 'firstName'
  | 'lastName'
  | 'identifier'
  | 'currentPassword'
  | 'totp'
  | 'otp'
  | 'password'
  | 'confirm'

/** The values typed after the first step. */
export type CodeFlowValue = 'otpCode' | 'password' | 'confirm'

export interface CodeFlowFailure extends AuthFailure<CodeFlowField> {
  /** Where a failure without a field lands, when not on the step on screen. */
  step?: CodeFlowStep
}

export interface CodeFlowState<E> {
  step: CodeFlowStep
  /** The first step's values (the identifier as typed, the channel chosen). */
  entry: E
  otpCode: string
  password: string
  confirm: string
  /** `registration_token` (from the start) or `reset_token` (from the code check). */
  token: string | null
  /** The first step's request the code (and token) answered: the same again goes on to it. */
  sentKey: string | null
  /** The last code sent, while it can still be used. */
  otpSent: OtpSent | null
  /** Codes sent so far: a new code gets a fresh field. */
  sends: number
  /** When the last code sent expires (`expires_in`). */
  codeExpiry: Wait
  /** Before the next code may be asked for: `resend_after`, or a 429's `retry_after`. */
  sendWait: Wait
  /** Before a step's main action may be sent again (a 429 on it). */
  submitWait: StepWait<CodeFlowStep>
  /** A request is on its way (and, once done, the page is changing). */
  busy: boolean
  /** That request asks for a code. */
  sending: boolean
  fieldErrors: Partial<Record<CodeFlowField, string>>
  /** The code of the failure shown under a field (some come with a way on). */
  errorCode: string | null
  /** `auth_password_weak`: each reason, shown under the password while it is in error. */
  reasons: string[]
  notice: LoginNotice | null
  /** Counts failures (checks included): each moves the focus to the field in error. */
  attempt: number
}

export type CodeFlowAction<E> =
  /**
   * A first-step change. `field`: its message goes. `destination`: the identifier (or its
   * kind) changed, so the code sent, its token and its wait belonged to another one.
   */
  | { type: 'entry'; changes: Partial<E>; field?: CodeFlowField; destination?: boolean }
  | { type: 'edit'; field: CodeFlowValue; value: string }
  /** Back to the first step («تغییر»), or on to the code already sent (the same first step). */
  | { type: 'go'; step: 'entry' | 'code' }
  /** Checks before any request; the first field in error takes the focus. */
  | { type: 'invalid'; errors: Partial<Record<CodeFlowField, string>> }
  | { type: 'submit'; sending?: boolean }
  /** A code went (the first step, or a resend); the start of a registration also has a token. */
  | { type: 'codeSent'; sent: OtpSent; now: number; token?: string; sentKey?: string }
  /** The code was right; recovery gets its `reset_token` here. */
  | { type: 'verified'; token?: string }
  | { type: 'done' }
  | { type: 'failed'; failure: CodeFlowFailure; now: number }
