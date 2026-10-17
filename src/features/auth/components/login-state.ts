import type {
  LoginAction,
  LoginFailure,
  LoginField,
  LoginState,
  LoginStep,
  Wait,
} from './login-types'

// The login page's state machine: identifier → (password | otp) → totp? → done. Pure: the
// component sends the requests and dispatches what they answered. Going back keeps every value
// typed; only a new identifier forgets the code sent to the old one.

export type {
  LoginAction,
  LoginFailure,
  LoginField,
  LoginNotice,
  LoginState,
  LoginStep,
  PendingLogin,
  StepWait,
  Wait,
} from './login-types'

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
    submitWait: { ...NO_WAIT, step: 'identifier' },
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
  const { field, detail, code, retryAfter, forgetCode, restart, sendSide } = failure
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
  // A code in error is typed again from scratch: kept, each new digit would send it once more.
  if (field === 'totp' || step !== 'totp') next.totpCode = ''
  if (field === 'otp') next.otpCode = ''
  if (forgetCode) {
    next.otpSent = null
    next.otpCode = ''
  }
  if (retryAfter && retryAfter > 0) {
    if (state.sending || sendSide) next.sendWait = restartWait(state.sendWait, now, retryAfter)
    else next.submitWait = { ...restartWait(state.submitWait, now, retryAfter), step }
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
      // Nothing secret stays in memory once it has served (the password, a code, a token).
      return {
        ...state,
        step: 'done',
        busy: true,
        password: '',
        otpCode: '',
        totpCode: '',
        pending: null,
        fieldErrors: {},
        notice: null,
      }
    case 'failed':
      return failed(state, action.failure, action.now)
  }
}
