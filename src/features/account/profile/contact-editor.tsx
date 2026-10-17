'use client'

import { useReducer, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { FormAlert } from '@/components/form/form-alert'
import { codeFlowReducer, initialCodeFlowState } from '@/features/auth/components/code-flow-state'
import { IdentifierSummary } from '@/features/auth/components/login-fields'
import { OtpCodeForm } from '@/features/auth/components/otp-code-form'
import { useStepFocus } from '@/features/auth/components/use-step-focus'
import { stepWait } from '@/lib/forms/waits'
import type { CodeChannels } from '@/features/auth/login-methods'
import type { ContactType, UserProfile } from '@/lib/api/types/account'
import { normalizeIranMobile } from '@/lib/format'
import { ContactEntryStep } from './contact-entry-step'
import {
  CONTACT_LABEL,
  contactProof,
  currentContact,
  usernameOf,
  type ContactEntry,
  type ContactProof,
} from './contact-rules'
import { useContactActions } from './use-contact-actions'

export interface ContactEditorProps {
  type: ContactType
  me: UserProfile
  /** Two-step login is on (its status endpoint, else the profile). */
  totpOn: boolean
  channels: CodeChannels
  onCancel: () => void
  onVerified: (profile: UserProfile) => void
}

/** «تغییر» on the code step names what it goes back to. */
const CHANGE_LABEL: Record<ContactType, string> = { email: 'ایمیل تازه', phone: 'شمارهٔ تازه' }

/** An unverified identifier, filled in as it is typed (a mobile as `09…`, not E.164). */
function prefill(type: ContactType, value: string | null): string {
  if (value === null) return ''
  return type === 'phone' ? (normalizeIranMobile(value) ?? value) : value
}

/** The proof the API asked for though the profile said none was needed (a stale profile). */
function demanded(code: string | null, previous: ContactProof): ContactProof {
  if (code === 'auth_totp_required') return { password: true, totp: true }
  if (code === 'auth_password_required') return { ...previous, password: true }
  return previous
}

/**
 * Adding or changing one identifier (auth digest F9), under its row: the new value and its
 * proof, then the code sent to it; the right code replaces the profile (`onVerified`).
 * An identifier there but not verified starts filled in: sending it verifies it.
 */
export function ContactEditor({
  type,
  me,
  totpOn,
  channels,
  onCancel,
  onVerified,
}: ContactEditorProps) {
  const current = currentContact(me, type)
  const [state, dispatch] = useReducer(
    codeFlowReducer<ContactEntry>,
    current.verified ? null : current.value,
    (value) =>
      initialCodeFlowState({
        value: prefill(type, value),
        password: '',
        totpCode: '',
        totpUsed: false,
        channel: null,
      }),
  )
  const container = useRef<HTMLDivElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  useStepFocus(container, titleRef, state, true)

  const [asked, setAsked] = useState<ContactProof>({ password: false, totp: false })
  const latched = demanded(state.errorCode, asked)
  if (latched.password !== asked.password || latched.totp !== asked.totp) setAsked(latched)
  const rule = contactProof(me, type, totpOn)
  const proof = { password: rule.password || asked.password, totp: rule.totp || asked.totp }

  const actions = useContactActions({ type, state, dispatch, channels, proof, onVerified })
  const { entry, fieldErrors: errors } = state
  const label = CONTACT_LABEL[type]
  const notice = state.notice && <FormAlert>{state.notice.detail}</FormAlert>

  return (
    <div ref={container} className="rounded-control border border-ink-200 p-4 sm:p-5">
      <h3
        ref={titleRef}
        tabIndex={-1}
        className="mb-4 text-base leading-7 font-bold text-ink-900 outline-none"
      >
        {current.value ? `تغییر ${label}` : `افزودن ${label}`}
      </h3>
      {state.step === 'entry' && (
        <ContactEntryStep
          type={type}
          adding={current.value === null}
          entry={entry}
          username={usernameOf(me)}
          proof={proof}
          channels={channels.otpChannels}
          channel={actions.channel}
          totpSpent={entry.totpUsed}
          focusTotp={entry.totpUsed && state.otpSent === null}
          errors={errors}
          notice={notice}
          busy={state.busy}
          wait={actions.requestWait}
          onChange={(changes, field, destination) =>
            dispatch({ type: 'entry', changes, field, destination })
          }
          onSubmit={actions.request}
          onCancel={onCancel}
        />
      )}
      {state.step === 'code' && actions.channel !== null && (
        <div className="flex flex-col gap-5 sm:max-w-md">
          <IdentifierSummary
            identifier={entry.value}
            type={type}
            changeLabel={CHANGE_LABEL[type]}
            onChange={() => dispatch({ type: 'go', step: 'entry' })}
          />
          {notice}
          <OtpCodeForm
            codeName="کد تأیید"
            submit="تأیید"
            channel={actions.channel}
            sent={state.otpSent}
            sends={state.sends}
            codeExpiry={state.codeExpiry}
            sendWait={state.sendWait}
            submitWait={stepWait(state)}
            code={state.otpCode}
            error={errors.otp}
            busy={state.busy}
            sending={state.sending}
            onSend={actions.resend}
            onCode={(value) => dispatch({ type: 'edit', field: 'otpCode', value })}
            onSubmit={actions.verify}
          />
          <Button variant="ghost" className="sm:self-start" onClick={onCancel}>
            انصراف
          </Button>
        </div>
      )}
    </div>
  )
}
