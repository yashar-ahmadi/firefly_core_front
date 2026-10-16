'use client'

import { CircleAlert, CircleMinus, CirclePlus, Plus, Star, X } from 'lucide-react'
import { useEffect, useId, useRef, type KeyboardEvent } from 'react'
import { Button } from '@/components/ui/button'
import { cn } from '@/components/ui/cn'
import { IconButton } from '@/components/ui/icon-button'
import { Input } from '@/components/ui/input'
import { formatNumber } from '@/lib/format'
import { MAX_POINT_LENGTH, MAX_POINTS } from './comment-payload'

// The fields only a root review has: the star rating and the pros and cons lists.

const LEVELS = ['خیلی بد', 'بد', 'معمولی', 'خوب', 'عالی'] as const
const OPTIONAL = '(اختیاری)'

function FieldError({ id, message }: { id: string; message: string }) {
  return (
    <p id={id} className="flex items-start gap-1.5 text-sm leading-6 font-medium text-danger">
      <CircleAlert aria-hidden className="mt-1 size-4 shrink-0" />
      <span>{message}</span>
    </p>
  )
}

export interface StarRatingInputProps {
  value: number | null
  onChange: (value: number | null) => void
  error?: string
}

/**
 * «امتیاز شما»: five native radios drawn as 44px stars (arrow keys move the choice), filled up
 * to the choice, with its word beside them. Optional: «حذف امتیاز» takes it back (never 0).
 */
export function StarRatingInput({ value, onChange, error }: StarRatingInputProps) {
  const name = useId()
  const errorId = `${name}error`
  return (
    <fieldset aria-describedby={error ? errorId : undefined} className="flex flex-col gap-1.5">
      <legend className="mb-1.5 text-base font-medium text-ink-800">
        امتیاز شما <span className="font-normal text-ink-600">{OPTIONAL}</span>
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
          <>
            <span className="text-base font-medium text-ink-800">{LEVELS[value - 1]}</span>
            <Button variant="link" onClick={() => onChange(null)} className="text-base">
              حذف امتیاز
            </Button>
          </>
        )}
      </div>
      {error && <FieldError id={errorId} message={error} />}
    </fieldset>
  )
}

/** The two point lists: their label, and an icon that tells them apart without colour. */
export const POINTS = {
  positive: {
    label: 'نقاط قوت',
    add: 'افزودن نقطه\u{0654} قوت',
    Icon: CirclePlus,
    tone: 'text-success',
  },
  negative: {
    label: 'نقاط ضعف',
    add: 'افزودن نقطه\u{0654} ضعف',
    Icon: CircleMinus,
    tone: 'text-danger',
  },
} as const

export interface PointsInputProps {
  kind: keyof typeof POINTS
  points: readonly string[]
  /** What is typed in the box, not added yet. */
  draft: string
  onChange: (points: string[], draft: string) => void
  error?: string
}

/**
 * «نقاط قوت» or «نقاط ضعف»: a box and «افزودن» (Enter adds too), the added points as a list,
 * each with a 44px remove button. Up to ten; a repeat is not added twice. Pros and cons differ
 * by icon (plus, minus) as well as colour.
 */
export function PointsInput({ kind, points, draft, onChange, error }: PointsInputProps) {
  const { label, add, Icon, tone } = POINTS[kind]
  const id = useId()
  const full = points.length >= MAX_POINTS
  const hintId = `${id}hint`
  const errorId = `${id}error`
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  // Where the focus goes once the list has changed: a remove button (by index) or the box. The
  // removed button, or the box disabled at ten, would otherwise drop it to <body>.
  const pendingFocus = useRef<number | 'input' | null>(null)

  useEffect(() => {
    const target = pendingFocus.current
    if (target === null) return
    pendingFocus.current = null
    if (target === 'input') inputRef.current?.focus()
    else listRef.current?.querySelectorAll('button')[target]?.focus()
  }, [points])

  const addDraft = () => {
    const text = draft.trim()
    if (!text || full) return
    const next = points.includes(text) ? [...points] : [...points, text]
    if (next.length >= MAX_POINTS) pendingFocus.current = next.length - 1
    onChange(next, '')
  }
  const remove = (index: number) => {
    // The next point's button (the previous one for the last), or the box when none is left.
    pendingFocus.current = points.length > 1 ? Math.min(index, points.length - 2) : 'input'
    onChange(
      points.filter((_, kept) => kept !== index),
      draft,
    )
  }
  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter' || event.nativeEvent.isComposing) return
    event.preventDefault()
    addDraft()
  }

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`${id}input`} className="text-base font-medium text-ink-800">
        {label} <span className="font-normal text-ink-600">{OPTIONAL}</span>
      </label>
      <div className="flex gap-2">
        <Input
          ref={inputRef}
          id={`${id}input`}
          value={draft}
          maxLength={MAX_POINT_LENGTH}
          disabled={full}
          onChange={(event) => onChange([...points], event.target.value)}
          onKeyDown={onKeyDown}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${hintId} ${errorId}` : hintId}
          startAdornment={<Icon aria-hidden className={tone} />}
          className="min-w-0 flex-1"
        />
        <Button
          variant="outline"
          aria-label={add}
          disabled={full || !draft.trim()}
          onClick={addDraft}
          iconStart={<Plus aria-hidden />}
          className="px-4"
        >
          افزودن
        </Button>
      </div>
      <p id={hintId} className="text-sm leading-6 text-ink-600">
        {full
          ? `حداکثر ${formatNumber(MAX_POINTS)} مورد اضافه شده است.`
          : 'هر مورد را جدا بنویسید و «افزودن» را بزنید.'}
      </p>
      {error && <FieldError id={errorId} message={error} />}
      {points.length > 0 && (
        <ul ref={listRef} aria-label={label} className="flex flex-wrap gap-2">
          {points.map((point, index) => (
            <li
              key={point}
              className="flex max-w-full items-center gap-1.5 rounded-pill border border-ink-200 bg-ink-50 ps-3"
            >
              <Icon aria-hidden className={cn('size-4 shrink-0', tone)} />
              <span dir="auto" className="min-w-0 text-base break-words text-ink-800">
                {point}
              </span>
              <IconButton
                label={`حذف «${point}»`}
                icon={<X aria-hidden />}
                onClick={() => remove(index)}
              />
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
