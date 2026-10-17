import type { FailureRules } from '@/features/auth/components/auth-failure'
import { authFailure } from '@/features/auth/components/auth-failure'
import type { LoginNotice } from '@/features/auth/components/login-types'
import { NO_WAIT, restartWait, type Wait } from '@/lib/forms/waits'
import { ApiError } from '@/lib/api/errors'

// The state of a one-step form of the profile page (the names, the avatar, the password, the
// two-step login codes): what is on its way, the messages of the last answer, a 429's wait and
// the last save. The values typed stay with each form. Pure.

/** What a failed save means for its form (from `formFailure`). */
export interface FormFailure<F extends string> {
  /** Messages under fields: every field a validation error names, at once. */
  fields: Partial<Record<F, string>>
  /** The message for the whole form, when no field takes it. */
  notice: LoginNotice | null
  code: string
  /** A 429's `retry_after`: the form's button waits that long. */
  retryAfter: number | null
  /** `auth_password_weak`: every reason (`data.reasons`). */
  reasons: string[]
}

/** Where the API's codes and `attr`s go, by the rules of the auth pages (`authFailure`). */
export function formFailure<F extends string>(
  error: unknown,
  rules: Omit<FailureRules<F>, 'restart'>,
): FormFailure<F> {
  const failure = authFailure(error, { ...rules, restart: new Set() })
  const fields: Partial<Record<F, string>> = {}
  const byCode = error instanceof ApiError ? rules.byCode[error.code] : undefined
  if (byCode) {
    fields[byCode] = failure.detail
  } else if (error instanceof ApiError) {
    // A validation error may name several fields (`fieldErrors()`: the first message of each).
    for (const [attr, detail] of Object.entries(error.fieldErrors())) {
      const field = rules.byAttr[attr]
      if (field && fields[field] === undefined) fields[field] = detail
    }
  }
  const hasField = Object.keys(fields).length > 0
  return {
    fields,
    notice: hasField ? null : { detail: failure.detail, code: failure.code },
    code: failure.code,
    retryAfter: failure.retryAfter ?? null,
    reasons: failure.reasons ?? [],
  }
}

export interface FormState<F extends string> {
  /** A save is on its way. */
  busy: boolean
  fieldErrors: Partial<Record<F, string>>
  /** The code of the last failure, while its message shows. */
  errorCode: string | null
  /** `auth_password_weak`'s reasons, while the password is in error. */
  reasons: string[]
  notice: LoginNotice | null
  /** Before the form may be sent again (a 429). */
  submitWait: Wait
  /** Counts failures (checks included): each moves the focus to the first field in error. */
  attempt: number
  /** The last save's sentence, shown until the form changes again. */
  saved: string | null
}

export type FormAction<F extends string> =
  | { type: 'submit'; sending?: boolean }
  | { type: 'failed'; failure: FormFailure<F>; now: number }
  /** Checks before any request. */
  | { type: 'invalid'; errors: Partial<Record<F, string>> }
  /** A value changed: its message goes, and the last save's sentence. */
  | { type: 'edit'; field?: F }
  | { type: 'saved'; message: string }
  /** A request went through and nothing is said (the form moves on, e.g. to a setup step). */
  | { type: 'settled' }

export function initialFormState<F extends string>(): FormState<F> {
  return {
    busy: false,
    fieldErrors: {},
    errorCode: null,
    reasons: [],
    notice: null,
    submitWait: NO_WAIT,
    attempt: 0,
    saved: null,
  }
}

export function formReducer<F extends string>(
  state: FormState<F>,
  action: FormAction<F>,
): FormState<F> {
  switch (action.type) {
    case 'submit':
      return { ...state, busy: true, fieldErrors: {}, notice: null, saved: null }
    case 'failed': {
      const { fields, notice, code, retryAfter, reasons } = action.failure
      return {
        ...state,
        busy: false,
        fieldErrors: fields,
        errorCode: code,
        reasons,
        notice,
        submitWait:
          retryAfter && retryAfter > 0
            ? restartWait(state.submitWait, action.now, retryAfter)
            : state.submitWait,
        attempt: state.attempt + 1,
      }
    }
    case 'invalid':
      return {
        ...state,
        fieldErrors: action.errors,
        errorCode: null,
        reasons: [],
        notice: null,
        saved: null,
        attempt: state.attempt + 1,
      }
    case 'edit': {
      const { field } = action
      if (field === undefined || state.fieldErrors[field] === undefined) {
        return state.saved === null ? state : { ...state, saved: null }
      }
      const fieldErrors = { ...state.fieldErrors }
      delete fieldErrors[field]
      return { ...state, fieldErrors, reasons: [], saved: null }
    }
    case 'settled':
      return { ...state, busy: false }
    case 'saved':
      return {
        ...state,
        busy: false,
        fieldErrors: {},
        errorCode: null,
        reasons: [],
        notice: null,
        saved: action.message,
      }
  }
}
