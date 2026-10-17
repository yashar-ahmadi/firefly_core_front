'use client'

import { useReducer, useRef } from 'react'
import { useFeature } from '@/features/settings/feature-context'
import { loginPageHref } from '../auth-links'
import { useAuthSettings } from '../use-auth-settings'
import { TransitionCard } from './auth-card'
import { codeFlowReducer, initialCodeFlowState } from './code-flow-state'
import { LoginNoticeAlert } from './login-fields'
import { NewPasswordStep } from './new-password-step'
import { OtpStep } from './otp-step'
import { RecoveryIdentifierStep } from './recovery-identifier-step'
import { useRecoveryActions, type RecoveryEntry } from './use-recovery-actions'
import { useStepFocus } from './use-step-focus'
import { stepWait } from './waits'

export interface ForgotPasswordFlowProps {
  /** A safe `?next=` path, or '': carried to the login page afterwards. */
  next: string
  /** Prefilled (normalised): handed over by the login page's «فراموشی رمز عبور». */
  initialIdentifier: string
  /** Focus the first field at once: the form took the place of another view of the page. */
  autoFocus?: boolean
}

/**
 * Password recovery (auth digest F7): the identifier (and the channel when there is a choice)
 * → the code → a new password → `/login/`, prefilled, with a toast: every session was revoked
 * and no tokens come back, so the visitor signs in again.
 */
export function ForgotPasswordFlow({
  next,
  initialIdentifier,
  autoFocus = false,
}: ForgotPasswordFlowProps) {
  const auth = useAuthSettings()
  const registration = useFeature('registration')
  const [state, dispatch] = useReducer(
    codeFlowReducer<RecoveryEntry>,
    initialIdentifier,
    (identifier) => initialCodeFlowState({ identifier, channel: null }),
  )
  const container = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useStepFocus(container, titleRef, state, autoFocus)
  const actions = useRecoveryActions({ state, dispatch, auth, next })
  const { type, loginIdentifier, channel } = actions

  const { entry, fieldErrors: errors } = state
  // An unknown identifier is said by the API (`auth_user_not_found`), with registration offered.
  const canRegister =
    registration.enabled && type !== null && auth.registration_methods.includes(type)
  const notice = state.notice && (
    <LoginNoticeAlert
      notice={state.notice}
      identifier={entry.identifier}
      next={next}
      canRegister={canRegister}
    />
  )
  const shared = { notice, busy: state.busy, titleRef }
  const onChannel = (value: RecoveryEntry['channel']) =>
    dispatch({ type: 'entry', changes: { channel: value } })

  return (
    <div ref={container}>
      {state.step === 'entry' && (
        <RecoveryIdentifierStep
          {...shared}
          identifier={entry.identifier}
          error={errors.identifier}
          channels={actions.channels.otpChannels}
          channel={channel}
          wait={actions.requestWait}
          loginHref={loginPageHref(next)}
          onIdentifier={(identifier) =>
            dispatch({
              type: 'entry',
              changes: { identifier },
              field: 'identifier',
              destination: identifier !== entry.identifier,
            })
          }
          onChannel={onChannel}
          onSubmit={actions.request}
        />
      )}
      {state.step === 'code' && channel !== null && (
        <OtpStep
          {...shared}
          copy={{ title: 'کد بازیابی', codeName: 'کد بازیابی', submit: 'تأیید کد' }}
          identifier={entry.identifier}
          type={type}
          channels={actions.channels.otpChannels}
          channel={channel}
          sent={state.otpSent}
          sends={state.sends}
          codeExpiry={state.codeExpiry}
          sendWait={state.sendWait}
          submitWait={stepWait(state)}
          code={state.otpCode}
          error={errors.otp}
          sending={state.sending}
          onChannel={onChannel}
          onSend={actions.resend}
          onCode={(value) => dispatch({ type: 'edit', field: 'otpCode', value })}
          onSubmit={actions.verify}
          onBack={() => dispatch({ type: 'go', step: 'entry' })}
        />
      )}
      {state.step === 'password' && (
        <NewPasswordStep
          {...shared}
          title="تعیین رمز عبور جدید"
          description="رمز عبور تازه‌ای برای حساب خود انتخاب کنید."
          submitLabel="تغییر رمز عبور"
          labels={{ password: 'رمز عبور جدید', confirm: 'تکرار رمز عبور جدید' }}
          username={loginIdentifier}
          password={state.password}
          confirm={state.confirm}
          errors={errors}
          reasons={state.reasons}
          related={[loginIdentifier]}
          submitWait={stepWait(state)}
          onPassword={(value) => dispatch({ type: 'edit', field: 'password', value })}
          onConfirm={(value) => dispatch({ type: 'edit', field: 'confirm', value })}
          onSubmit={actions.confirm}
        />
      )}
      {state.step === 'done' && <TransitionCard title="رمز عبور تغییر کرد" titleRef={titleRef} />}
    </div>
  )
}
