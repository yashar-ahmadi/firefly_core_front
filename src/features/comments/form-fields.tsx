'use client'

import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// The parts every comment form of the shop shares (a product's, a blog post's): the API's limits,
// a guest's name and e-mail, and the honeypot.

/** The text's limit (the API's). */
export const MAX_COMMENT_TEXT = 4096
/** A name's, an e-mail's and a title's. */
export const MAX_COMMENT_LINE = 255
export const NAME_MISSING = 'نام خود را بنویسید.'

export interface GuestFieldsProps {
  name: string
  email: string
  errors: { name?: string; email?: string }
  onName: (name: string) => void
  onEmail: (email: string) => void
}

/**
 * A guest's name (required) and e-mail (optional, never shown). A signed-in visitor's come from
 * the account (the API ignores what is sent): the forms leave these out for them.
 */
export function GuestFields({ name, email, errors, onName, onEmail }: GuestFieldsProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <Field label="نام" error={errors.name} required>
        <Input
          value={name}
          maxLength={MAX_COMMENT_LINE}
          autoComplete="name"
          onChange={(e) => onName(e.target.value)}
        />
      </Field>
      <Field label="ایمیل (اختیاری)" hint={'نمایش داده نمی\u{200C}شود.'} error={errors.email}>
        <Input
          type="email"
          dir="ltr"
          inputMode="email"
          autoComplete="email"
          value={email}
          maxLength={MAX_COMMENT_LINE}
          onChange={(e) => onEmail(e.target.value)}
        />
      </Field>
    </div>
  )
}

/**
 * The honeypot (`website`): off-screen, unreachable by keyboard and hidden from assistive tech;
 * a bot that fills it gets the same answer and nothing is saved. Its value is sent only when set.
 */
export function HoneypotField({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  return (
    <div aria-hidden className="absolute start-0 -top-[9999px] h-px w-px overflow-hidden">
      <label>
        {'وب\u{200C}سایت'}
        <input
          name="website"
          tabIndex={-1}
          autoComplete="off"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      </label>
    </div>
  )
}
