'use client'

import { useEffect, useRef, useState } from 'react'
import { AuthForm } from '@/components/form/auth-form'
import { useSubmitWait } from '@/components/form/code-timers'
import { FormAlert } from '@/components/form/form-alert'
import { SubmitButton } from '@/components/form/submit-button'
import { useFormFocus } from '@/components/form/use-form-focus'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { SupportLine } from '@/features/payment/result-actions'
import type { TrackField } from './track-input'
import { NOT_FOUND_HINT } from './track-refusal'
import type { TrackOrder } from './use-track-order'

// The tracking form (order digest §3.1.8): the order code and the mobile, the buyer's or the
// receiver's (said under the field). It never submits natively (AuthForm: a GET would put both in
// the URL); the button is disabled until the page has hydrated, then sends one lookup per press
// (use-track-order.ts) and waits out a 429. Neither field is remembered by the browser
// (`autocomplete="off"`: a shared device) nor kept by the page. The first field in error takes
// the focus; a whole-form message (not found, a wait, no answer) is an alert above the button.

export interface TrackPrefill {
  code: string
  /** Grows with each prefill (the same code again still asks for the mobile). */
  seq: number
}

export interface TrackFormProps {
  tracking: TrackOrder
  /** The code handed over by the page before (track-handoff.ts), or ''. */
  initialCode: string
  /** A recent order tapped: its code in, the mobile asked for. */
  prefill: TrackPrefill | null
  support: SupportLine | null
}

export function TrackForm({ tracking, initialCode, prefill, support }: TrackFormProps) {
  const [code, setCode] = useState(initialCode)
  const [mobile, setMobile] = useState('')
  const container = useRef<HTMLDivElement>(null)
  const mobileInput = useRef<HTMLInputElement>(null)
  const lock = useSubmitWait(tracking.wait)
  useFormFocus(container, tracking.attempt)

  const [taken, setTaken] = useState(prefill?.seq ?? 0)
  if (prefill && prefill.seq !== taken) {
    setTaken(prefill.seq)
    setCode(prefill.code)
  }
  useEffect(() => {
    if (prefill) mobileInput.current?.focus()
  }, [prefill])

  const edit = (field: TrackField, value: string) => {
    if (field === 'order_code') setCode(value)
    else setMobile(value)
    tracking.edit(field)
  }

  const { alert, errors } = tracking
  return (
    <div ref={container} className="flex flex-col gap-5">
      <AuthForm
        className="gap-5"
        onSubmit={() => tracking.track({ orderCode: code, mobile }, lock.locked)}
      >
        <Field label="کد سفارش" error={errors.order_code} required>
          <Input
            name="order-code"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            enterKeyHint="next"
            maxLength={20}
            value={code}
            onChange={(event) => edit('order_code', event.currentTarget.value)}
          />
        </Field>
        <Field
          label="شمارهٔ موبایل"
          hint="شمارهٔ موبایل خریدار یا گیرندهٔ سفارش"
          error={errors.mobile_number}
          required
        >
          <Input
            ref={mobileInput}
            name="order-mobile"
            type="tel"
            dir="ltr"
            inputMode="tel"
            autoComplete="off"
            enterKeyHint="search"
            maxLength={20}
            value={mobile}
            onChange={(event) => edit('mobile_number', event.currentTarget.value)}
          />
        </Field>
        {alert && (
          <FormAlert
            action={
              alert.kind === 'not_found' ? (
                <p className="text-base leading-7 font-normal text-ink-800">
                  {NOT_FOUND_HINT}
                  {support && (
                    <>
                      {' پشتیبانی: '}
                      <a
                        href={`tel:${support.tel}`}
                        dir="ltr"
                        className="inline-flex min-h-11 items-center font-bold text-brand-700 hover:underline"
                      >
                        {support.shown}
                      </a>
                    </>
                  )}
                </p>
              ) : undefined
            }
          >
            {alert.message}
          </FormAlert>
        )}
        <SubmitButton busy={tracking.busy} lock={lock}>
          پیگیری سفارش
        </SubmitButton>
      </AuthForm>
    </div>
  )
}
