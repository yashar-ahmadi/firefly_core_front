'use client'

import { useState, type ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthForm } from '@/features/auth/components/auth-form'
import { ChannelChoice } from '@/features/auth/components/channel-choice'
import { useSubmitWait } from '@/features/auth/components/code-timers'
import type { CodeFlowField } from '@/features/auth/components/code-flow-types'
import { SubmitButton } from '@/features/auth/components/login-fields'
import { PasswordInput } from '@/features/auth/components/password-input'
import type { Wait } from '@/features/auth/components/waits'
import type { ContactType, OtpMethod } from '@/lib/api/types/account'
import { CONTACT_LABEL, type ContactEntry, type ContactProof } from './contact-rules'
import { FORM_BUTTON } from './profile-section'
import { TotpCodeField } from './totp-code-field'

export interface ContactEntryStepProps {
  type: ContactType
  /** Adding (no identifier of this type yet) rather than replacing one. */
  adding: boolean
  entry: ContactEntry
  /** For a password manager: the account's identifier the current password goes with. */
  username: string
  proof: ContactProof
  channels: OtpMethod[]
  channel: OtpMethod | null
  /** A code was sent before: the authenticator's code it took is spent. */
  totpSpent: boolean
  /** Back here for a new code (not to edit the value): the authenticator's code takes the focus. */
  focusTotp: boolean
  errors: Partial<Record<CodeFlowField, string>>
  notice: ReactNode
  busy: boolean
  wait: Wait
  onChange: (changes: Partial<ContactEntry>, field: CodeFlowField, destination?: boolean) => void
  onSubmit: () => void
  onCancel: () => void
}

const HINT: Record<ContactType, string> = {
  email: 'کد تأیید به همین ایمیل فرستاده می‌شود.',
  phone: 'کد تأیید به همین شماره فرستاده می‌شود؛ مثلاً ۰۹۱۲۳۴۵۶۷۸۹.',
}

/**
 * The first step of a contact change: the new value, the channel when a phone can take more
 * than one, and the proof §4.17 asks for (only when it does). Its button sends the code.
 */
export function ContactEntryStep(props: ContactEntryStepProps) {
  const { type, entry, proof, errors, busy } = props
  const lock = useSubmitWait(props.wait)
  // Decided as the step opens: the focus never jumps to the boxes later.
  const [focusTotp] = useState(props.focusTotp)
  const email = type === 'email'
  return (
    <AuthForm
      className="gap-5 sm:max-w-md"
      onSubmit={() => {
        if (!busy && !lock.locked) props.onSubmit()
      }}
    >
      {props.notice}
      {proof.password && (
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={props.username}
          readOnly
          hidden
        />
      )}
      <Field
        label={props.adding ? CONTACT_LABEL[type] : `${CONTACT_LABEL[type]} تازه`}
        hint={HINT[type]}
        error={errors.identifier}
      >
        <Input
          data-autofocus=""
          dir="ltr"
          type={email ? 'email' : 'tel'}
          name={email ? 'email' : 'tel'}
          autoComplete={email ? 'email' : 'tel'}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          enterKeyHint={proof.password ? 'next' : 'send'}
          value={entry.value}
          onChange={(event) => {
            const value = event.currentTarget.value
            props.onChange({ value }, 'identifier', value !== entry.value)
          }}
        />
      </Field>
      {props.channel && props.channels.length > 1 && (
        <ChannelChoice
          channels={props.channels}
          channel={props.channel}
          onChannel={(channel) => props.onChange({ channel }, 'identifier')}
        />
      )}
      {proof.password && (
        <Field
          label="رمز فعلی"
          hint={`برای تغییر ${CONTACT_LABEL[type]} تأییدشده، رمز عبور فعلی حساب را وارد کنید.`}
          error={errors.currentPassword}
        >
          <PasswordInput
            name="current-password"
            autoComplete="current-password"
            enterKeyHint={proof.totp ? 'next' : 'send'}
            value={entry.password}
            onChange={(event) =>
              props.onChange({ password: event.currentTarget.value }, 'currentPassword')
            }
          />
        </Field>
      )}
      {proof.totp && (
        <TotpCodeField
          value={entry.totpCode}
          error={errors.totp}
          autoFocus={focusTotp}
          hint={
            props.totpSpent
              ? 'کد قبلی برنامه به کار رفته است؛ کد تازهٔ برنامه را وارد کنید.'
              : undefined
          }
          onChange={(totpCode) => props.onChange({ totpCode }, 'totp')}
        />
      )}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start">
        <div className="flex flex-col gap-1.5">
          <SubmitButton busy={busy} lock={lock} size="md" className={FORM_BUTTON}>
            ارسال کد تأیید
          </SubmitButton>
        </div>
        <Button variant="ghost" onClick={props.onCancel}>
          انصراف
        </Button>
      </div>
    </AuthForm>
  )
}
