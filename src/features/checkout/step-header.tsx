'use client'

import { Check, Lock, Pencil } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { toPersianDigits } from '@/lib/format'
import type { CheckoutStep, StepState } from './checkout-steps'

// One step of the checkout (spec §8.7): a `section` named by its numbered heading. The active
// step is open; a done one shows what was chosen in a line and «ویرایش» to open it again; a
// later one waits, its heading only. Headings take the focus when their step becomes the active
// one (from code: `stepHeadingId`).

/** The id of a step's heading: the focus goes there when the step opens. */
export const stepHeadingId = (step: CheckoutStep) => `checkout-step-${step}`

const STATE_WORDS: Record<StepState, string> = {
  done: '(انجام شد)',
  active: '(مرحله\u{0654} کنونی)',
  locked: '(پس از مرحله\u{0654} قبل)',
}

export interface StepSectionProps {
  step: CheckoutStep
  number: number
  title: string
  state: StepState
  /** What was chosen, in a line (a done step). */
  summary?: ReactNode
  /** Opens a done step again; none: it cannot be (a step locked by the cart). */
  onEdit?: () => void
  children?: ReactNode
}

export function StepSection({
  step,
  number,
  title,
  state,
  summary,
  onEdit,
  children,
}: StepSectionProps) {
  const headingId = stepHeadingId(step)
  return (
    <section
      aria-labelledby={headingId}
      data-step={step}
      data-state={state}
      className={cn(
        'rounded-card bg-white p-4 shadow-card md:p-6',
        state === 'locked' && 'bg-ink-50',
      )}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span
          aria-hidden
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-full text-base font-bold',
            state === 'done' && 'bg-success/10 text-success',
            state === 'active' && 'bg-brand text-brand-fg',
            state === 'locked' && 'bg-ink-100 text-ink-600',
          )}
        >
          {state === 'done' ? <Check className="size-5" /> : toPersianDigits(number)}
        </span>
        <h2
          id={headingId}
          tabIndex={-1}
          className={cn(
            'min-w-0 flex-1 text-lg leading-8 font-bold outline-none',
            state === 'locked' ? 'text-ink-600' : 'text-ink-900',
          )}
        >
          <span className="sr-only">{`${toPersianDigits(number)} `}</span>
          {title}
          <span className="sr-only"> {STATE_WORDS[state]}</span>
        </h2>
        {state === 'locked' && <Lock aria-hidden className="size-5 text-ink-500" />}
        {state === 'done' && onEdit && (
          <Button
            variant="ghost"
            size="sm"
            iconStart={<Pencil aria-hidden />}
            onClick={onEdit}
            className="text-brand-700"
          >
            ویرایش <span className="sr-only">{title}</span>
          </Button>
        )}
      </div>
      {state === 'done' && summary && (
        <div className="mt-2 ps-12 text-base leading-7 text-ink-700">{summary}</div>
      )}
      {state === 'active' && <div className="mt-4">{children}</div>}
    </section>
  )
}
