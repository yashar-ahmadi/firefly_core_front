'use client'

import { useEffect, useReducer, useRef, type RefObject } from 'react'
import { Spinner } from '@/components/ui/spinner'
import { useFeature } from '@/features/settings/feature-context'
import { forgotPasswordHref, registerHref } from '../auth-links'
import { identifierType, normalizeIdentifier } from '../identifier'
import { googleClientId, loginMethods, type LoginMethods } from '../login-methods'
import { useAuthSettings } from '../use-auth-settings'
import { AuthCard } from './auth-card'
import { GoogleButton } from './google-button'
import { IdentifierStep } from './identifier-step'
import { LoginNoticeAlert } from './login-fields'
import { initialLoginState, loginReducer } from './login-state'
import type { LoginState, LoginStep, Wait } from './login-types'
import { OtpStep } from './otp-step'
import { PasswordStep } from './password-step'
import { TotpStep } from './totp-step'
import { useLoginActions } from './use-login-actions'

const NO_METHODS: LoginMethods = { password: false, otpChannels: [], defaultOtpChannel: null }
const NO_WAIT: Wait = { until: 0, seq: -1 }

/** The 429 wait of the step on screen, if the last one was for it. */
function stepWait({ submitWait, step }: LoginState): Wait {
  return submitWait.step === step ? submitWait : NO_WAIT
}

export interface LoginFlowProps {
  /** The raw `?next=`: `completeLogin` sends it through `safeNext`. */
  next: string
  /** Prefilled (`?identifier=`, from registration or password recovery). */
  initialIdentifier?: string
  /** Focus the first field at once: the form took the place of another view of the page. */
  autoFocus?: boolean
  /** Called as the page is signed in, before `completeLogin` runs. */
  onSignedIn?: () => void
}

/**
 * Focus on a step change: the new step's first field (`data-autofocus`), else its title; unless
 * a field of the step took it already (the code boxes do). After a failure: the field in error,
 * whose message is its description; else it stays on the control that was pressed, and if that
 * went away with its form (a code that is void), the step's main control or title takes it.
 */
function useStepFocus(
  container: RefObject<HTMLDivElement | null>,
  title: RefObject<HTMLHeadingElement | null>,
  { step, attempt }: { step: LoginStep; attempt: number },
  autoFocus: boolean,
) {
  const shown = useRef<LoginStep | null>(autoFocus ? null : step)
  useEffect(() => {
    if (shown.current === step) return
    shown.current = step
    const root = container.current
    if (!root || (document.activeElement && root.contains(document.activeElement))) return
    const target = root.querySelector<HTMLElement>('[data-autofocus]') ?? title.current
    target?.focus()
  }, [container, title, step])
  useEffect(() => {
    const root = container.current
    if (attempt === 0 || !root) return
    const invalid = root.querySelector<HTMLElement>('[aria-invalid="true"]')
    if (invalid) return invalid.focus()
    if (document.activeElement && root.contains(document.activeElement)) return
    ;(root.querySelector<HTMLElement>('[data-primary]') ?? title.current)?.focus()
  }, [container, title, attempt])
}

/**
 * The login page's steps (identifier → password or code → TOTP when asked → done; see
 * `loginReducer`), built only from the settings' `auth` block and wired to the API
 * (`useLoginActions`) and to `completeLogin`.
 */
export function LoginFlow({
  next,
  initialIdentifier = '',
  autoFocus = false,
  onSignedIn,
}: LoginFlowProps) {
  const auth = useAuthSettings()
  const registration = useFeature('registration')
  const [state, dispatch] = useReducer(loginReducer, initialIdentifier, initialLoginState)
  const container = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useStepFocus(container, titleRef, state, autoFocus)

  const type = identifierType(state.identifier)
  const methods = type ? loginMethods(auth, type) : NO_METHODS
  const chosen = state.otpChannel
  const channel =
    chosen && methods.otpChannels.includes(chosen) ? chosen : methods.defaultOtpChannel
  const loginIdentifier = normalizeIdentifier(state.identifier)
  const actions = useLoginActions({
    state,
    dispatch,
    type,
    loginIdentifier,
    methods,
    channel,
    next,
    onSignedIn,
  })
  const google = actions.googleOff ? null : googleClientId(auth)
  const canRegister =
    registration.enabled && type !== null && auth.registration_methods.includes(type)

  const notice = state.notice && (
    <LoginNoticeAlert
      notice={state.notice}
      identifier={state.identifier}
      next={next}
      canRegister={canRegister}
    />
  )
  const errors = state.fieldErrors
  const back = () => dispatch({ type: 'back' })
  const remember = (value: boolean) => dispatch({ type: 'remember', value })
  const submitWait = stepWait(state)
  const shared = { notice, busy: state.busy, titleRef, submitWait }

  return (
    <div ref={container}>
      {state.step === 'identifier' && (
        <IdentifierStep
          notice={notice}
          busy={state.busy}
          titleRef={titleRef}
          identifier={state.identifier}
          error={errors.identifier}
          google={
            google && (
              <GoogleButton
                clientId={google}
                onCredential={actions.signInWithGoogle}
                wait={submitWait}
              />
            )
          }
          registerHref={
            auth.registration_methods.length > 0 && registration.enabled
              ? registerHref(undefined, next)
              : null
          }
          onIdentifier={(value) => dispatch({ type: 'edit', field: 'identifier', value })}
          onContinue={actions.continueWithIdentifier}
        />
      )}
      {state.step === 'password' && (
        <PasswordStep
          {...shared}
          identifier={state.identifier}
          type={type}
          password={state.password}
          rememberMe={state.rememberMe}
          error={errors.password}
          canUseCode={methods.otpChannels.length > 0}
          forgotHref={forgotPasswordHref(loginIdentifier)}
          onPassword={(value) => dispatch({ type: 'edit', field: 'password', value })}
          onRemember={remember}
          onSubmit={actions.submitPassword}
          onBack={back}
          onUseCode={() => dispatch({ type: 'go', step: 'otp' })}
        />
      )}
      {state.step === 'otp' && channel !== null && (
        <OtpStep
          {...shared}
          identifier={state.identifier}
          type={type}
          channels={methods.otpChannels}
          channel={channel}
          sent={state.otpSent}
          sends={state.sends}
          codeExpiry={state.codeExpiry}
          sendWait={state.sendWait}
          code={state.otpCode}
          rememberMe={state.rememberMe}
          error={errors.otp}
          sending={state.sending}
          canUsePassword={methods.password}
          onChannel={(value) => dispatch({ type: 'channel', value })}
          onSend={actions.sendCode}
          onCode={(value) => dispatch({ type: 'edit', field: 'otpCode', value })}
          onSubmit={actions.submitCode}
          onRemember={remember}
          onBack={back}
          onUsePassword={() => dispatch({ type: 'go', step: 'password' })}
        />
      )}
      {state.step === 'totp' && (
        <TotpStep
          {...shared}
          code={state.totpCode}
          error={errors.totp}
          onCode={(value) => dispatch({ type: 'edit', field: 'totpCode', value })}
          onSubmit={actions.submitTotp}
          onBack={back}
        />
      )}
      {state.step === 'done' && (
        <AuthCard title="ورود انجام شد" titleRef={titleRef}>
          <p role="status" className="flex items-center gap-2 text-base text-ink-700">
            <Spinner />
            در حال انتقال…
          </p>
        </AuthCard>
      )}
    </div>
  )
}
