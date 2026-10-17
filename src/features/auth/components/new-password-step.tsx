'use client'

import type { ReactNode, Ref } from 'react'
import { AuthCard } from './auth-card'
import { AuthForm } from './auth-form'
import { useSubmitWait } from './code-timers'
import { SubmitButton } from './login-fields'
import { PasswordFields, type PasswordFieldsProps } from './password-fields'
import type { Wait } from './waits'

export interface NewPasswordStepProps extends PasswordFieldsProps {
  title: string
  description: string
  submitLabel: string
  /** The account's identifier, for a password manager to save with the new password. */
  username: string
  notice: ReactNode
  busy: boolean
  /** A 429's wait before the step's button may be sent again. */
  submitWait: Wait
  titleRef: Ref<HTMLHeadingElement>
  onSubmit: () => void
}

/** The last step of registration and of recovery: a new password, twice, then its button. */
export function NewPasswordStep({
  title,
  description,
  submitLabel,
  username,
  notice,
  busy,
  submitWait,
  titleRef,
  onSubmit,
  ...fields
}: NewPasswordStepProps) {
  const lock = useSubmitWait(submitWait)
  return (
    <AuthCard title={title} description={description} titleRef={titleRef}>
      {notice}
      <AuthForm
        className="gap-5"
        onSubmit={() => {
          if (!busy && !lock.locked) onSubmit()
        }}
      >
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={username}
          readOnly
          hidden
        />
        <PasswordFields {...fields} />
        <SubmitButton busy={busy} lock={lock}>
          {submitLabel}
        </SubmitButton>
      </AuthForm>
    </AuthCard>
  )
}
