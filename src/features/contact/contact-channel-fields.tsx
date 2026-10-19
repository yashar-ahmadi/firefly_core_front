'use client'

import { CircleAlert } from 'lucide-react'
import { useId } from 'react'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { CONTACT_LIMITS, type ContactErrors } from './contact-payload'

export interface ContactChannelFieldsProps {
  email: string
  phone: string
  errors: Pick<ContactErrors, 'email' | 'phone' | 'channel'>
  onEmail: (email: string) => void
  onPhone: (phone: string) => void
}

/**
 * Where the shop's answer goes (content digest §9.2): e-mail and an Iranian mobile in one
 * fieldset, at least one of them. Both run left to right. The fieldset's own error (no channel:
 * `contact_channel_required`) is said once under both and describes both, which are marked
 * invalid, so the focus lands on the e-mail; a field's own error (`invalid`,
 * `invalid_iranian_mobile`) goes under that field.
 */
export function ContactChannelFields({
  email,
  phone,
  errors,
  onEmail,
  onPhone,
}: ContactChannelFieldsProps) {
  const hintId = useId()
  const errorId = useId()
  const channel = errors.channel
  const shared = channel ? { 'aria-invalid': true, 'aria-describedby': errorId } : {}
  return (
    <fieldset aria-describedby={hintId} className="flex flex-col gap-1.5">
      <legend className="text-base font-medium text-ink-800">
        {'راه پاسخ\u{200C}گویی به شما'}
      </legend>
      <p id={hintId} className="text-sm leading-6 text-ink-500">
        {'ایمیل یا شمارهٔ موبایل؛ دست\u{200C}کم یکی را بنویسید.'}
      </p>
      <div className="mt-1.5 grid gap-4 sm:grid-cols-2">
        <Field label="ایمیل" error={errors.email}>
          <Input
            type="email"
            dir="ltr"
            inputMode="email"
            autoComplete="email"
            maxLength={CONTACT_LIMITS.email}
            value={email}
            onChange={(event) => onEmail(event.target.value)}
            {...shared}
          />
        </Field>
        <Field label="شمارهٔ موبایل" hint="فقط شمارهٔ موبایل ایران" error={errors.phone}>
          <Input
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="tel"
            placeholder="۰۹۱۲۱۲۳۴۵۶۷"
            value={phone}
            onChange={(event) => onPhone(event.target.value)}
            {...shared}
          />
        </Field>
      </div>
      {channel && (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-sm leading-6 font-medium text-danger"
        >
          <CircleAlert aria-hidden className="mt-1 size-4 shrink-0" />
          <span>{channel}</span>
        </p>
      )}
    </fieldset>
  )
}
