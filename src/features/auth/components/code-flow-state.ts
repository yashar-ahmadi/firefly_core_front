import type {
  CodeFlowAction,
  CodeFlowFailure,
  CodeFlowField,
  CodeFlowState,
  CodeFlowStep,
  CodeFlowValue,
} from './code-flow-types'
import { failureWaits, NO_WAIT, restartWait } from '@/lib/forms/waits'

// The state machine of registration and password recovery (entry → code → password → done),
// and of a contact change (entry → code → done). Pure: the flows send the requests and dispatch
// what they answered. Going back keeps every value typed; only a new identifier forgets the code
// (and token) sent for the old one.

const STEP_OF: Record<CodeFlowField, CodeFlowStep> = {
  firstName: 'entry',
  lastName: 'entry',
  identifier: 'entry',
  currentPassword: 'entry',
  totp: 'entry',
  otp: 'code',
  password: 'password',
  confirm: 'password',
}

const FIELD_OF_VALUE: Record<CodeFlowValue, CodeFlowField> = {
  otpCode: 'otp',
  password: 'password',
  confirm: 'confirm',
}

export function initialCodeFlowState<E>(entry: E): CodeFlowState<E> {
  return {
    step: 'entry',
    entry,
    otpCode: '',
    password: '',
    confirm: '',
    token: null,
    sentKey: null,
    otpSent: null,
    sends: 0,
    codeExpiry: NO_WAIT,
    sendWait: NO_WAIT,
    submitWait: { ...NO_WAIT, step: 'entry' },
    busy: false,
    sending: false,
    fieldErrors: {},
    errorCode: null,
    reasons: [],
    notice: null,
    attempt: 0,
  }
}

function withoutError<E>(state: CodeFlowState<E>, field: CodeFlowField | undefined) {
  if (field === undefined || !(field in state.fieldErrors)) return state.fieldErrors
  const rest = { ...state.fieldErrors }
  delete rest[field]
  return rest
}

/** The step a failure lands on, and what it changes there. */
function failed<E>(state: CodeFlowState<E>, failure: CodeFlowFailure, now: number) {
  const { field, detail, code, restart, forgetCode, reasons } = failure
  const step: CodeFlowStep = restart
    ? 'entry'
    : field
      ? STEP_OF[field]
      : (failure.step ?? state.step)
  const next: CodeFlowState<E> = {
    ...state,
    step,
    busy: false,
    sending: false,
    fieldErrors: field ? { [field]: detail } : {},
    errorCode: field ? code : null,
    reasons: field === 'password' ? (reasons ?? []) : [],
    notice: field ? null : { detail, code },
    attempt: state.attempt + 1,
  }
  // A code in error is typed again from scratch: kept, each new digit would send it once more.
  if (field === 'otp') next.otpCode = ''
  if (forgetCode || restart) {
    next.otpSent = null
    next.otpCode = ''
  }
  // The token is void (unknown, expired, used): the first step makes a new one.
  if (restart) {
    next.token = null
    next.sentKey = null
  }
  return { ...next, ...failureWaits(state, failure, step, now) }
}

export function codeFlowReducer<E>(
  state: CodeFlowState<E>,
  action: CodeFlowAction<E>,
): CodeFlowState<E> {
  switch (action.type) {
    case 'entry': {
      const next = {
        ...state,
        entry: { ...state.entry, ...action.changes },
        fieldErrors: withoutError(state, action.field),
      }
      if (!action.destination) return next
      return {
        ...next,
        token: null,
        sentKey: null,
        otpSent: null,
        otpCode: '',
        sendWait: restartWait(state.sendWait, 0, 0),
      }
    }
    case 'edit': {
      const field = FIELD_OF_VALUE[action.field]
      return {
        ...state,
        [action.field]: action.value,
        fieldErrors: withoutError(state, field),
        reasons: field === 'password' ? [] : state.reasons,
      }
    }
    case 'go':
      return { ...state, step: action.step, fieldErrors: {}, notice: null }
    case 'invalid':
      return {
        ...state,
        fieldErrors: action.errors,
        errorCode: null,
        reasons: [],
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
    case 'codeSent':
      return {
        ...state,
        step: 'code',
        busy: false,
        sending: false,
        token: action.token ?? state.token,
        sentKey: action.sentKey ?? state.sentKey,
        otpSent: action.sent,
        otpCode: '',
        sends: state.sends + 1,
        codeExpiry: restartWait(state.codeExpiry, action.now, action.sent.expires_in),
        sendWait: restartWait(state.sendWait, action.now, action.sent.resend_after),
      }
    case 'verified':
      return {
        ...state,
        step: 'password',
        busy: false,
        token: action.token ?? state.token,
        otpCode: '',
      }
    case 'done':
      // Nothing secret stays in memory once it has served (the passwords, a code, a token), nor
      // anything of the code sent.
      return {
        ...state,
        step: 'done',
        busy: true,
        otpCode: '',
        password: '',
        confirm: '',
        token: null,
        sentKey: null,
        otpSent: null,
        fieldErrors: {},
        notice: null,
      }
    case 'failed':
      return failed(state, action.failure, action.now)
  }
}
