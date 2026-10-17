'use client'

import { useRouter } from 'next/navigation'
import type { Dispatch } from 'react'
import { announce } from '@/components/ui/live-announcer'
import { notify, toastRegionReady } from '@/components/ui/toaster'
import type { ContactType, OtpMethod, PasswordResetRequestBody } from '@/lib/api/types/account'
import type { AuthSettings } from '@/lib/api/types/settings'
import { NO_WAIT, stepWaiting, type Wait } from '@/lib/forms/waits'
import { authApi } from '../api'
import { loginPageHref } from '../auth-links'
import { handOffIdentifier } from '../identifier-handoff'
import { identifierType, normalizeIdentifier } from '../identifier'
import { chosenChannel, codeChannels, type CodeChannels } from '../login-methods'
import {
  CODE_INCOMPLETE,
  IDENTIFIER_INVALID,
  IDENTIFIER_REQUIRED,
  newPasswordErrors,
} from './auth-messages'
import { recoveryFailure } from './code-flow-errors'
import type { CodeFlowAction, CodeFlowState } from './code-flow-types'
import { useRequestRunner } from './use-request-runner'

/** The first step of password recovery: the identifier as typed, and the channel chosen. */
export interface RecoveryEntry {
  identifier: string
  channel: OtpMethod | null
}

/** Said on `/login/`, where the visitor signs in with the new password. */
export const PASSWORD_CHANGED = 'رمز عبور تغییر کرد؛ دوباره وارد شوید'

const NO_CHANNELS: CodeChannels = { otpChannels: [], defaultOtpChannel: null }

/** No channel for this kind of identifier (a mobile number while SMS and Telegram are off). */
const NO_CHANNEL: Record<ContactType, string> = {
  email: 'بازیابی رمز عبور با ایمیل در این فروشگاه ممکن نیست؛ شماره موبایل حساب را وارد کنید.',
  phone: 'بازیابی رمز عبور با شماره موبایل در این فروشگاه ممکن نیست؛ ایمیل حساب را وارد کنید.',
}

export interface RecoveryContext {
  state: CodeFlowState<RecoveryEntry>
  dispatch: Dispatch<CodeFlowAction<RecoveryEntry>>
  auth: AuthSettings
  /** A safe `?next=` path, or '': carried to the login page. */
  next: string
}

export interface RecoveryActions {
  /** The identifier's type; null while it is neither an email address nor a mobile number. */
  type: ContactType | null
  /** `normalizeIdentifier` of it: what the API gets. */
  loginIdentifier: string
  channels: CodeChannels
  channel: OtpMethod | null
  /** Before «ارسال کد بازیابی» may send: none when it only goes back to the code sent. */
  requestWait: Wait
  request: () => void
  resend: () => void
  verify: (code?: string) => void
  confirm: () => void
}

/** What each recovery step's buttons do (auth digest F7), one request at a time. */
export function useRecoveryActions({
  state,
  dispatch,
  auth,
  next,
}: RecoveryContext): RecoveryActions {
  const router = useRouter()
  const run = useRequestRunner(dispatch, recoveryFailure)
  const type = identifierType(state.entry.identifier)
  const loginIdentifier = normalizeIdentifier(state.entry.identifier)
  // The code goes only to the kind of identifier typed (§4.12): no email for a mobile number.
  const channels = type ? codeChannels(auth, type) : NO_CHANNELS
  const channel = chosenChannel(channels, state.entry.channel)
  const body: PasswordResetRequestBody | null = channel && {
    reset_method: channel,
    login_identifier: loginIdentifier,
  }
  // The request as it would go now: the same as the last one sent goes on to its code.
  const unchanged = body !== null && JSON.stringify(body) === state.sentKey

  function send() {
    if (body === null) return
    const sentKey = JSON.stringify(body)
    run(
      () => authApi.passwordResetRequest(body),
      (sent) => dispatch({ type: 'codeSent', sent, now: Date.now(), sentKey }),
      true,
    )
  }

  return {
    type,
    loginIdentifier,
    channels,
    channel,
    requestWait: unchanged ? NO_WAIT : state.sendWait,
    request() {
      const { identifier } = state.entry
      const invalid = (detail: string) =>
        dispatch({ type: 'invalid', errors: { identifier: detail } })
      if (identifier.trim() === '') return invalid(IDENTIFIER_REQUIRED)
      if (type === null) return invalid(IDENTIFIER_INVALID)
      if (channel === null) return invalid(NO_CHANNEL[type])
      if (unchanged) return dispatch({ type: 'go', step: 'code' })
      if (state.sendWait.until > Date.now()) return
      send()
    },
    resend: send,
    verify(code = state.otpCode) {
      // Checked by the channel the code went by (a Telegram code is checked by Telegram).
      const method = state.otpSent?.otp_method ?? channel
      if (method === null) return
      if (code.length !== 6) return dispatch({ type: 'invalid', errors: { otp: CODE_INCOMPLETE } })
      if (stepWaiting(state)) return
      const verifyBody = { reset_method: method, login_identifier: loginIdentifier, otp_code: code }
      run(
        () => authApi.passwordResetVerifyOtp(verifyBody),
        (reset) => dispatch({ type: 'verified', token: reset.reset_token }),
      )
    },
    confirm() {
      const { token } = state
      if (token === null) return
      const errors = newPasswordErrors(state.password, state.confirm)
      if (Object.keys(errors).length > 0) return dispatch({ type: 'invalid', errors })
      if (stepWaiting(state)) return
      const confirmBody = {
        reset_token: token,
        password: state.password,
        confirm_password: state.confirm,
      }
      run(
        () => authApi.passwordResetConfirm(confirmBody),
        () => {
          // Every session was revoked and no tokens came back: sign in again, prefilled (the
          // identifier handed over, never in the URL).
          dispatch({ type: 'done' })
          notify.success(PASSWORD_CHANGED)
          if (!toastRegionReady()) announce(PASSWORD_CHANGED)
          handOffIdentifier('/login/', loginIdentifier)
          router.replace(loginPageHref(next))
          return 'leaving'
        },
      )
    },
  }
}
