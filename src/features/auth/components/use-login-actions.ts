'use client'

import { useState, type Dispatch } from 'react'
import type { AuthenticatedResponse, ContactType, OtpMethod } from '@/lib/api/types/account'
import { ApiError } from '@/lib/api/errors'
import { stepWaiting } from '@/lib/forms/waits'
import { authApi } from '../api'
import type { LoginMethods } from '../login-methods'
import { CODE_INCOMPLETE, IDENTIFIER_INVALID, IDENTIFIER_REQUIRED } from './auth-messages'
import { loginFailure } from './login-errors'
import type { LoginAction, LoginState, PendingLogin } from './login-types'
import { useCompleteLogin } from './post-login'
import { useRequestRunner } from './use-request-runner'

function codeSent(sent: Extract<LoginAction, { type: 'otpSent' }>['sent']): LoginAction {
  return { type: 'otpSent', sent, now: Date.now() }
}

export interface LoginContext {
  state: LoginState
  dispatch: Dispatch<LoginAction>
  /** The identifier's type; null while it is neither an email address nor a mobile number. */
  type: ContactType | null
  /** `normalizeIdentifier(state.identifier)`: what the API gets. */
  loginIdentifier: string
  methods: LoginMethods
  /** The code channel in use (the visitor's choice, else the settings' default). */
  channel: OtpMethod | null
  /** The raw `?next=`, for `completeLogin`. */
  next: string
  onSignedIn?: () => void
}

export interface LoginActions {
  continueWithIdentifier: () => void
  submitPassword: () => void
  sendCode: () => void
  submitCode: (code?: string) => void
  submitTotp: (code?: string) => void
  signInWithGoogle: (idToken: string) => void
  /**
   * The same Google token sent again: after `503 auth_google_unavailable` on the first step
   * (Google did not answer; nothing was said about the token, J-7). Null otherwise.
   */
  retryGoogle: (() => void) | null
  /** The API said Google login is off (`auth_google_disabled`): the button goes. */
  googleOff: boolean
}

/** What each step's buttons do: one request at a time, its answer dispatched to the reducer. */
export function useLoginActions(context: LoginContext): LoginActions {
  const { state, dispatch, type, loginIdentifier, methods, channel, next, onSignedIn } = context
  const completeLogin = useCompleteLogin()
  const [googleOff, setGoogleOff] = useState(false)
  /** The token Google's sign-in could not be checked with (Google unreachable), to send again. */
  const [unchecked, setUnchecked] = useState<string | null>(null)
  const run = useRequestRunner(dispatch, loginFailure)

  /** Sends `request` (again with `totpCode` after a challenge): signed in, or asked for TOTP. */
  function signIn(request: PendingLogin, totpCode?: string) {
    if (stepWaiting(state)) return
    const totp = totpCode === undefined ? {} : { totp_code: totpCode }
    const call = (): Promise<AuthenticatedResponse> => {
      if (request.kind === 'password') return authApi.login({ ...request.body, ...totp })
      if (request.kind === 'otp') return authApi.loginOtpVerify({ ...request.body, ...totp })
      return authApi.google({ ...request.body, ...totp }).catch((error: unknown) => {
        const code = error instanceof ApiError ? error.code : null
        if (code === 'auth_google_disabled') setGoogleOff(true)
        // Always 503, and the token was not judged: the same one goes again a little later. A
        // refused token is always 401 `auth_google_token_invalid`: a new one from the button.
        // On the TOTP step the step's own button sends the same token again.
        const sameAgain = code === 'auth_google_unavailable' && totpCode === undefined
        setUnchecked(sameAgain ? request.body.id_token : null)
        throw error
      })
    }
    run(call, async (res) => {
      if (res.requires_totp) return dispatch({ type: 'needsTotp', request })
      dispatch({ type: 'signedIn' })
      onSignedIn?.()
      await completeLogin(res, next)
      return 'leaving'
    })
  }

  function invalid(field: 'identifier' | 'password' | 'otp' | 'totp', detail: string) {
    dispatch({ type: 'invalid', field, detail })
  }

  return {
    googleOff,
    retryGoogle:
      unchecked === null ? null : () => signIn({ kind: 'google', body: { id_token: unchecked } }),
    continueWithIdentifier() {
      if (state.identifier.trim() === '') return invalid('identifier', IDENTIFIER_REQUIRED)
      if (type === null) return invalid('identifier', IDENTIFIER_INVALID)
      if (methods.password) return dispatch({ type: 'go', step: 'password' })
      if (methods.otpChannels.length > 0) return dispatch({ type: 'go', step: 'otp' })
      invalid(
        'identifier',
        `ورود با ${type === 'phone' ? 'شمارهٔ موبایل' : 'ایمیل'} در این فروشگاه ممکن نیست.`,
      )
    },
    submitPassword() {
      if (type === null) return
      if (state.password === '') return invalid('password', 'رمز عبور را وارد کنید.')
      signIn({
        kind: 'password',
        body: {
          login_method: type,
          login_identifier: loginIdentifier,
          password: state.password,
          remember_me: state.rememberMe,
        },
      })
    },
    sendCode() {
      if (type === null || channel === null) return
      const body = { login_method: type, login_identifier: loginIdentifier, otp_method: channel }
      run(
        () => authApi.loginOtpRequest(body),
        (sent) => dispatch(codeSent(sent)),
        true,
      )
    },
    submitCode(code = state.otpCode) {
      if (type === null) return
      if (code.length !== 6) return invalid('otp', CODE_INCOMPLETE)
      signIn({
        kind: 'otp',
        body: {
          login_method: type,
          login_identifier: loginIdentifier,
          otp_code: code,
          remember_me: state.rememberMe,
        },
      })
    },
    submitTotp(code = state.totpCode) {
      if (state.pending === null) return
      if (code.length !== 6) return invalid('totp', CODE_INCOMPLETE)
      signIn(state.pending, code)
    },
    signInWithGoogle(idToken) {
      signIn({ kind: 'google', body: { id_token: idToken } })
    },
  }
}
