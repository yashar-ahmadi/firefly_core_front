'use client'

import Link from 'next/link'
import type { ReactNode, Ref } from 'react'
import { AuthCard } from './auth-card'
import { AuthForm } from './auth-form'
import { IdentifierField, SubmitButton, TEXT_LINK } from './login-fields'

export interface IdentifierStepProps {
  identifier: string
  error?: string
  /** The step's notice (`LoginNoticeAlert`), if any. */
  notice: ReactNode
  /** The Google button and its «یا», when Google login is on. */
  google: ReactNode
  /** Where to register; null while registration is closed. */
  registerHref: string | null
  busy: boolean
  titleRef: Ref<HTMLHeadingElement>
  onIdentifier: (value: string) => void
  onContinue: () => void
}

/** Step 1: one field for an email address or a mobile number; its type is found by itself. */
export function IdentifierStep({
  identifier,
  error,
  notice,
  google,
  registerHref,
  busy,
  titleRef,
  onIdentifier,
  onContinue,
}: IdentifierStepProps) {
  return (
    <AuthCard
      title="ورود به حساب کاربری"
      description="با ایمیل یا شماره موبایل خود وارد شوید."
      titleRef={titleRef}
    >
      {notice}
      {google}
      <AuthForm
        className="gap-5"
        onSubmit={() => {
          if (!busy) onContinue()
        }}
      >
        <IdentifierField
          value={identifier}
          error={error}
          enterKeyHint="next"
          onChange={onIdentifier}
        />
        <SubmitButton busy={busy}>ادامه</SubmitButton>
      </AuthForm>
      {registerHref && (
        <p className="text-center text-base leading-7 text-ink-700">
          حساب کاربری ندارید؟{' '}
          <Link href={registerHref} className={TEXT_LINK}>
            ثبت‌نام کنید
          </Link>
        </p>
      )}
    </AuthCard>
  )
}
