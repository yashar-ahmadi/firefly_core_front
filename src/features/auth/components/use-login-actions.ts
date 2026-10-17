'use client'

import { useRef, useState, type Dispatch } from 'react'
import type { AuthenticatedResponse, ContactType, OtpMethod } from '@/lib/api/types/account'
import { authApi } from '../api'
import type { LoginMethods } from '../login-methods'
import { loginFailure } from './login-errors'
import type { LoginAction, LoginFailure, LoginState, PendingLogin } from './login-types'
import { useCompleteLogin } from './post-login'

const CODE_INCOMPLETE = 'کد ۶ رقمی را کامل وارد کنید.'

/** The moment a request answered: the reducer turns the API's seconds into deadlines with it. */
function failed(failure: LoginFailure): LoginAction {
  return { type: 'failed', failure, now: Date.now() }
}

function codeSent(sent: Extract<LoginAction, { type: 'otpSent' }>['sent']): LoginAction {
  return { type: 'otpSent', sent, now: Date.now() }
}

/** A 429's wait still runs for the step on screen: its main action is not sent. */
function waiting({ submitWait, step }: LoginState): boolean {
  return submitWait.step === step && submitWait.until > Date.now()
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
  /** The API said Google login is off (`auth_google_disabled`): the button goes. */
  googleOff: boolean
}

/** What each step's buttons do: one request at a time, its answer dispatched to the reducer. */
export function useLoginActions(context: LoginContext): LoginActions {
  const { state, dispatch, type, loginIdentifier, methods, channel, next, onSignedIn } = context
  const completeLogin = useCompleteLogin()
  const [googleOff, setGoogleOff] = useState(false)
  // Set at once (the state's `busy` only after a render), so a double press sends one request.
  const inFlight = useRef(false)

  /** Sends `request`; `done` gets its answer. A failure lands where `loginFailure` says. */
  async function run<T>(
    request: () => Promise<T>,
    done: (value: T) => Promise<void> | void,
    sending = false,
  ) {
    if (inFlight.current) return
    inFlight.current = true
    dispatch({ type: 'submit', sending })
    let value: T
    try {
      value = await request()
    } catch (error) {
      inFlight.current = false
      const failure = loginFailure(error)
      if (failure.code === 'auth_google_disabled') setGoogleOff(true)
      dispatch(failed(failure))
      return
    }
    await done(value)
  }

  /** Sends `request` (again with `totpCode` after a challenge): signed in, or asked for TOTP. */
  function signIn(request: PendingLogin, totpCode?: string) {
    if (waiting(state)) return
    const totp = totpCode === undefined ? {} : { totp_code: totpCode }
    const call = (): Promise<AuthenticatedResponse> => {
      if (request.kind === 'password') return authApi.login({ ...request.body, ...totp })
      if (request.kind === 'otp') return authApi.loginOtpVerify({ ...request.body, ...totp })
      return authApi.google({ ...request.body, ...totp })
    }
    void run(call, async (res) => {
      if (res.requires_totp) {
        inFlight.current = false
        dispatch({ type: 'needsTotp', request })
        return
      }
      // Stays in flight for good: the page is changing.
      dispatch({ type: 'signedIn' })
      onSignedIn?.()
      await completeLogin(res, next)
    })
  }

  function invalid(field: 'identifier' | 'password' | 'otp' | 'totp', detail: string) {
    dispatch({ type: 'invalid', field, detail })
  }

  return {
    googleOff,
    continueWithIdentifier() {
      if (state.identifier.trim() === '')
        return invalid('identifier', 'ایمیل یا شماره موبایل را وارد کنید.')
      if (type === null) {
        return invalid(
          'identifier',
          'ایمیل یا شماره موبایل را درست وارد کنید؛ مثلاً name@example.com یا ۰۹۱۲۳۴۵۶۷۸۹.',
        )
      }
      if (methods.password) return dispatch({ type: 'go', step: 'password' })
      if (methods.otpChannels.length > 0) return dispatch({ type: 'go', step: 'otp' })
      invalid(
        'identifier',
        `ورود با ${type === 'phone' ? 'شماره موبایل' : 'ایمیل'} در این فروشگاه ممکن نیست.`,
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
      void run(
        () => authApi.loginOtpRequest(body),
        (sent) => {
          inFlight.current = false
          dispatch(codeSent(sent))
        },
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
