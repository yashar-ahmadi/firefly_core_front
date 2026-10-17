'use client'

import Link from 'next/link'
import type { ReactNode, Ref } from 'react'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { AuthCard } from './auth-card'
import { SubmitButton, TEXT_LINK } from './login-fields'

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
      <form
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          if (!busy) onContinue()
        }}
      >
        <Field
          label="ایمیل یا شماره موبایل"
          hint="مثلاً name@example.com یا ۰۹۱۲۳۴۵۶۷۸۹"
          error={error}
        >
          <Input
            data-autofocus=""
            dir="ltr"
            name="username"
            autoComplete="username"
            inputMode="email"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            enterKeyHint="next"
            value={identifier}
            onChange={(event) => onIdentifier(event.currentTarget.value)}
          />
        </Field>
        <SubmitButton busy={busy}>ادامه</SubmitButton>
      </form>
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
