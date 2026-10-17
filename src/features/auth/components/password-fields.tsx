'use client'

import { Fragment } from 'react'
import { Field } from '@/components/ui/field'
import { toPersianDigits } from '@/lib/format'
import { PasswordInput } from './password-input'
import { PasswordStrength } from './password-strength'

// A new password and its confirmation (registration, recovery): both `new-password`, so a
// password manager offers to make one and saves it with the identifier of the form.

const HINT = `دست‌کم ${toPersianDigits(8)} نویسه؛ نه فقط عدد، نه شبیه نام یا ایمیل شما.`

export interface PasswordFieldsProps {
  labels: { password: string; confirm: string }
  password: string
  confirm: string
  errors: { password?: string; confirm?: string }
  /** `auth_password_weak`: each reason, shown in place of its joined detail. */
  reasons: string[]
  /** The names and the identifier: a password close to them is weak. */
  related: readonly string[]
  onPassword: (value: string) => void
  onConfirm: (value: string) => void
}

/** The API's reasons, one per line (a space between them for a screen reader). */
function Reasons({ reasons }: { reasons: string[] }) {
  return reasons.map((reason, index) => (
    <Fragment key={index}>
      {index > 0 && ' '}
      <span className="block">{reason}</span>
    </Fragment>
  ))
}

export function PasswordFields({
  labels,
  password,
  confirm,
  errors,
  reasons,
  related,
  onPassword,
  onConfirm,
}: PasswordFieldsProps) {
  const passwordError =
    errors.password !== undefined && reasons.length > 0 ? (
      <Reasons reasons={reasons} />
    ) : (
      errors.password
    )
  return (
    <>
      <div className="flex flex-col gap-2">
        <Field label={labels.password} hint={HINT} error={passwordError}>
          <PasswordInput
            data-autofocus=""
            name="new-password"
            autoComplete="new-password"
            enterKeyHint="next"
            value={password}
            onChange={(event) => onPassword(event.currentTarget.value)}
          />
        </Field>
        {/* The API's word on this password stands alone: the hint (guidance only) waits for
            the next change, its live region staying in place meanwhile. */}
        <PasswordStrength
          password={errors.password === undefined ? password : ''}
          related={related}
        />
      </div>
      <Field label={labels.confirm} error={errors.confirm}>
        <PasswordInput
          name="confirm-password"
          autoComplete="new-password"
          enterKeyHint="go"
          value={confirm}
          onChange={(event) => onConfirm(event.currentTarget.value)}
        />
      </Field>
    </>
  )
}
