'use client'

import type { ReactNode } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/components/ui/cn'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { useHydrated } from '@/components/ui/use-media-query'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import type { ContactType } from '@/lib/api/types/account'
import { formatIranMobile, toPersianDigits } from '@/lib/format'
import { registerHref } from '../auth-links'
import { normalizeIdentifier } from '../identifier'
import { FormAlert } from './auth-card'
import type { SubmitLock } from './code-timers'
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
 * The step's main button (`data-primary`). While its request is on the way it shows a spinner,
 * and while a 429's wait runs (`lock`) it shows the time left; either way it does nothing more
 * but stays focusable (`aria-disabled`), so the focus is still there when the answer comes.
 * Before the page has hydrated it is disabled (the server HTML too), so neither a press nor Enter
 * in a field can submit the form natively (see `AuthForm`).
 */
export function SubmitButton({
  busy,
  lock,
  children,
  ...props
}: ButtonProps & { busy: boolean; lock?: SubmitLock }) {
  const hydrated = useHydrated()
  const locked = lock?.locked ?? false
  return (
    <>
      <Button
        type="submit"
        size="lg"
        fullWidth
        data-primary=""
        aria-disabled={busy || locked || undefined}
        aria-busy={busy || undefined}
        aria-describedby={locked ? lock?.noteId : undefined}
        iconStart={busy ? <Spinner /> : undefined}
        {...props}
        disabled={!hydrated || props.disabled}
      >
        {children}
      </Button>
      {lock?.note}
    </>
  )
}

/**
 * A notice of the step. When no account has the identifier, registration is offered with it,
 * if registration is open to this kind of identifier (`canRegister`).
 */
export function LoginNoticeAlert({
  notice,
  identifier,
  next,
  canRegister,
}: {
  notice: LoginNotice
  identifier: string
  next: string
  canRegister: boolean
}) {
  let action: ReactNode = null
  if (notice.code === 'auth_user_not_found' && canRegister) {
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
  }
  return <FormAlert action={action}>{notice.detail}</FormAlert>
}
