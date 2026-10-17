'use client'

import { useReducer, useRef } from 'react'
import { useFeature } from '@/features/settings/feature-context'
import { stepWait } from '@/lib/forms/waits'
import { forgotPasswordHref, registerHref } from '../auth-links'
import { identifierType, normalizeIdentifier } from '../identifier'
import { chosenChannel, googleClientId, loginMethods, type LoginMethods } from '../login-methods'
import { useAuthSettings } from '../use-auth-settings'
import { TransitionCard } from './auth-card'
import { GoogleButton } from './google-button'
import { IdentifierStep } from './identifier-step'
import { LoginNoticeAlert } from './login-fields'
import { initialLoginState, loginReducer } from './login-state'
import { OtpStep } from './otp-step'
import { PasswordStep } from './password-step'
import { TotpStep } from './totp-step'
import { useLoginActions } from './use-login-actions'
import { useStepFocus } from './use-step-focus'

const NO_METHODS: LoginMethods = { password: false, otpChannels: [], defaultOtpChannel: null }

export interface LoginFlowProps {
  /** The raw `?next=`: `completeLogin` sends it through `safeNext`. */
  next: string
  /** Prefilled: handed over by registration or password recovery (`useHandedIdentifier`). */
  initialIdentifier?: string
  /** Focus the first field at once: the form took the place of another view of the page. */
  autoFocus?: boolean
  /** Called as the page is signed in, before `completeLogin` runs. */
  onSignedIn?: () => void
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
  const channel = chosenChannel(methods, state.otpChannel)
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
            auth.registration_methods.length > 0 && registration.enabled ? registerHref(next) : null
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
          forgotHref={forgotPasswordHref(next)}
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
      {state.step === 'done' && <TransitionCard title="ورود انجام شد" titleRef={titleRef} />}
    </div>
  )
}
