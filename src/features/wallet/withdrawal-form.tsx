'use client'

import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { AuthForm } from '@/components/form/auth-form'
import { useSubmitWait } from '@/components/form/code-timers'
import { FormAlert } from '@/components/form/form-alert'
import { SubmitButton } from '@/components/form/submit-button'
import { Field } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import type { WalletBalance } from '@/lib/api/types/payment'
import { toPersianDigits } from '@/lib/format/digits'
import { amountDigits, groupDigits } from './amount-input'
import { cardDigits, groupCard, groupSheba, shebaDigits } from './bank-account'
import { regroupField, type DigitField } from './digit-field'
import { useWithdrawalRequest, type WithdrawalOutcome } from './use-withdrawal-request'
import {
  EMPTY_WITHDRAWAL,
  HOLDER_MAX,
  withdrawalBody,
  withdrawalErrors,
  withdrawalHint,
  type WithdrawalValues,
} from './withdrawal-input'
import type { WithdrawalErrors, WithdrawalField } from './withdrawal-refusal'

// «درخواست برداشت» (order digest §3.3.4, §7): the amount (both bounds said), the sheba as «IR»
// and 24 digits typed or pasted any way (left to right, digits), the account holder, the
// optional card number; when it is paid. Checked here first (the sheba's checksum, the card's
// Luhn digit), then sent once (`useWithdrawalRequest`); errors under their fields, the first
// invalid field focused. Its own chunk: loaded on the first «درخواست برداشت جدید».

const FIELDS: Record<'amount' | 'sheba' | 'card', DigitField> = {
  amount: { digits: amountDigits, show: groupDigits },
  sheba: { digits: shebaDigits, show: groupSheba },
  card: { digits: cardDigits, show: groupCard },
}

const ORDER: WithdrawalField[] = ['amount', 'holder', 'iban', 'card']

export interface WithdrawalFormProps extends WithdrawalOutcome {
  wallet: WalletBalance
}

export function WithdrawalForm({ wallet, ...outcome }: WithdrawalFormProps) {
  const request = useWithdrawalRequest(wallet, outcome)
  const lock = useSubmitWait(request.wait)
  const [values, setValues] = useState<WithdrawalValues>(EMPTY_WITHDRAWAL)
  const [checked, setChecked] = useState<WithdrawalErrors>({})
  const [attempt, setAttempt] = useState(0)
  const form = useRef<HTMLDivElement>(null)
  const errors: WithdrawalErrors = { ...request.errors, ...checked }

  // After a refusal (here or by the API), the first field in error takes the focus.
  const focusTurn = attempt + request.refusals
  useEffect(() => {
    if (focusTurn === 0) return
    form.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus()
  }, [focusTurn])

  const edit = (field: WithdrawalField, next: Partial<WithdrawalValues>) => {
    setValues((current) => ({ ...current, ...next }))
    setChecked((current) => ({ ...current, [field]: undefined }))
    request.clear(field)
  }
  const digits =
    (name: keyof typeof FIELDS, field: WithdrawalField) =>
    (event: ChangeEvent<HTMLInputElement>) => {
      const input = event.currentTarget
      const next = regroupField(
        input.value,
        input.selectionStart ?? input.value.length,
        FIELDS[name],
      )
      edit(field, { [name]: next.text })
      requestAnimationFrame(() => {
        if (document.activeElement === input) input.setSelectionRange(next.caret, next.caret)
      })
    }

  const send = () => {
    if (request.busy || lock.locked) return
    const found = withdrawalErrors(values, wallet)
    setChecked(found)
    setAttempt((count) => count + 1)
    if (ORDER.some((field) => found[field])) return
    request.send(withdrawalBody(values))
  }

  return (
    <div ref={form}>
      <AuthForm onSubmit={send} className="gap-4">
        {errors.form && <FormAlert>{errors.form}</FormAlert>}
        <Field label="مبلغ برداشت" hint={withdrawalHint(wallet)} error={errors.amount} required>
          <Input
            name="withdrawal-amount"
            inputMode="numeric"
            autoComplete="off"
            value={values.amount}
            onChange={digits('amount', 'amount')}
            endAdornment={<span className="text-sm">تومان</span>}
          />
        </Field>
        <Field label="نام صاحب حساب" error={errors.holder} required>
          <Input
            name="withdrawal-holder"
            autoComplete="name"
            maxLength={HOLDER_MAX}
            value={values.holder}
            onChange={(event) => edit('holder', { holder: event.currentTarget.value })}
          />
        </Field>
        <Field
          label="شماره شبا"
          hint="۲۴ رقم پس از IR؛ می‌توانید آن را با فاصله یا خط تیره هم بچسبانید."
          error={errors.iban}
          required
        >
          <Input
            name="withdrawal-iban"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            spellCheck={false}
            value={values.sheba}
            onChange={digits('sheba', 'iban')}
            startAdornment={<span className="font-medium text-ink-700">IR</span>}
            inputClassName="tabular-nums"
          />
        </Field>
        <Field
          label={
            <>
              شماره کارت <span className="font-normal text-ink-600">(اختیاری)</span>
            </>
          }
          hint="۱۶ رقم کارت همین حساب، برای اطمینان از درستی آن."
          error={errors.card}
        >
          <Input
            name="withdrawal-card"
            dir="ltr"
            inputMode="numeric"
            autoComplete="off"
            value={values.card}
            onChange={digits('card', 'card')}
            inputClassName="tabular-nums tracking-wide"
          />
        </Field>
        <p className="text-sm leading-6 text-ink-600">
          {`مبلغ همین حالا از موجودی کسر و کنار گذاشته می\u{200C}شود و درخواست حداکثر ظرف ${toPersianDigits(wallet.withdrawal_processing_days)} روز کاری بررسی و به حساب شما پرداخت می\u{200C}شود. تا پیش از بررسی می\u{200C}توانید آن را لغو کنید.`}
        </p>
        <SubmitButton busy={request.busy} lock={lock}>
          {request.busy ? 'در حال ثبت درخواست…' : 'ثبت درخواست برداشت'}
        </SubmitButton>
      </AuthForm>
    </div>
  )
}
