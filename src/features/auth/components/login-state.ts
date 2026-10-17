import type { LoginBody, LoginOtpVerifyBody, OtpMethod, OtpSent } from '@/lib/api/types/account'

// The login page's state machine: identifier → (password | otp) → totp? → done. Pure: the
// component sends the requests and dispatches what they answered. Going back keeps every value
// typed; only a new identifier forgets the code sent to the old one.

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
  /** A 429's `retry_after`: the wait before sending a code again, or before the next TOTP. */
  retryAfter?: number | null
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
  /** Before the next TOTP code may be tried (`auth_totp_locked`). */
  totpWait: Wait
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

const STEP_OF: Record<LoginField, LoginStep> = {
  identifier: 'identifier',
  password: 'password',
  otp: 'otp',
  totp: 'totp',
}

const FIELD_OF_EDIT = {
  identifier: 'identifier',
  password: 'password',
  otpCode: 'otp',
  totpCode: 'totp',
} as const

const NO_WAIT: Wait = { until: 0, seq: 0 }

export function initialLoginState(identifier = ''): LoginState {
  return {
    step: 'identifier',
    identifier,
    password: '',
    rememberMe: false,
    otpChannel: null,
    otpCode: '',
    totpCode: '',
    otpSent: null,
    sends: 0,
    codeExpiry: NO_WAIT,
    sendWait: NO_WAIT,
    totpWait: NO_WAIT,
    pending: null,
    totpFrom: 'identifier',
    busy: false,
    sending: false,
    fieldErrors: {},
    notice: null,
    attempt: 0,
  }
}

/** A new wait of `seconds` from `now`; 0 seconds ends the previous one. */
function restartWait(previous: Wait, now: number, seconds: number): Wait {
  return { until: seconds > 0 ? now + seconds * 1000 : 0, seq: previous.seq + 1 }
}

function withoutError(errors: LoginState['fieldErrors'], field: LoginField) {
  if (!(field in errors)) return errors
  const rest = { ...errors }
  delete rest[field]
  return rest
}

/** The step a failure lands on, and what it changes there. */
function failed(state: LoginState, failure: LoginFailure, now: number): LoginState {
  const { field, detail, code, retryAfter, forgetCode, restart } = failure
  const step = field
    ? STEP_OF[field]
    : state.step === 'totp' && restart
      ? state.totpFrom
      : state.step
  const next: LoginState = {
    ...state,
    step,
    busy: false,
    sending: false,
    fieldErrors: field ? { [field]: detail } : {},
    notice: field ? null : { detail, code },
    attempt: state.attempt + 1,
  }
  if (state.step === 'totp' && step !== 'totp') next.pending = null
  if (field === 'totp' || step !== 'totp') next.totpCode = ''
  if (forgetCode) {
    next.otpSent = null
    next.otpCode = ''
  }
  if (retryAfter && retryAfter > 0) {
    if (step === 'otp') next.sendWait = restartWait(state.sendWait, now, retryAfter)
    if (step === 'totp') next.totpWait = restartWait(state.totpWait, now, retryAfter)
  }
  return next
}

export function loginReducer(state: LoginState, action: LoginAction): LoginState {
  switch (action.type) {
    case 'edit': {
      const fieldErrors = withoutError(state.fieldErrors, FIELD_OF_EDIT[action.field])
      const next = { ...state, [action.field]: action.value, fieldErrors }
      if (action.field !== 'identifier' || action.value === state.identifier) return next
      // Another identifier: the code (and the wait) belonged to the old one.
      return {
        ...next,
        otpSent: null,
        otpCode: '',
        sendWait: restartWait(state.sendWait, 0, 0),
        pending: null,
      }
    }
    case 'remember':
      return { ...state, rememberMe: action.value }
    case 'channel':
      return { ...state, otpChannel: action.value }
    case 'go':
      return { ...state, step: action.step, fieldErrors: {}, notice: null }
    case 'invalid':
      return {
        ...state,
        fieldErrors: { [action.field]: action.detail },
        notice: null,
        attempt: state.attempt + 1,
      }
    case 'submit':
      return {
        ...state,
        busy: true,
        sending: action.sending ?? false,
        fieldErrors: {},
        notice: null,
      }
    case 'otpSent':
      return {
        ...state,
        busy: false,
        sending: false,
        otpSent: action.sent,
        otpCode: '',
        sends: state.sends + 1,
        codeExpiry: restartWait(state.codeExpiry, action.now, action.sent.expires_in),
        sendWait: restartWait(state.sendWait, action.now, action.sent.resend_after),
      }
    case 'needsTotp':
      return {
        ...state,
        step: 'totp',
        totpFrom: state.step === 'totp' || state.step === 'done' ? state.totpFrom : state.step,
        pending: action.request,
        totpCode: '',
        busy: false,
        sending: false,
      }
    case 'back':
      if (state.step === 'totp') {
        return {
          ...state,
          step: state.totpFrom,
          pending: null,
          totpCode: '',
          fieldErrors: {},
          notice: null,
        }
      }
      return { ...state, step: 'identifier', fieldErrors: {}, notice: null }
    case 'signedIn':
      return { ...state, step: 'done', busy: true, fieldErrors: {}, notice: null }
    case 'failed':
      return failed(state, action.failure, action.now)
  }
}
