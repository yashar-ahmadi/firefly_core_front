'use client'

import { useEffect, useEffectEvent, useId, useRef, useState } from 'react'
import { AuthForm } from '@/components/form/auth-form'
import { FormAlert } from '@/components/form/form-alert'
import { SubmitButton } from '@/components/form/submit-button'
import { Field } from '@/components/ui/field'
import { JalaliDateTimeInput } from '@/components/ui/jalali-date-time-input'
import { STEP_CONTROLS } from '@/features/checkout/step-controls'
import type { BankCard } from '@/lib/api/types/payment'
import { tehranDateTime, tehranIso } from '@/lib/format/jalali-calendar'
import { DestinationChoice } from './destination-choice'
import { ReceiptImageField } from './receipt-image-field'
import { probeImage } from './receipt-image'
import { FORM_HEADING, UPLOADING } from './transfer-copy'
import { useReceiptSubmit, type ChosenImage, type ReceiptHandlers } from './use-receipt-submit'
import {
  BANK_REFERENCE_MAX,
  imageError,
  PAYER_NAME_MAX,
  type ReceiptField,
} from './validate-receipt'

// The receipt of a card transfer (order digest §5.7 step 3): the picture (with its preview), the
// payer's name, the source card's last four digits (any keyboard's digits), when the money was
// sent (the Jalali date and time, written at +03:30; now by default), which shop card it went to
// (the only one, chosen already) and, optional, the bank's reference, which speeds the review.
// The picture is checked as soon as it is chosen; everything at the press, the first field in
// error then taking the focus. The cards are the ones the page read (re-read after a card the
// API no longer takes: the choice is then asked for again unless a single card is left).

const { Input } = STEP_CONTROLS

/** The fields in the order they are on screen (the first in error takes the focus). */
const ORDER: ReceiptField[] = [
  'image',
  'payer_name',
  'payer_card_last_digits',
  'paid_at',
  'destination_card',
  'bank_reference',
]

export interface ReceiptFormProps extends ReceiptHandlers {
  uuid: string
  cards: BankCard[]
  /** The upload is on its way (the attempt's «انصراف» waits for it). */
  onBusyChange?: (busy: boolean) => void
}

export function ReceiptForm({ uuid, cards, onBusyChange, ...handlers }: ReceiptFormProps) {
  const baseId = useId()
  const ids: Record<ReceiptField, string> = {
    image: `${baseId}image`,
    payer_name: `${baseId}payer`,
    payer_card_last_digits: `${baseId}digits`,
    paid_at: `${baseId}paid`,
    destination_card: `${baseId}card`,
    bank_reference: `${baseId}reference`,
  }
  const [image, setImage] = useState<ChosenImage | null>(null)
  const latest = useRef<ChosenImage | null>(null)
  const [payerName, setPayerName] = useState('')
  const [lastDigits, setLastDigits] = useState('')
  const [paidAt, setPaidAt] = useState(() => tehranIso(tehranDateTime(new Date())))
  const [chosen, setChosen] = useState<number | null>(null)
  const [bankReference, setBankReference] = useState('')
  const { errors, alert, busy, attempt, lock, submit, setFieldError } = useReceiptSubmit(
    uuid,
    handlers,
  )
  // A card the cards read no longer has is chosen no more; a single card is chosen already.
  const destinationCard = cards.some((card) => card.id === chosen)
    ? chosen
    : cards.length === 1
      ? cards[0]!.id
      : null

  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange])
  useEffect(() => (image ? () => URL.revokeObjectURL(image.url) : undefined), [image])
  // After a refused press, the first field in error takes the focus (its message describes it).
  const focusFirstError = useEffectEvent(() => {
    const first = ORDER.find((field) => errors[field])
    const node = first ? document.getElementById(ids[first]) : null
    const target =
      first === 'destination_card'
        ? (node?.querySelector<HTMLElement>('[role="radio"][aria-checked="true"]') ??
          node?.querySelector<HTMLElement>('[role="radio"]'))
        : node
    target?.focus()
  })
  useEffect(() => {
    if (attempt > 0) focusFirstError()
  }, [attempt])

  function pick(file: File) {
    const url = URL.createObjectURL(file)
    const chosenImage = { file, url, probe: probeImage(file, url) }
    latest.current = chosenImage
    setImage(chosenImage)
    setFieldError('image')
    void chosenImage.probe.then((probe) => {
      if (latest.current !== chosenImage) return
      const problem = imageError({ type: file.type, size: file.size, probe })
      if (problem) setFieldError('image', problem)
    })
  }

  const edit = (field: ReceiptField, set: (value: string) => void) => (value: string) => {
    set(value)
    setFieldError(field)
  }

  return (
    <section aria-labelledby={`${baseId}heading`} className="flex flex-col gap-4">
      <h2 id={`${baseId}heading`} className="text-lg leading-8 font-bold text-ink-900">
        {FORM_HEADING}
      </h2>
      <AuthForm
        className="gap-5"
        onSubmit={() =>
          void submit({ image, payerName, lastDigits, paidAt, destinationCard, bankReference })
        }
      >
        <div className="flex flex-col gap-5">
          {alert && <FormAlert>{alert}</FormAlert>}
          <ReceiptImageField id={ids.image} picked={image} error={errors.image} onPick={pick} />
          <Field
            label="نام صاحب کارت مبدأ"
            hint="نام صاحب کارتی که با آن واریز کرده‌اید."
            error={errors.payer_name}
            required
          >
            <Input
              id={ids.payer_name}
              name="payer_name"
              autoComplete="cc-name"
              maxLength={PAYER_NAME_MAX}
              value={payerName}
              onChange={(event) => edit('payer_name', setPayerName)(event.currentTarget.value)}
            />
          </Field>
          <Field
            label="چهار رقم آخر کارت مبدأ"
            hint="چهار رقم آخر کارتی که مبلغ از آن واریز شده است."
            error={errors.payer_card_last_digits}
            required
          >
            <Input
              id={ids.payer_card_last_digits}
              name="payer_card_last_digits"
              inputMode="numeric"
              autoComplete="off"
              dir="ltr"
              className="max-w-40"
              value={lastDigits}
              onChange={(event) =>
                edit('payer_card_last_digits', setLastDigits)(event.currentTarget.value)
              }
            />
          </Field>
          <JalaliDateTimeInput
            id={ids.paid_at}
            legend="تاریخ و ساعت واریز"
            hint="زمانی که مبلغ را واریز کردید (به وقت تهران)."
            value={paidAt}
            error={errors.paid_at}
            required
            onChange={edit('paid_at', setPaidAt)}
          />
          <DestinationChoice
            id={ids.destination_card}
            cards={cards}
            value={destinationCard}
            error={errors.destination_card}
            onChange={(id) => {
              setChosen(id)
              setFieldError('destination_card')
            }}
          />
          <Field
            label="شمارهٔ پیگیری بانک (اختیاری)"
            hint="وارد کردن آن، بررسی رسید را سریع‌تر می‌کند."
            error={errors.bank_reference}
          >
            <Input
              id={ids.bank_reference}
              name="bank_reference"
              autoComplete="off"
              dir="ltr"
              maxLength={BANK_REFERENCE_MAX}
              value={bankReference}
              onChange={(event) =>
                edit('bank_reference', setBankReference)(event.currentTarget.value)
              }
            />
          </Field>
        </div>
        <SubmitButton busy={busy} lock={lock}>
          {busy ? UPLOADING : 'ثبت رسید'}
        </SubmitButton>
      </AuthForm>
    </section>
  )
}
