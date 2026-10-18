'use client'

import { CircleAlert } from 'lucide-react'
import { useId } from 'react'
import { STEP_CONTROLS } from '@/features/checkout/step-controls'
import type { BankCard } from '@/lib/api/types/payment'
import { toPersianDigits } from '@/lib/format/digits'
import { VisuallyHidden } from '@/components/ui/visually-hidden'
import { cardDigits } from './destination-card'

// Which of the shop's cards the money went to (the receipt's `destination_card`): one radio per
// card read, named by its bank and its last four digits; the form chooses the only card when there
// is one. The radio group comes with the checkout's set of controls (step-controls.ts: taking it
// alone would split a chunk the catalog's filters share).

const { RadioGroup, RadioGroupItem } = STEP_CONTROLS

export interface DestinationChoiceProps {
  /** The group's id (the form focuses its chosen, or first, radio). */
  id: string
  cards: BankCard[]
  value: number | null
  onChange: (id: number) => void
  error?: string
  disabled?: boolean
}

export function DestinationChoice({
  id,
  cards,
  value,
  onChange,
  error,
  disabled,
}: DestinationChoiceProps) {
  const baseId = useId()
  const legendId = `${baseId}legend`
  const errorId = error ? `${baseId}error` : undefined
  return (
    <div className="flex flex-col gap-2">
      <span id={legendId} className="text-base font-medium text-ink-800">
        کارتی که به آن واریز کردید{' '}
        <span aria-hidden className="text-danger">
          *
        </span>
        <VisuallyHidden>(الزامی)</VisuallyHidden>
      </span>
      <RadioGroup
        id={id}
        aria-labelledby={legendId}
        aria-describedby={errorId}
        aria-invalid={error ? true : undefined}
        aria-required
        disabled={disabled}
        value={value === null ? '' : String(value)}
        onValueChange={(next) => onChange(Number(next))}
        className="grid gap-2 sm:grid-cols-2"
      >
        {cards.map((card) => (
          <RadioGroupItem
            key={card.id}
            value={String(card.id)}
            variant="card"
            label={
              <>
                {card.bank_name}{' '}
                <bdi dir="ltr" className="tabular-nums">
                  {toPersianDigits(`${cardDigits(card.card_number).slice(-4)}`)}
                </bdi>
              </>
            }
            description={`به نام ${card.holder_name}`}
          />
        ))}
      </RadioGroup>
      {error && (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-sm leading-6 font-medium text-danger"
        >
          <CircleAlert aria-hidden className="mt-1 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </div>
  )
}
