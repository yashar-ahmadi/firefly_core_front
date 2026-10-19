'use client'

import { CircleAlert } from 'lucide-react'
import { useId, useState, type ReactNode } from 'react'
import { toPersianDigits } from '@/lib/format/digits'
import {
  JALALI_MONTHS,
  jalaliMonthLength,
  tehranDateTime,
  tehranIso,
  type TehranDateTime,
} from '@/lib/format/jalali-calendar'
import { cn } from './cn'
import { Select } from './select'
import { VisuallyHidden } from './visually-hidden'

// A date and a time of day on the Jalali calendar, in Tehran (src/lib/format/jalali-calendar.ts),
// written as the API reads it: «2026-10-15T15:00:00+03:30». Native selects (the phone's own
// picker, the keyboard's arrows and type-ahead, read out by every screen reader): day, month by
// its Persian name and year, read right to left as «۲۳ مهر ۱۴۰۵», then the hour and the minute,
// left to right as a clock reads. Only the days the chosen month has are offered: a month or a
// year that has fewer moves the day back to its last one. Controlled: `value` is an ISO string,
// `onChange` gets the next one.

export interface JalaliDateTimeInputProps {
  legend: ReactNode
  /** An instant (ISO 8601); shown as Tehran's date and time. */
  value: string
  onChange: (iso: string) => void
  /** The years offered: this one's in Tehran and the one before it. Default: now. */
  now?: Date
  hint?: ReactNode
  /** Marks every control invalid and describes them with it. */
  error?: ReactNode
  required?: boolean
  /** The first control's (the day's) id, for a form that focuses its first invalid field. */
  id?: string
  disabled?: boolean
}

const range = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, index) => from + index)
const twoDigits = (value: number) => toPersianDigits(String(value).padStart(2, '0'))

function partsOf(value: string, fallback: Date): TehranDateTime {
  const instant = new Date(value)
  return tehranDateTime(Number.isNaN(instant.getTime()) ? fallback : instant)
}

export function JalaliDateTimeInput({
  legend,
  value,
  onChange,
  now,
  hint,
  error,
  required = false,
  id,
  disabled,
}: JalaliDateTimeInputProps) {
  const baseId = useId()
  // The offered years stay those of the first render, whatever is chosen since.
  const [today] = useState(() => now ?? new Date())
  const parts = partsOf(value, today)
  const thisYear = tehranDateTime(today).jy
  const years = range(Math.min(thisYear - 1, parts.jy), Math.max(thisYear, parts.jy))
  const hintId = hint ? `${baseId}hint` : undefined
  const errorId = error ? `${baseId}error` : undefined
  const describedBy = [hintId, errorId].filter(Boolean).join(' ') || undefined

  function change(key: keyof TehranDateTime, raw: string) {
    const next = { ...parts, [key]: Number(raw) }
    next.jd = Math.min(next.jd, jalaliMonthLength(next.jy, next.jm))
    onChange(tehranIso(next))
  }

  const control = (key: keyof TehranDateTime, label: string, choices: ReactNode) => {
    const controlId = key === 'jd' && id ? id : `${baseId}${key}`
    return (
      // Each cell reads right to left, whatever order its row keeps (the time's is a clock's).
      <div dir="rtl" className="flex min-w-0 flex-col gap-1">
        <label htmlFor={controlId} className="text-sm leading-6 text-ink-700">
          {label}
        </label>
        <Select
          id={controlId}
          value={String(parts[key])}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy}
          onChange={(event) => change(key, event.currentTarget.value)}
        >
          {choices}
        </Select>
      </div>
    )
  }

  const numbers = (values: number[], show: (value: number) => string = toPersianDigits) =>
    values.map((option) => (
      <option key={option} value={option}>
        {show(option)}
      </option>
    ))

  return (
    // The hint and the error describe each control, not the group as well (read twice).
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-1.5 text-base font-medium text-ink-800">
        {legend}
        {required && (
          <>
            {' '}
            <span aria-hidden className="text-danger">
              *
            </span>
            <VisuallyHidden>(الزامی)</VisuallyHidden>
          </>
        )}
      </legend>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
        {/* Day and month, then the year, on phones: three in a row there leave the day's
            select no room for two digits beside its chevron. */}
        <div className="grid flex-[3] grid-cols-2 gap-2 sm:grid-cols-[1fr_1.6fr_1.3fr]">
          {control('jd', 'روز', numbers(range(1, jalaliMonthLength(parts.jy, parts.jm))))}
          {control(
            'jm',
            'ماه',
            JALALI_MONTHS.map((name, index) => (
              <option key={name} value={index + 1}>
                {name}
              </option>
            )),
          )}
          {control('jy', 'سال', numbers(years))}
        </div>
        <div dir="ltr" className="grid flex-[2] grid-cols-2 gap-2">
          {control('hour', 'ساعت', numbers(range(0, 23), twoDigits))}
          {control('minute', 'دقیقه', numbers(range(0, 59), twoDigits))}
        </div>
      </div>
      {hint && (
        <p id={hintId} className="text-sm leading-6 text-ink-500">
          {hint}
        </p>
      )}
      {error && (
        <p
          id={errorId}
          className={cn('flex items-start gap-1.5 text-sm leading-6 font-medium text-danger')}
        >
          <CircleAlert aria-hidden className="mt-1 size-4 shrink-0" />
          <span>{error}</span>
        </p>
      )}
    </fieldset>
  )
}
