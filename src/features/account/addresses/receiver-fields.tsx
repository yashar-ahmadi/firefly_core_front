'use client'

import { Checkbox } from '@/components/ui/checkbox'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { useMe } from '@/features/auth/use-me'
import { normalizeIranMobile } from '@/lib/format'
import { messagesOf } from './address-fields'
import type { AddressValues, FieldErrors } from './address-values'

type Receiver = Pick<AddressValues, 'firstName' | 'lastName' | 'mobile'>

export interface ReceiverFieldsProps {
  values: Receiver
  onChange: (changes: Partial<Receiver>) => void
  errors: FieldErrors
}

/**
 * «گیرنده»: who takes the parcel, independent of the account (a gift). «گیرنده خودم هستم» fills
 * the three fields from the profile (`['me']`), and unticked empties them for someone else; it
 * reads as ticked while they are the profile's.
 */
export function ReceiverFields({ values, onChange, errors }: ReceiverFieldsProps) {
  const { data: me } = useMe()
  const myMobile = me?.phone_number ? (normalizeIranMobile(me.phone_number) ?? '') : ''
  const self =
    !!me &&
    values.firstName.trim() === me.first_name &&
    values.lastName.trim() === me.last_name &&
    (myMobile === '' || normalizeIranMobile(values.mobile) === myMobile)
  return (
    <fieldset className="flex flex-col gap-4">
      <legend className="mb-1 text-lg leading-8 font-bold text-ink-900">گیرنده</legend>
      {me && (
        <Checkbox
          label="گیرنده خودم هستم"
          checked={self}
          onCheckedChange={(checked) =>
            onChange(
              checked === true
                ? {
                    firstName: me.first_name,
                    lastName: me.last_name,
                    mobile: myMobile || values.mobile,
                  }
                : { firstName: '', lastName: '', mobile: '' },
            )
          }
        />
      )}
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="نام گیرنده" required error={messagesOf(errors.firstName)}>
          <Input
            name="receiver-given-name"
            autoComplete="given-name"
            maxLength={200}
            enterKeyHint="next"
            value={values.firstName}
            onChange={(event) => onChange({ firstName: event.currentTarget.value })}
          />
        </Field>
        <Field label="نام خانوادگی گیرنده" required error={messagesOf(errors.lastName)}>
          <Input
            name="receiver-family-name"
            autoComplete="family-name"
            maxLength={200}
            enterKeyHint="next"
            value={values.lastName}
            onChange={(event) => onChange({ lastName: event.currentTarget.value })}
          />
        </Field>
      </div>
      <Field
        label="شماره موبایل گیرنده"
        required
        hint="فقط شمارهٔ موبایل ایران؛ مانند ۰۹۱۲۱۲۳۴۵۶۷"
        error={messagesOf(errors.mobile)}
      >
        <Input
          name="receiver-tel"
          type="tel"
          dir="ltr"
          inputMode="numeric"
          autoComplete="tel"
          enterKeyHint="next"
          className="sm:max-w-xs"
          value={values.mobile}
          onChange={(event) => onChange({ mobile: event.currentTarget.value })}
        />
      </Field>
    </fieldset>
  )
}
