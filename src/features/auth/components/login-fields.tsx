'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/components/ui/cn'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import type { ContactType } from '@/lib/api/types/account'
import { formatIranMobile, toPersianDigits } from '@/lib/format'
import { FormAlert } from '@/components/form/form-alert'
import { registerHref } from '../auth-links'
import { normalizeIdentifier } from '../identifier'
import { HandoffLink } from './handoff-link'
import type { LoginNotice } from './login-types'

// Small parts the auth steps share (login, registration, password recovery).

/**
 * How long a login lasts on this device (auth digest §2.4: the refresh token's lifetime, a
 * backend setting the API does not publish): 7 days, or 30 with «مرا به خاطر بسپار».
 */
const SESSION_DAYS = { usual: 7, remembered: 30 }

/** A link styled as an inline text link, with a 44px tall hit area. */
export const TEXT_LINK = cn(buttonClasses({ variant: 'link' }), 'text-base')

/** The identifier as typed, shown back: a mobile number spaced in Persian digits. */
function shownIdentifier(identifier: string, type: ContactType | null): string {
  return type === 'phone' ? formatIranMobile(identifier) : normalizeIdentifier(identifier)
}

/**
 * «ایمیل یا شماره موبایل»: one field for either (login, recovery); its type is found from what
 * is typed (`identifierType`). The step's first field.
 */
export function IdentifierField({
  value,
  error,
  enterKeyHint,
  onChange,
}: {
  value: string
  error?: string
  enterKeyHint: 'next' | 'send'
  onChange: (value: string) => void
}) {
  return (
    <Field label="ایمیل یا شماره موبایل" hint="مثلاً name@example.com یا ۰۹۱۲۳۴۵۶۷۸۹" error={error}>
      <Input
        data-autofocus=""
        dir="ltr"
        name="username"
        autoComplete="username"
        inputMode="email"
        autoCapitalize="none"
        autoCorrect="off"
        spellCheck={false}
        enterKeyHint={enterKeyHint}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
      />
    </Field>
  )
}

/**
 * «sara@example.com — تغییر»: the identifier of the next steps, and the way back to it.
 * `changeLabel` ends the button's name for a screen reader («تغییر ایمیل یا شماره موبایل»).
 */
export function IdentifierSummary({
  identifier,
  type,
  changeLabel = 'ایمیل یا شماره موبایل',
  onChange,
}: {
  identifier: string
  type: ContactType | null
  changeLabel?: string
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-control bg-ink-50 py-1 ps-4 pe-2">
      <span dir="ltr" className="min-w-0 truncate text-base font-medium text-ink-800">
        {shownIdentifier(identifier, type)}
      </span>
      <Button variant="ghost" size="sm" onClick={onChange} className="text-brand-700">
        تغییر
        <VisuallyHidden> {changeLabel}</VisuallyHidden>
      </Button>
    </div>
  )
}

export function RememberMe({
  checked,
  onChange,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  const { usual, remembered } = SESSION_DAYS
  return (
    <Checkbox
      checked={checked}
      onCheckedChange={(value) => onChange(value === true)}
      label="مرا به خاطر بسپار"
      description={`تا ${toPersianDigits(remembered)} روز در این دستگاه وارد می‌مانید؛ بدون این گزینه ${toPersianDigits(usual)} روز. در دستگاه‌های عمومی انتخابش نکنید.`}
    />
  )
}

/**
 * How a notice that no account has the identifier offers registration: `handoff`, with what was
 * typed (registration is open to that kind of identifier); `plain`, a link to the page alone
 * (Google's answer: the field is not what Google signed in with); null, not at all.
 */
export type RegisterOffer = 'handoff' | 'plain' | null

/**
 * A notice of the step. When no account has the identifier, registration is offered as
 * `register` says («ثبت‌نام با همین مشخصات», or «ثبت‌نام»).
 */
export function LoginNoticeAlert({
  notice,
  identifier,
  next,
  register,
}: {
  notice: LoginNotice
  identifier: string
  next: string
  register: RegisterOffer
}) {
  let action: ReactNode = null
  if (notice.code === 'auth_user_not_found' && register === 'handoff') {
    action = (
      <HandoffLink
        page="/register/"
        href={registerHref(next)}
        identifier={identifier}
        className={TEXT_LINK}
      >
        ثبت‌نام با همین مشخصات
      </HandoffLink>
    )
  } else if (notice.code === 'auth_user_not_found' && register === 'plain') {
    action = (
      <Link href={registerHref(next)} className={TEXT_LINK}>
        ثبت‌نام
      </Link>
    )
  }
  return <FormAlert action={action}>{notice.detail}</FormAlert>
}
