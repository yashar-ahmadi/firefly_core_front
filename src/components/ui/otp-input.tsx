'use client'

import { useEffect, useLayoutEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react'
import { toLatinDigits, toPersianDigits } from '@/lib/format'
import { cn } from './cn'
import { controlClasses } from './control-styles'

export interface OtpInputProps {
  length?: number
  /** The code typed so far, in Latin digits. */
  value: string
  onChange: (value: string) => void
  /** Called with the full code (Latin digits) when the last box is filled. */
  onComplete?: (code: string) => void
  autoFocus?: boolean
  disabled?: boolean
  invalid?: boolean
  /** Name of the group (default «کد تأیید»). */
  'aria-label'?: string
  'aria-describedby'?: string
  className?: string
}

/** Persian, Arabic-Indic or Latin input -> Latin digits only. */
function digitsOf(text: string): string {
  return toLatinDigits(text).replace(/\D/g, '')
}

/**
 * One box per digit, always left-to-right. Typing advances, Backspace goes back, a paste or an
 * SMS autofill fills every box. Boxes show Persian digits; `onChange` gets Latin digits.
 */
export function OtpInput({
  length = 6,
  value,
  onChange,
  onComplete,
  autoFocus = false,
  disabled = false,
  invalid = false,
  'aria-label': ariaLabel = 'کد تأیید',
  'aria-describedby': describedBy,
  className,
}: OtpInputProps) {
  const boxes = useRef<Array<HTMLInputElement | null>>([])
  // Focus moves after the parent re-renders with the new value, so handlers see fresh state.
  const pendingFocus = useRef<number | null>(null)
  // Set by pointerdown, so onFocus can tell a click or tap from keyboard focus.
  const pointerDown = useRef(false)
  const code = digitsOf(value).slice(0, length)
  // Roving tab stop: only the first empty box (or the last one when full) is in the tab order,
  // so Tab enters the group once and the next Tab leaves it.
  const active = Math.min(code.length, length - 1)

  function focusBox(index: number) {
    boxes.current[Math.max(0, Math.min(index, length - 1))]?.focus()
  }

  useEffect(() => {
    if (autoFocus) boxes.current[0]?.focus()
  }, [autoFocus])

  useLayoutEffect(() => {
    if (pendingFocus.current === null) return
    const index = pendingFocus.current
    pendingFocus.current = null
    focusBox(index)
  })

  function commit(next: string, focusIndex: number) {
    const clipped = next.slice(0, length)
    if (clipped === code) {
      focusBox(focusIndex)
    } else {
      pendingFocus.current = focusIndex
      onChange(clipped)
    }
    if (clipped.length === length && clipped !== code) onComplete?.(clipped)
  }

  /** Writes `incoming` digits starting at box `index` (typing, paste or autofill). */
  function fill(index: number, incoming: string) {
    const start = incoming.length >= length ? 0 : Math.min(index, code.length)
    const next = code.slice(0, start) + incoming + code.slice(start + incoming.length)
    commit(next, start + incoming.length)
  }

  function handleChange(index: number, raw: string) {
    const typed = digitsOf(raw)
    const current = code[index]
    if (typed.length === 0) {
      // Deleted (or a non-digit was typed): drop this box's digit, if any.
      if (current !== undefined) commit(code.slice(0, index) + code.slice(index + 1), index)
      return
    }
    // The caret may sit after an existing digit, so «old + new» arrives: keep the new one.
    const incoming =
      typed.length === 2 && current !== undefined && typed.includes(current)
        ? typed.replace(current, '')
        : typed
    fill(index, incoming)
  }

  function handleKeyDown(index: number, event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Backspace' && code[index] === undefined && index > 0) {
      event.preventDefault()
      commit(code.slice(0, index - 1) + code.slice(index), index - 1)
    } else if (event.key === 'ArrowLeft') {
      event.preventDefault()
      focusBox(index - 1)
    } else if (event.key === 'ArrowRight') {
      event.preventDefault()
      focusBox(Math.min(index + 1, code.length))
    }
  }

  function handlePaste(index: number, event: ClipboardEvent<HTMLInputElement>) {
    event.preventDefault()
    const pasted = digitsOf(event.clipboardData.getData('text')).slice(0, length)
    if (pasted) fill(index, pasted)
  }

  return (
    <div
      role="group"
      dir="ltr"
      aria-label={ariaLabel}
      aria-describedby={describedBy}
      className={cn('flex justify-start gap-2 sm:gap-3', className)}
    >
      {Array.from({ length }, (_, index) => (
        <input
          key={index}
          ref={(node) => {
            boxes.current[index] = node
          }}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-label={`رقم ${toPersianDigits(index + 1)}`}
          aria-invalid={invalid || undefined}
          disabled={disabled}
          tabIndex={index === active ? 0 : -1}
          value={toPersianDigits(code[index] ?? '')}
          onPointerDown={() => {
            pointerDown.current = true
          }}
          // Boxes are filled in order: clicking a later empty box moves to the first empty one.
          onFocus={(event) => {
            const fromPointer = pointerDown.current
            pointerDown.current = false
            if (fromPointer && index > code.length) focusBox(code.length)
            else event.currentTarget.select()
          }}
          onChange={(event) => handleChange(index, event.currentTarget.value)}
          onKeyDown={(event) => handleKeyDown(index, event)}
          onPaste={(event) => handlePaste(index, event)}
          className={cn(
            controlClasses({ invalid, disabled }),
            'h-12 w-full max-w-12 min-w-0 flex-1 border-2 p-0 text-center text-xl font-bold caret-brand-600 sm:h-14 sm:max-w-14 sm:text-2xl',
            code[index] !== undefined && !invalid && 'border-ink-700',
          )}
        />
      ))}
    </div>
  )
}
