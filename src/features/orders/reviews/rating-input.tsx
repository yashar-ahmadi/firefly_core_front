'use client'

import { CircleAlert, Star } from 'lucide-react'
import { useId } from 'react'
import { cn } from '@/components/ui/cn'
import { formatNumber } from '@/lib/format'

// A purchase review's rating (order digest §3.1.7: required, 1 to 5): five native radios drawn
// as 44px stars (arrow keys move the choice, as in any radio group), filled up to the choice, with
// its word beside them, in a radiogroup named «امتیاز شما» and marked required. Unlike the product
// page's optional rating (review-fields.tsx), there is no way to take it back. In error the group
// is invalid and described by the message, and its stars carry `data-invalid` (the form sends the
// focus to the first). Its own module: the product page's chunks stay as they are.

const LEVELS = ['خیلی بد', 'بد', 'معمولی', 'خوب', 'عالی'] as const

export interface RatingInputProps {
  value: number | null
  onChange: (value: number) => void
  error?: string
}

export function RatingInput({ value, onChange, error }: RatingInputProps) {
  const name = useId()
  const legendId = `${name}legend`
  const errorId = `${name}error`
  return (
    <fieldset
      role="radiogroup"
      aria-labelledby={legendId}
      aria-required
      aria-invalid={error ? true : undefined}
      aria-describedby={error ? errorId : undefined}
      className="flex flex-col gap-1.5"
    >
      <legend id={legendId} className="mb-1.5 text-base font-medium text-ink-800">
        امتیاز شما{' '}
        <span aria-hidden className="text-danger">
          *
        </span>
        <span className="sr-only">(الزامی)</span>
      </legend>
      <div className="flex flex-wrap items-center gap-x-3">
        <div className="-ms-1.5 flex">
          {LEVELS.map((level, index) => {
            const score = index + 1
            return (
              <label
                key={score}
                className="group relative grid size-11 cursor-pointer place-items-center rounded-full has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-(--focus) has-[:focus-visible]:outline-solid"
              >
                <input
                  type="radio"
                  name={name}
                  value={score}
                  checked={value === score}
                  onChange={() => onChange(score)}
                  aria-label={`${formatNumber(score)} ستاره: ${level}`}
                  data-invalid={error ? '' : undefined}
                  className="peer sr-only"
                />
                <Star
                  aria-hidden
                  className={cn(
                    'size-8 transition-colors',
                    value !== null && score <= value
                      ? 'fill-accent-400 text-accent-500'
                      : 'fill-transparent text-ink-400 group-hover:text-accent-500',
                  )}
                />
              </label>
            )
          })}
        </div>
        {value !== null && (
          <span className="text-base font-medium text-ink-800">{LEVELS[value - 1]}</span>
        )}
      </div>
      {error && (
        <p
          id={errorId}
          className="flex items-start gap-1.5 text-sm leading-6 font-medium text-danger"
        >
          <CircleAlert aria-hidden className="mt-1 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  )
}
