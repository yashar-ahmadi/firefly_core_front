'use client'

import Link from 'next/link'
import type { ReactNode, Ref } from 'react'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/ui/field'
import type { ContactType } from '@/lib/api/types/account'
import { normalizeIdentifier } from '../identifier'
import { AuthCard, OrDivider } from './auth-card'
import { IdentifierSummary, RememberMe, SubmitButton, TEXT_LINK } from './login-fields'
import { PasswordInput } from './password-input'

export interface PasswordStepProps {
  identifier: string
  type: ContactType | null
  password: string
  rememberMe: boolean
  error?: string
  notice: ReactNode
  busy: boolean
  /** The settings offer a code for this identifier type. */
  canUseCode: boolean
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
  canUseCode,
  forgotHref,
  titleRef,
  onPassword,
  onRemember,
  onSubmit,
  onBack,
  onUseCode,
}: PasswordStepProps) {
  return (
    <AuthCard title="رمز عبور را وارد کنید" titleRef={titleRef}>
      <IdentifierSummary identifier={identifier} type={type} onChange={onBack} />
      {notice}
      <form
        noValidate
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) onSubmit()
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
          <Link href={forgotHref} className={TEXT_LINK}>
            فراموشی رمز عبور
          </Link>
        </div>
        <RememberMe checked={rememberMe} onChange={onRemember} />
        <SubmitButton busy={busy}>ورود</SubmitButton>
      </form>
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
