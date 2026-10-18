'use client'

import { useEffect, useEffectEvent, useRef, useState } from 'react'
import { AuthForm } from '@/components/form/auth-form'
import { FormAlert } from '@/components/form/form-alert'
import { useSubmitWait } from '@/components/form/code-timers'
import { SubmitButton } from '@/components/form/submit-button'
import { useFormFocus } from '@/components/form/use-form-focus'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { announce } from '@/components/ui/live-announcer'
import { messagesOf, RegionFields } from '@/features/account/addresses/address-fields'
import { PlaceFields } from '@/features/account/addresses/place-fields'
import { ReceiverFields } from '@/features/account/addresses/receiver-fields'
import { THROTTLED_MESSAGE, throttleWait } from '@/features/account/lists/list-error'
import { checkGuestReceiver, type GuestErrors, type GuestReceiver } from './guest-receiver'
import type { Checkout } from './use-checkout'
import { isThrottled } from './use-checkout-writes'

// A guest's receiver (cart digest §6.6, §7.4): the address book's own fields (the receiver, the
// province and city, the door: postal code required here) and the buyer's own mobile. The
// province and city set the cart's destination at once, so shipping can price; the rest is kept
// for placement (Task 3). «ادامه» checks it all as the API will, the first field in error
// taking the focus.

const hasErrors = (errors: GuestErrors) => Object.keys(errors).length > 0

export function GuestReceiverForm({ checkout }: { checkout: Checkout }) {
  const values = checkout.receiver
  const [errors, setErrors] = useState<GuestErrors>({})
  const [alert, setAlert] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)
  // A 429 on the destination: «ادامه» (and a new city) wait out `retry_after`.
  const [throttle, setThrottle] = useState<{ error: unknown; at: number } | null>(null)
  const lock = useSubmitWait(throttleWait(throttle?.error, throttle?.at ?? 0))
  const container = useRef<HTMLDivElement>(null)
  useFormFocus(container, attempt)
  const cartCity = checkout.cart?.destination?.city_id ?? null

  function edit(changes: Partial<GuestReceiver>) {
    checkout.setReceiver(changes)
    const fields = Object.keys(changes) as (keyof GuestReceiver)[]
    if (fields.some((field) => errors[field])) {
      const next = { ...errors }
      for (const field of fields) delete next[field]
      setErrors(next)
    }
  }

  /** `cart/destination/ {province, city}`; a stale choice (lists out of date) goes. */
  async function destination(province: number, city: number): Promise<boolean> {
    if (lock.locked) return false
    const outcome = await checkout.setDestinationByCity(province, city)
    setAlert(null)
    if (outcome.status === 'done')
      announce('مقصد ارسال ثبت شد؛ روش\u{200C}های ارسال به\u{200C}روز شد.')
    if (outcome.status !== 'failed') return outcome.status === 'done'
    if (outcome.resetCity) edit({ city: null })
    if (isThrottled(outcome.error)) {
      setThrottle({ error: outcome.error, at: Date.now() })
      setAlert(THROTTLED_MESSAGE)
    } else if (outcome.message) setAlert(outcome.message)
    return false
  }

  // A draft restored after a reload whose city the cart no longer holds (the cart was cleared or
  // merged meanwhile): its destination is set again, once. A choice of the shopper's sets it
  // itself.
  const restored = useRef(false)
  const restore = useEffectEvent(() => {
    if (restored.current || values.province === null || values.city === null) return
    restored.current = true
    if (cartCity === values.city || checkout.destinationPending) return
    void checkout.setDestinationByCity(values.province, values.city).then((outcome) => {
      if (outcome.status !== 'failed') return
      if (outcome.resetCity) checkout.setReceiver({ city: null })
      if (outcome.message) setAlert(outcome.message)
    })
  })
  useEffect(() => restore(), [values.province, values.city])

  async function submit() {
    if (saving || lock.locked) return
    const invalid = checkGuestReceiver(values)
    if (hasErrors(invalid)) {
      setErrors(invalid)
      setAttempt((count) => count + 1)
      return
    }
    setErrors({})
    setSaving(true)
    const ready = cartCity === values.city || (await destination(values.province!, values.city!))
    setSaving(false)
    if (!ready) return setAttempt((count) => count + 1)
    checkout.confirmReceiver()
  }

  return (
    <div ref={container}>
      <AuthForm className="gap-5" onSubmit={() => void submit()}>
        {alert && <FormAlert>{alert}</FormAlert>}
        <ReceiverFields values={values} onChange={edit} errors={errors} />
        <fieldset className="flex flex-col gap-5">
          <legend className="mb-1 text-lg leading-8 font-bold text-ink-900">آدرس تحویل</legend>
          <RegionFields
            province={values.province}
            city={values.city}
            onProvince={(province) => {
              restored.current = true
              edit({ province, city: null })
            }}
            onCity={(city) => {
              restored.current = true
              edit({ city })
              if (city !== null && values.province !== null) void destination(values.province, city)
            }}
            provinceErrors={errors.province}
            cityErrors={errors.city}
            onStale={() => edit({ province: null, city: null })}
          />
          <PlaceFields values={values} onChange={edit} errors={errors} postalRequired />
        </fieldset>
        <Field
          label={
            <>
              شمارهٔ موبایل شما برای پیگیری سفارش{' '}
              <span className="font-normal text-ink-600">(اختیاری)</span>
            </>
          }
          hint="اگر سفارش را برای کس دیگری ثبت می‌کنید، شمارهٔ خودتان را وارد کنید."
          error={messagesOf(errors.customerMobile)}
        >
          <Input
            name="customer-tel"
            type="tel"
            dir="ltr"
            inputMode="numeric"
            autoComplete="tel"
            className="sm:max-w-xs"
            value={values.customerMobile}
            onChange={(event) => edit({ customerMobile: event.currentTarget.value })}
          />
        </Field>
        <SubmitButton
          busy={saving || checkout.destinationPending}
          lock={lock}
          className="sm:w-auto sm:self-start"
        >
          ادامه
        </SubmitButton>
      </AuthForm>
    </div>
  )
}
