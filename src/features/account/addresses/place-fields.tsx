'use client'

import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { messagesOf } from './address-fields'
import type { AddressValues, FieldErrors } from './address-values'

type Place = Pick<AddressValues, 'address' | 'plaque' | 'unit' | 'postalCode'>

export interface PlaceFieldsProps {
  values: Place
  onChange: (changes: Partial<Place>) => void
  errors: FieldErrors
}

/**
 * Where the door is: «آدرس کامل», «پلاک» and «واحد» (as typed: «۱۲ب», «12/1»), and the optional
 * «کد پستی» (its digits normalised when sent).
 */
export function PlaceFields({ values, onChange, errors }: PlaceFieldsProps) {
  return (
    <>
      <Field
        label="آدرس کامل"
        required
        hint="خیابان، کوچه، نام ساختمان و نشانه‌ای که پیدا کردن را آسان کند."
        error={messagesOf(errors.address)}
      >
        <Textarea
          name="street-address"
          autoComplete="street-address"
          rows={3}
          value={values.address}
          onChange={(event) => onChange({ address: event.currentTarget.value })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-5">
        <Field label="پلاک" error={messagesOf(errors.plaque)}>
          <Input
            name="plaque"
            autoComplete="off"
            maxLength={20}
            value={values.plaque}
            onChange={(event) => onChange({ plaque: event.currentTarget.value })}
          />
        </Field>
        <Field label="واحد" error={messagesOf(errors.unit)}>
          <Input
            name="unit"
            autoComplete="off"
            maxLength={20}
            value={values.unit}
            onChange={(event) => onChange({ unit: event.currentTarget.value })}
          />
        </Field>
      </div>
      <Field
        label={
          <>
            کد پستی <span className="font-normal text-ink-600">(اختیاری)</span>
          </>
        }
        hint="۱۰ رقم"
        error={messagesOf(errors.postalCode)}
      >
        <Input
          name="postal-code"
          dir="ltr"
          inputMode="numeric"
          autoComplete="postal-code"
          className="sm:max-w-xs"
          value={values.postalCode}
          onChange={(event) => onChange({ postalCode: event.currentTarget.value })}
        />
      </Field>
    </>
  )
}
