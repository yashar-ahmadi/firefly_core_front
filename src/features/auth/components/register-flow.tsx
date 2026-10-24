'use client'

import { useReducer, useRef } from 'react'
import type { ContactType } from '@/lib/api/types/account'
import { FormAlert } from '@/components/form/form-alert'
import { stepWait } from '@/lib/forms/waits'
import { loginPageHref } from '../auth-links'
import { identifierType, normalizeIdentifier } from '../identifier'
import { useAuthSettings } from '../use-auth-settings'
import { TransitionCard } from './auth-card'
import { codeFlowReducer, initialCodeFlowState } from './code-flow-state'
import { NewPasswordStep } from './new-password-step'
import { OtpStep } from './otp-step'
import { RegisterStartStep } from './register-start-step'
import { useRegisterActions, type RegisterEntry } from './use-register-actions'
import { useStepFocus } from './use-step-focus'

/** An identifier taken by an account: offered as a login with it. */
const TAKEN = new Set(['auth_email_already_exists', 'auth_phone_already_exists'])

const VERIFIED: Record<ContactType, string> = {
  email: 'ایمیل شما تأیید شد؛ برای حساب خود رمز عبور بگذارید.',
  phone: 'شمارهٔ موبایل شما تأیید شد؛ برای حساب خود رمز عبور بگذارید.',
}

/** The first step: a prefilled identifier picks its method when the shop registers it. */
function initialEntry(methods: ContactType[], identifier: string): RegisterEntry {
  const type = identifierType(identifier)
  const method = type && methods.includes(type) ? type : (methods[0] ?? 'email')
  return {
    firstName: '',
    lastName: '',
    method,
    email: method === 'email' && type === 'email' ? identifier : '',
    phone: method === 'phone' && type === 'phone' ? identifier : '',
    channel: null,
  }
}

export interface RegisterFlowProps {
  /** A safe `?next=` path, or '': `completeLogin` goes there (else to `/account/`). */
  next: string
  /** Prefilled (normalised): handed over by a login page that found no account. */
  initialIdentifier: string
  /** The operator's terms (`accept_terms_text`), sanitised on the server. */
  termsHtml: string | null
  /** Focus the first field at once: the form took the place of another view of the page. */
  autoFocus?: boolean
  /** Called as the page is signed in, before `completeLogin` runs. */
  onSignedIn?: () => void
}

/**
 * Registration (auth digest F1): start (names, the method, the identifier, the channel) →
 * verify (the code) → complete (the password) → signed in through `completeLogin`. Every step
 * after the first is keyed by the `registration_token` the start answered (state, never shown).
 */
export function RegisterFlow({
  next,
  initialIdentifier,
  termsHtml,
  autoFocus = false,
  onSignedIn,
}: RegisterFlowProps) {
  const auth = useAuthSettings()
  const methods = auth.registration_methods
  const [state, dispatch] = useReducer(
    codeFlowReducer<RegisterEntry>,
    initialIdentifier,
    (identifier) => initialCodeFlowState(initialEntry(methods, identifier)),
  )
  const container = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useStepFocus(container, titleRef, state, autoFocus)
  const actions = useRegisterActions({ state, dispatch, auth, next, onSignedIn })

  const { entry, fieldErrors: errors } = state
  const identifier = entry[entry.method]
  const normalized = normalizeIdentifier(identifier)
  const notice = state.notice && <FormAlert>{state.notice.detail}</FormAlert>
  const taken = errors.identifier !== undefined && TAKEN.has(state.errorCode ?? '')
  const shared = { notice, busy: state.busy, titleRef }

  return (
    <div ref={container}>
      {state.step === 'entry' && (
        <RegisterStartStep
          {...shared}
          methods={methods}
          entry={entry}
          channels={actions.channels.otpChannels}
          channel={actions.channel}
          errors={errors}
          identifierTaken={taken}
          loginHref={loginPageHref(next)}
          wait={actions.startWait}
          termsHtml={termsHtml}
          onEntry={(changes, field, destination) =>
            dispatch({ type: 'entry', changes, field, destination })
          }
          onChannel={(channel) => dispatch({ type: 'entry', changes: { channel } })}
          onSubmit={actions.start}
        />
      )}
      {state.step === 'code' && actions.channel !== null && (
        <OtpStep
          {...shared}
          copy={{
            title: entry.method === 'email' ? 'تأیید ایمیل' : 'تأیید شمارهٔ موبایل',
            codeName: 'کد تأیید',
            submit: 'تأیید',
          }}
          identifier={identifier}
          type={entry.method}
          channels={actions.channels.otpChannels}
          channel={actions.channel}
          sent={state.otpSent}
          sends={state.sends}
          codeExpiry={state.codeExpiry}
          sendWait={state.sendWait}
          submitWait={stepWait(state)}
          code={state.otpCode}
          error={errors.otp}
          sending={state.sending}
          onChannel={(channel) => dispatch({ type: 'entry', changes: { channel } })}
          onSend={actions.resend}
          onCode={(value) => dispatch({ type: 'edit', field: 'otpCode', value })}
          onSubmit={actions.verify}
          onBack={() => dispatch({ type: 'go', step: 'entry' })}
        />
      )}
      {state.step === 'password' && (
        <NewPasswordStep
          {...shared}
          title="تعیین رمز عبور"
          description={VERIFIED[entry.method]}
          submitLabel="ایجاد حساب کاربری"
          labels={{ password: 'رمز عبور', confirm: 'تکرار رمز عبور' }}
          username={normalized}
          password={state.password}
          confirm={state.confirm}
          errors={errors}
          reasons={state.reasons}
          related={[entry.firstName, entry.lastName, normalized]}
          submitWait={stepWait(state)}
          onPassword={(value) => dispatch({ type: 'edit', field: 'password', value })}
          onConfirm={(value) => dispatch({ type: 'edit', field: 'confirm', value })}
          onSubmit={actions.complete}
        />
      )}
      {state.step === 'done' && <TransitionCard title="حساب شما ساخته شد" titleRef={titleRef} />}
    </div>
  )
}
