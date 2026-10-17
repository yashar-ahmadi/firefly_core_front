'use client'

import Link from 'next/link'
import type { ReactNode } from 'react'
import { buttonClasses } from '@/components/ui/button-styles'
import { Button, type ButtonProps } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/components/ui/cn'
import { Spinner } from '@/components/ui/spinner'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import type { ContactType } from '@/lib/api/types/account'
import { formatIranMobile, toPersianDigits } from '@/lib/format'
import { registerHref } from '../auth-links'
import { normalizeIdentifier } from '../identifier'
import { FormAlert } from './auth-card'
import type { LoginNotice } from './login-state'

// Small parts the login steps share.

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

/** «sara@example.com — تغییر»: the identifier of the next steps, and the way back to it. */
export function IdentifierSummary({
  identifier,
  type,
  onChange,
}: {
  identifier: string
  type: ContactType | null
  onChange: () => void
}) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-control bg-ink-50 py-1 ps-4 pe-2">
      <span dir="ltr" className="min-w-0 truncate text-base font-medium text-ink-800">
        {shownIdentifier(identifier, type)}
      </span>
      <Button variant="ghost" size="sm" onClick={onChange} className="text-brand-700">
        تغییر
        <VisuallyHidden> ایمیل یا شماره موبایل</VisuallyHidden>
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
 * The step's main button. While its request is on the way it shows a spinner and does nothing
 * more, but stays focusable (`aria-disabled`), so the focus is still there when the answer comes.
 */
export function SubmitButton({ busy, children, ...props }: ButtonProps & { busy: boolean }) {
  return (
    <Button
      type="submit"
      size="lg"
      fullWidth
      aria-disabled={busy || undefined}
      aria-busy={busy || undefined}
      iconStart={busy ? <Spinner /> : undefined}
      {...props}
    >
      {children}
    </Button>
  )
}

/** A notice of the step, with registration offered when no account has the identifier. */
export function LoginNoticeAlert({
  notice,
  identifier,
  next,
}: {
  notice: LoginNotice
  identifier: string
  next: string
}) {
  let action: ReactNode = null
  if (notice.code === 'auth_user_not_found') {
    action = (
      <Link href={registerHref(normalizeIdentifier(identifier), next)} className={TEXT_LINK}>
        ثبت‌نام با همین مشخصات
      </Link>
    )
  }
  return <FormAlert action={action}>{notice.detail}</FormAlert>
}
