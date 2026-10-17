'use client'

import type { Dispatch } from 'react'
import { authApi } from '@/features/auth/api'
import { CODE_INCOMPLETE } from '@/features/auth/components/auth-messages'
import { contactFailure } from '@/features/auth/components/code-flow-errors'
import type { CodeFlowAction, CodeFlowState } from '@/features/auth/components/code-flow-types'
import { NO_WAIT, stepWaiting, type Wait } from '@/lib/forms/waits'
import { chosenChannel, type CodeChannels } from '@/features/auth/login-methods'
import type {
  ContactRequestBody,
  ContactType,
  OtpMethod,
  UserProfile,
} from '@/lib/api/types/account'
import {
  contactErrors,
  normalizeContact,
  type ContactEntry,
  type ContactProof,
} from './contact-rules'
import { useProfileRunner } from './use-profile-runner'

export interface ContactContext {
  type: ContactType
  state: CodeFlowState<ContactEntry>
  dispatch: Dispatch<CodeFlowAction<ContactEntry>>
  /** The channels a code to this type can go by (at least one: else no change is offered). */
  channels: CodeChannels
  proof: ContactProof
  /** The code was right: the updated profile. */
  onVerified: (profile: UserProfile) => void
}

export interface ContactActions {
  channel: OtpMethod | null
  /** Before «ارسال کد تأیید» may send: none when it only goes back to the code sent. */
  requestWait: Wait
  request: () => void
  resend: () => void
  verify: (code?: string) => void
}

/**
 * What each step of a contact change does (auth digest F9), one request at a time, on the
 * registration and recovery state machine (`codeFlowReducer`): the request (the new value and
 * its proof) sends a code to the new address; the code changes the account.
 *
 * There is no resend endpoint: a new code is the same request again. An authenticator's code
 * works once, so with two-step login on, «ارسال مجدد کد» goes back to the first step for the
 * next one (the password stays typed).
 */
export function useContactActions(context: ContactContext): ContactActions {
  const { type, state, dispatch, channels, proof, onVerified } = context
  const run = useProfileRunner(dispatch, contactFailure)
  const { entry } = state
  const channel = chosenChannel(channels, entry.channel)
  const value = normalizeContact(type, entry.value)
  // What decides where the code goes (never the proof): the same again is the code sent.
  const sentKey = channel && value ? JSON.stringify([type, value, channel]) : null
  const unchanged = sentKey !== null && sentKey === state.sentKey

  function send() {
    if (channel === null || value === null || sentKey === null) return
    const proofs = {
      ...(proof.password && { password: entry.password }),
      ...(proof.totp && { totp_code: entry.totpCode }),
    }
    const body: ContactRequestBody =
      type === 'email'
        ? { contact_type: 'email', email: value, otp_method: channel, ...proofs }
        : { contact_type: 'phone', phone_number: value, otp_method: channel, ...proofs }
    run(
      () =>
        authApi.contactRequest(body).finally(() => {
          // Once the API has checked the proof (before it sends or refuses to send the code),
          // the authenticator's code is spent. A request refused earlier (an identifier taken)
          // did not use it, but the form cannot tell which: after any answer, the next request
          // asks for the next code.
          if (proof.totp) dispatch({ type: 'entry', changes: { totpCode: '', totpUsed: true } })
        }),
      (sent) => dispatch({ type: 'codeSent', sent, now: Date.now(), sentKey }),
      true,
    )
  }

  return {
    channel,
    requestWait: unchanged ? NO_WAIT : state.sendWait,
    request() {
      if (unchanged) return dispatch({ type: 'go', step: 'code' })
      const errors = contactErrors(type, entry, proof)
      if (Object.keys(errors).length > 0) return dispatch({ type: 'invalid', errors })
      if (state.sendWait.until > Date.now()) return
      send()
    },
    resend() {
      if (!proof.totp) return send()
      // A fresh request from the first step: the code sent so far is forgotten with it.
      dispatch({ type: 'entry', changes: { totpCode: '' }, destination: true })
      dispatch({ type: 'go', step: 'entry' })
    },
    verify(code = state.otpCode) {
      if (code.length !== 6) return dispatch({ type: 'invalid', errors: { otp: CODE_INCOMPLETE } })
      if (stepWaiting(state)) return
      run(
        () => authApi.contactVerify({ contact_type: type, otp_code: code }),
        (profile) => {
          dispatch({ type: 'done' })
          onVerified(profile)
          return 'leaving'
        },
      )
    },
  }
}
