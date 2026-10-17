'use client'

import type { Dispatch } from 'react'
import { useMarkFeatureDisabled } from '@/features/settings/feature-context'
import { ApiError } from '@/lib/api/errors'
import type { ContactType, OtpMethod, RegisterStartBody } from '@/lib/api/types/account'
import type { AuthSettings } from '@/lib/api/types/settings'
import { authApi } from '../api'
import { identifierType, normalizeIdentifier } from '../identifier'
import { chosenChannel, codeChannels, type CodeChannels } from '../login-methods'
import { CODE_INCOMPLETE, newPasswordErrors } from './auth-messages'
import { registerFailure } from './code-flow-errors'
import type { CodeFlowAction, CodeFlowField, CodeFlowState } from './code-flow-types'
import { useCompleteLogin } from './post-login'
import { useRequestRunner } from './use-request-runner'
import { NO_WAIT, stepWaiting, type Wait } from './waits'

/** The first step of registration. Each method keeps what was typed for it (the tabs). */
export interface RegisterEntry {
  firstName: string
  lastName: string
  method: ContactType
  email: string
  phone: string
  /** The visitor's choice of channel; null: the settings' default. */
  channel: OtpMethod | null
}

type Errors = Partial<Record<CodeFlowField, string>>

const MESSAGES: Record<ContactType, { required: string; invalid: string; closed: string }> = {
  email: {
    required: 'ایمیل را وارد کنید.',
    invalid: 'ایمیل را درست وارد کنید؛ مثلاً name@example.com.',
    closed: 'ثبت‌نام با ایمیل در این فروشگاه ممکن نیست.',
  },
  phone: {
    required: 'شماره موبایل را وارد کنید.',
    invalid: 'شماره موبایل را درست وارد کنید؛ مثلاً ۰۹۱۲۳۴۵۶۷۸۹.',
    closed: 'ثبت‌نام با شماره موبایل در این فروشگاه ممکن نیست.',
  },
}

/** The checks of the first step, every field at once. */
function startErrors(entry: RegisterEntry, channel: OtpMethod | null): Errors {
  const errors: Errors = {}
  if (entry.firstName.trim() === '') errors.firstName = 'نام را وارد کنید.'
  if (entry.lastName.trim() === '') errors.lastName = 'نام خانوادگی را وارد کنید.'
  const identifier = entry[entry.method]
  const messages = MESSAGES[entry.method]
  if (identifier.trim() === '') errors.identifier = messages.required
  else if (identifierType(identifier) !== entry.method) errors.identifier = messages.invalid
  else if (channel === null) errors.identifier = messages.closed
  return errors
}

function startBody(entry: RegisterEntry, channel: OtpMethod): RegisterStartBody {
  const names = {
    first_name: entry.firstName.trim(),
    last_name: entry.lastName.trim(),
    otp_method: channel,
  }
  return entry.method === 'email'
    ? { ...names, register_method: 'email', email: normalizeIdentifier(entry.email) }
    : { ...names, register_method: 'phone', phone_number: normalizeIdentifier(entry.phone) }
}

export interface RegisterContext {
  state: CodeFlowState<RegisterEntry>
  dispatch: Dispatch<CodeFlowAction<RegisterEntry>>
  auth: AuthSettings
  /** The `?next=` (a safe path, or ''), for `completeLogin`. */
  next: string
  onSignedIn?: () => void
}

export interface RegisterActions {
  /** The channels of the chosen method. */
  channels: CodeChannels
  /** The channel in use (the visitor's choice, else the settings' default). */
  channel: OtpMethod | null
  /** Before the first step's button may send: none when it only goes back to the code sent. */
  startWait: Wait
  start: () => void
  resend: () => void
  verify: (code?: string) => void
  complete: () => void
}

/** What each registration step's buttons do (auth digest F1), one request at a time. */
export function useRegisterActions(context: RegisterContext): RegisterActions {
  const { state, dispatch, auth, next, onSignedIn } = context
  const completeLogin = useCompleteLogin()
  const markFeatureDisabled = useMarkFeatureDisabled()
  const run = useRequestRunner(dispatch, registerFailure)
  const { entry, token } = state
  const channels = codeChannels(auth, entry.method)
  const channel = chosenChannel(channels, entry.channel)
  /** The start request as it would go now: the same as the last one sent goes on to its code. */
  const startKey = channel === null ? null : JSON.stringify(startBody(entry, channel))
  const unchanged = startKey !== null && startKey === state.sentKey

  return {
    channels,
    channel,
    startWait: unchanged ? NO_WAIT : state.sendWait,
    start() {
      const errors = startErrors(entry, channel)
      if (channel === null || Object.keys(errors).length > 0) {
        return dispatch({ type: 'invalid', errors })
      }
      if (unchanged) return dispatch({ type: 'go', step: 'code' })
      if (state.sendWait.until > Date.now()) return
      const body = startBody(entry, channel)
      const request = () =>
        authApi.registerStart(body).catch((error: unknown) => {
          // Registration was switched off: the page says so in place of the form.
          if (error instanceof ApiError && error.isFeatureDisabled()) {
            markFeatureDisabled('registration', error.detail)
          }
          throw error
        })
      run(
        request,
        (sent) => {
          const sentKey = JSON.stringify(body)
          const now = Date.now()
          dispatch({ type: 'codeSent', sent, now, token: sent.registration_token, sentKey })
        },
        true,
      )
    },
    resend() {
      if (token === null || channel === null) return
      // Only a channel the identifier can take: the API does not check it (digest §13 #1).
      const body = { registration_token: token, otp_method: channel }
      const sentKey = JSON.stringify(startBody(entry, channel))
      run(
        () => authApi.registerResendOtp(body),
        (sent) => {
          const now = Date.now()
          dispatch({ type: 'codeSent', sent, now, token: sent.registration_token, sentKey })
        },
        true,
      )
    },
    verify(code = state.otpCode) {
      if (token === null) return
      if (code.length !== 6) return dispatch({ type: 'invalid', errors: { otp: CODE_INCOMPLETE } })
      if (stepWaiting(state)) return
      run(
        () => authApi.registerVerify({ registration_token: token, otp_code: code }),
        (verified) => dispatch({ type: 'verified', token: verified.registration_token }),
      )
    },
    complete() {
      if (token === null) return
      const errors = newPasswordErrors(state.password, state.confirm)
      if (Object.keys(errors).length > 0) return dispatch({ type: 'invalid', errors })
      if (stepWaiting(state)) return
      const body = {
        registration_token: token,
        password: state.password,
        confirm_password: state.confirm,
      }
      run(
        () => authApi.registerComplete(body),
        async (res) => {
          dispatch({ type: 'done' })
          onSignedIn?.()
          await completeLogin(res, next)
          return 'leaving' as const
        },
      )
    },
  }
}
