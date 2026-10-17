'use client'

import type { ReactNode, Ref } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import type { ContactType } from '@/lib/api/types/account'
import { AuthForm } from '@/components/form/auth-form'
import { useSubmitWait } from '@/components/form/code-timers'
import { SubmitButton } from '@/components/form/submit-button'
import type { Wait } from '@/lib/forms/waits'
import { normalizeIdentifier } from '../identifier'
import { AuthCard, OrDivider } from './auth-card'
import { HandoffLink } from './handoff-link'
import { IdentifierSummary, RememberMe, TEXT_LINK } from './login-fields'
import { PasswordInput } from './password-input'

export interface PasswordStepProps {
  identifier: string
  type: ContactType | null
  password: string
  rememberMe: boolean
  error?: string
  notice: ReactNode
  busy: boolean
  /** A 429's wait before «ورود» may be sent again. */
  submitWait: Wait
  /** The settings offer a code for this identifier type. */
  canUseCode: boolean
  /** «فراموشی رمز عبور» (with `next`): the identifier goes with it, not in it. */
  forgotHref: string
  titleRef: Ref<HTMLHeadingElement>
  onPassword: (value: string) => void
  onRemember: (value: boolean) => void
  onSubmit: () => void
  onBack: () => void
  onUseCode: () => void
}

/** Step 2 by default: the password, «مرا به خاطر بسپار», and the way to a code instead. */
export function PasswordStep({
  identifier,
  type,
  password,
  rememberMe,
  error,
  notice,
  busy,
  submitWait,
  canUseCode,
  forgotHref,
  titleRef,
  onPassword,
  onRemember,
  onSubmit,
  onBack,
  onUseCode,
}: PasswordStepProps) {
  const lock = useSubmitWait(submitWait)
  return (
    <AuthCard title="رمز عبور را وارد کنید" titleRef={titleRef}>
      <IdentifierSummary identifier={identifier} type={type} onChange={onBack} />
      {notice}
      <AuthForm
        className="gap-4"
        onSubmit={() => {
          if (!busy && !lock.locked) onSubmit()
        }}
      >
        {/* The identifier of step 1, for password managers to save with the password. */}
        <input
          type="text"
          name="username"
          autoComplete="username"
          value={normalizeIdentifier(identifier)}
          readOnly
          hidden
        />
        <Field label="رمز عبور" error={error}>
          <PasswordInput
            data-autofocus=""
            name="password"
            autoComplete="current-password"
            enterKeyHint="go"
            value={password}
            onChange={(event) => onPassword(event.currentTarget.value)}
          />
        </Field>
        <div className="-mt-2 flex justify-end">
          <HandoffLink
            page="/forgot-password/"
            href={forgotHref}
            identifier={identifier}
            className={TEXT_LINK}
          >
            فراموشی رمز عبور
          </HandoffLink>
        </div>
        <RememberMe checked={rememberMe} onChange={onRemember} />
        <SubmitButton busy={busy} lock={lock}>
          ورود
        </SubmitButton>
      </AuthForm>
      {canUseCode && (
        <>
          <OrDivider />
          <Button variant="outline" size="lg" fullWidth onClick={onUseCode}>
            ورود با کد یکبار مصرف
          </Button>
        </>
      )}
    </AuthCard>
  )
}
